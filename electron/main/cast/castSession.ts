// Main-process side of casting: owns device discovery and the one active
// session, and reports status to the renderer. Two modes:
//
//   stream — the renderer records MCO's live output (effects, siren, the
//            visualizer picture) and feeds it in via writeChunk(); ffmpeg
//            turns it into a live stream the device plays a few seconds
//            behind. Used for TVs with "Show visualizer" on.
//   direct — the device plays each track file itself, fetched from
//            CastMediaServer, and MCO sends it play/pause/seek
//            commands (runDirect). Controls are near-instant (volume is
//            left to the TV remote / Google Home app), and the device
//            shows its own player, but MCO's effects aren't heard.
//            Used for speakers, and TVs with "Show visualizer" off.
//   receiver — direct mode, but in MCO's own receiver app on the TV
//            (cast-receiver/) instead of Google's player, talking over
//            MCO's own message channel. Beta.
//
// The renderer owns the other half of each (src/cast/castSession.ts,
// src/cast/directCast.ts).
import { CastClient, type CastMediaStatus } from './castClient'
import { CastDiscovery } from './castDiscovery'
import { CastStream, pickLocalAddress } from './castStream'
import { CastMediaServer, type MediaResolvers } from './castMediaServer'
import type { CastDevice, CastDirectCommand, CastMediaEvent, CastMode, CastStatus } from '../../../src/types'
import { RECEIVER_APP_ID, isReceiverStatus, type ReceiverSettingsMessage, type ToReceiver } from '../../../src/cast/receiverProtocol'

const STREAM_READY_TIMEOUT_MS = 20000
const READY_POLL_MS = 250
// Direct mode: how often the device's position is fetched, so MCO's
// (silent) player can stay in step with it.
const DIRECT_POSITION_POLL_MS = 2000

// MCO_CAST_DEBUG=1 logs every direct-mode command and why one was dropped.
const debug = (...args: unknown[]) => {
  if (process.env.MCO_CAST_DEBUG) console.log('[cast]', ...args)
}

export interface TrackInfo {
  title: string
  artist: string | null
  album: string | null
}

export interface DirectMediaSources extends MediaResolvers {
  describe: (trackId: number) => TrackInfo | null
}

interface ActiveSession {
  id: number
  mode: CastMode
  device: CastDevice
  client: CastClient
  localAddress: string | null
  // stream mode
  stream: CastStream | null
  // direct mode
  media: CastMediaServer | null
  mediaSessionId: number | null
  trackId: number | null
  commands: Promise<void>
  positionTimer: ReturnType<typeof setInterval> | null
}

export class CastController {
  private discovery: CastDiscovery
  private session: ActiveSession | null = null
  private nextSessionId = 1
  private status: CastStatus = { state: 'idle' }
  // The device of the latest session: a restart (e.g. switching mode) can
  // come just as a fresh scan has emptied the discovered list.
  private lastDevice: CastDevice | null = null

  constructor(
    sendDevices: (devices: CastDevice[]) => void,
    private readonly sendStatus: (status: CastStatus) => void,
    private readonly sendMedia: (event: CastMediaEvent) => void,
    private readonly sources: DirectMediaSources,
  ) {
    this.discovery = new CastDiscovery(sendDevices)
  }

  startDiscovery(): void {
    this.discovery.start()
  }

  stopDiscovery(): void {
    this.discovery.stop()
  }

  getStatus(): CastStatus {
    return this.status
  }

  // Resolves once MCO is ready: in stream mode, when the encoder and
  // server can take chunks (connecting to the device and loading the
  // stream carries on in the background, reported through status
  // updates); in direct mode, when the device's player is up and ready
  // for a track.
  async start(deviceId: string, mode: CastMode): Promise<void> {
    const device = this.discovery.get(deviceId) ?? (this.lastDevice?.id === deviceId ? this.lastDevice : undefined)
    if (!device) throw new Error('That device is no longer available')
    this.lastDevice = device
    // Replacing a running session (e.g. switching mode): no 'idle' in
    // between, or the renderer would tear down what it has just started
    // for the new one.
    this.stop(false)

    const id = this.nextSessionId++
    const session: ActiveSession = {
      id,
      mode,
      device,
      client: new CastClient(device.host, device.port),
      localAddress: pickLocalAddress(device.host),
      stream: null,
      media: null,
      mediaSessionId: null,
      trackId: null,
      commands: Promise.resolve(),
      positionTimer: null,
    }
    this.session = session
    this.setStatus(this.statusFor(session, 'connecting'))

    if (mode === 'stream') {
      session.stream = new CastStream((message) => this.endSession(id, message))
      try {
        await session.stream.start()
      } catch (err) {
        this.endSession(id, err instanceof Error ? err.message : String(err))
        throw err
      }
      void this.connectAndLoadStream(session)
      return
    }

    try {
      if (!session.localAddress) throw new Error("This Mac doesn't seem to be on a network")
      session.media = new CastMediaServer(this.sources)
      await session.media.start()
      this.watchClient(session)
      await session.client.connect()
      if (mode === 'receiver') {
        try {
          await session.client.launch(RECEIVER_APP_ID)
        } catch (err) {
          // The device doesn't (yet) accept MCO's app — e.g. it's not
          // registered for testing, or a new publish hasn't reached it.
          // Google's player does the same job, minus MCO's screens/effects.
          console.warn('cast: MCO receiver unavailable, using Google\'s player:', err instanceof Error ? err.message : err)
          session.mode = 'direct'
          await session.client.launch()
        }
      } else {
        await session.client.launch()
      }
    } catch (err) {
      this.endSession(id, err instanceof Error ? err.message : String(err))
      throw err
    }
    if (this.session !== session) return
    // MCO's receiver reports its position itself; Google's player has to
    // be asked.
    if (session.mode === 'direct') session.positionTimer = setInterval(() => this.pollPosition(session), DIRECT_POSITION_POLL_MS)
    this.setStatus(this.statusFor(session, 'casting'))
  }

