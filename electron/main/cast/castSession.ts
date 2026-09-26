// Main-process side of casting: owns device discovery and the one active
// session, and reports status to the renderer. The device plays each
// track file itself, fetched from CastMediaServer, and MCO's player drives
// it with load/play/pause/seek commands (runDirect) — in one of two apps:
//
//   receiver — MCO's own Cast app (cast-receiver/), which also runs MCO's
//            effects and siren and renders the visualizer on the device,
//            talking over MCO's own message channel (receiverProtocol.ts).
//   direct   — the fallback, where a device won't run MCO's app: Google's
//            Default Media Receiver. Plays the tracks only (no effects or
//            visualizer; volume is left to the TV remote / Google Home).
//
// The renderer owns the other half (src/cast/castSession.ts,
// src/cast/directCast.ts, src/cast/receiverSync.ts).
import { CastClient, type CastMediaStatus } from './castClient'
import { CastDiscovery } from './castDiscovery'
import { pickLocalAddress } from './castNetwork'
import { CastMediaServer, type MediaResolvers } from './castMediaServer'
import type { CastDevice, CastDirectCommand, CastMediaEvent, CastMode, CastStatus } from '../../../src/types'
import { RECEIVER_APP_ID, isReceiverStatus, type ReceiverSettingsMessage, type ToReceiver } from '../../../src/cast/receiverProtocol'

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
  // The device of the latest session: a restart can come just as a fresh
  // scan has emptied the discovered list.
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

  // Resolves once the device's player is up and ready for a track: MCO's
  // own app where the device runs it, Google's player otherwise.
  async start(deviceId: string): Promise<void> {
    const device = this.discovery.get(deviceId) ?? (this.lastDevice?.id === deviceId ? this.lastDevice : undefined)
    if (!device) throw new Error('That device is no longer available')
    this.lastDevice = device
    // Replacing a running session: no 'idle' in between.
    this.stop(false)

    const id = this.nextSessionId++
    const session: ActiveSession = {
      id,
      mode: 'receiver',
      device,
      client: new CastClient(device.host, device.port),
      localAddress: pickLocalAddress(device.host),
      media: null,
      mediaSessionId: null,
      trackId: null,
      commands: Promise.resolve(),
      positionTimer: null,
    }
    this.session = session
    this.setStatus(this.statusFor(session, 'connecting'))

    try {
      if (!session.localAddress) throw new Error("This Mac doesn't seem to be on a network")
      session.media = new CastMediaServer(this.sources)
      await session.media.start()
      this.watchClient(session)
      await session.client.connect()
      try {
        await session.client.launch(RECEIVER_APP_ID)
      } catch (err) {
        // The device won't run MCO's app (it can say NOT_FOUND for a while
        // after the app is published, until it re-checks on a restart).
        // Google's player does the same job, minus MCO's screens/effects.
        console.warn('cast: MCO receiver unavailable, using Google\'s player:', err instanceof Error ? err.message : err)
        session.mode = 'direct'
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

  // A command from MCO's player. Commands run one at a time,
  // in order, so a play or seek sent right after a load waits for it.
  runDirect(command: CastDirectCommand): void {
    const session = this.session
    debug('command', JSON.stringify(command), 'session mode:', session?.mode ?? 'none')
    if (!session) return
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
  // left on a player whose files are about to vanish.
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
        // A track finishing is MCO's cue to move on.
        this.forwardMedia(session, status)
      }
      // INTERRUPTED: replaced by the next LOAD — nothing to do.
    })
  }

  private statusFor(session: ActiveSession, state: 'connecting' | 'casting'): CastStatus {
    return { state, deviceName: session.device.name, audioOnly: session.device.audioOnly, mode: session.mode }
  }

  private release(session: ActiveSession): void {
    if (session.positionTimer) clearInterval(session.positionTimer)
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