  writeChunk(chunk: Uint8Array): void {
    this.session?.stream?.write(chunk)
  }

  // Direct mode: a command from MCO's player. Commands run one at a time,
  // in order, so a play or seek sent right after a load waits for it.
  runDirect(command: CastDirectCommand): void {
    const session = this.session
    debug('command', JSON.stringify(command), 'session mode:', session?.mode ?? 'none')
    if (!session || session.mode === 'stream') return
    session.commands = session.commands
      .then(() => this.execute(session, command))
      .catch((err) => console.error('cast command failed', command.type, err))
  }

  // Receiver mode: display, effects and siren updates from MCO's renderer.
  sendReceiverSettings(message: ReceiverSettingsMessage): void {
    const session = this.session
    if (!session || session.mode !== 'receiver') return
    try {
      session.client.sendToReceiver(message)
    } catch {
      // Not connected (yet) — the renderer resends everything once casting.
    }
  }

  stop(reportIdle = true): void {
    const session = this.session
    if (!session) return
    this.session = null
    this.release(session)
    if (reportIdle) {
      // Sends the TV back to its home screen.
      void session.client.stop()
      this.setStatus({ state: 'idle' })
    } else {
      // Being replaced: the next session LOADs into the same player on the
      // TV, which a late STOP for this one could shut down.
      session.client.close()
    }
  }

  isActive(): boolean {
    return this.session !== null
  }

  // For quitting: stops the session and waits (up to `timeoutMs`) for the
  // TV to be told, so it goes back to its home screen instead of being
  // left on a stream that's about to vanish.
  async shutdown(timeoutMs: number): Promise<void> {
    const session = this.session
    this.discovery.stop()
    if (!session) return
    this.session = null
    this.release(session)
    this.setStatus({ state: 'idle' })
    await Promise.race([session.client.stop(), new Promise((resolve) => setTimeout(resolve, timeoutMs))])
  }

  dispose(): void {
    this.stop()
    this.discovery.stop()
  }

  private async execute(session: ActiveSession, command: CastDirectCommand): Promise<void> {
    if (this.session !== session) return
    if (session.mode === 'receiver') {
      await this.executeOnReceiver(session, command)
      return
    }
    const { client, media, localAddress } = session
    if (command.type === 'load') {
      const info = this.sources.describe(command.trackId)
      if (!info || !media || !localAddress) {
        debug('load dropped:', { info: !!info, media: !!media, localAddress })
        return
      }
      session.trackId = command.trackId
      session.mediaSessionId = null
      const hasArtwork = (await this.sources.artwork(command.trackId)) !== null
      const track = await this.sources.track(command.trackId)
      if (!track || this.session !== session) {
        debug('load dropped: track file', track ? 'ok' : 'not servable', 'session current:', this.session === session)
        return
      }
      debug('loading', track.filePath, track.contentType, 'artwork:', hasArtwork)
      const status = await client.loadTrack({
        url: media.url(localAddress, 'track', command.trackId),
        contentType: track.contentType,
        title: info.title,
        artist: info.artist,
        album: info.album,
        imageUrl: hasArtwork ? media.url(localAddress, 'art', command.trackId) : null,
        startTime: command.position,
        autoplay: command.autoplay,
      })
      // A newer load may have been queued while this one was in flight.
      if (this.session !== session || session.trackId !== command.trackId) return
      session.mediaSessionId = status.mediaSessionId
      debug('loaded, media session', status.mediaSessionId, status.playerState)
      this.forwardMedia(session, status)
      return
    }
    const mediaSessionId = session.mediaSessionId
    if (mediaSessionId === null) return
    if (command.type === 'play') await client.play(mediaSessionId)
    else if (command.type === 'pause') await client.pause(mediaSessionId)
    else if (command.type === 'seek') await client.seek(mediaSessionId, command.position)
  }

  // Receiver mode: the same commands as MCO's own messages.
  private async executeOnReceiver(session: ActiveSession, command: CastDirectCommand): Promise<void> {
    const { client, media, localAddress } = session
    let message: ToReceiver
    if (command.type === 'load') {
      const info = this.sources.describe(command.trackId)
      if (!info || !media || !localAddress) return
      session.trackId = command.trackId
      const hasArtwork = (await this.sources.artwork(command.trackId)) !== null
      if (this.session !== session || session.trackId !== command.trackId) return
      message = {
        type: 'load',
        trackId: command.trackId,
        url: media.url(localAddress, 'track', command.trackId),
        artworkUrl: hasArtwork ? media.url(localAddress, 'art', command.trackId) : null,
        title: info.title,
        artist: info.artist,
        position: command.position,
        autoplay: command.autoplay,
      }
    } else {
      message = command
    }
    client.sendToReceiver(message)
  }

  private async pollPosition(session: ActiveSession): Promise<void> {
    if (this.session !== session || session.mediaSessionId === null) return
    const status = await session.client.getMediaStatus().catch(() => null)
    if (status && this.session === session) this.forwardMedia(session, status)
  }

  private forwardMedia(session: ActiveSession, status: CastMediaStatus): void {
    this.sendMedia({
      trackId: session.trackId,
      playerState: status.playerState,
      idleReason: status.idleReason,
      currentTime: status.currentTime,
    })
  }

  private watchClient(session: ActiveSession): void {
    const { id, client } = session
    client.on('error', (err: Error) => this.endSession(id, err.message))
    // The TV ended the session (turned off, switched app, someone else
    // cast to it) — not an error, just over.
    client.on('closed', () => this.endSession(id, null))
    client.on('receiver', (message: unknown) => {
      if (this.session !== session || !isReceiverStatus(message)) return
      if (message.idleReason === 'ERROR') {
        this.endSession(id, "The TV couldn't play this track")
        return
      }
      this.sendMedia({
        trackId: message.trackId,
        playerState: message.playerState,
        idleReason: message.idleReason,
        currentTime: message.currentTime,
      })
    })
    client.on('media', (status: CastMediaStatus) => {
      if (this.session !== session) return
      if (status.playerState !== 'IDLE') {
        if (session.mode === 'direct') this.forwardMedia(session, status)
        return
      }
      if (status.idleReason === 'ERROR') {
        console.error('cast: device playback error', status.errorDetail)
        this.endSession(id, session.mode === 'direct' ? "The TV couldn't play this track" : 'The TV hit a playback error')
      } else if (status.idleReason === 'CANCELLED') {
        // Stopped from the TV or the Google Home app.
        this.endSession(id, null)
      } else if (status.idleReason === 'FINISHED') {
        // A live stream only finishes when it's gone; a track finishing
        // is MCO's cue to move on.
        if (session.mode === 'stream') this.endSession(id, null)
        else this.forwardMedia(session, status)
      }
      // INTERRUPTED: replaced by the next LOAD — nothing to do.
    })
  }

  private async connectAndLoadStream(session: ActiveSession): Promise<void> {
    const { id, client } = session
    const stream = session.stream!
    this.watchClient(session)
    try {
      await client.connect()
      if (this.session !== session) return
      this.setStatus(this.statusFor(session, 'buffering'))

      const startedAt = Date.now()
      while (!stream.isReady()) {
        if (this.session !== session) return
        if (Date.now() - startedAt > STREAM_READY_TIMEOUT_MS) throw new Error('MCO did not produce any stream data')
        await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS))
      }

      const localAddress = session.localAddress
      if (!localAddress) throw new Error("This Mac doesn't seem to be on a network")
      await client.load({ url: stream.url(localAddress), contentType: stream.contentType, title: 'MCO' })
      if (this.session !== session) return
      this.setStatus(this.statusFor(session, 'casting'))
    } catch (err) {
      this.endSession(id, err instanceof Error ? err.message : String(err))
    }
  }

  private statusFor(session: ActiveSession, state: 'connecting' | 'buffering' | 'casting'): CastStatus {
    return { state, deviceName: session.device.name, audioOnly: session.device.audioOnly, mode: session.mode }
  }

  private release(session: ActiveSession): void {
    if (session.positionTimer) clearInterval(session.positionTimer)
    session.stream?.stop()
    session.media?.stop()
  }

  // Ends session `id` if it's still the active one; `error` null means it
  // ended normally.
  private endSession(id: number, error: string | null): void {
    const session = this.session
    if (!session || session.id !== id) return
    this.session = null
    this.release(session)
    session.client.close()
    this.setStatus(error ? { state: 'error', deviceName: session.device.name, error } : { state: 'idle' })
  }

  private setStatus(status: CastStatus): void {
    this.status = status
    this.sendStatus(status)
  }
}
