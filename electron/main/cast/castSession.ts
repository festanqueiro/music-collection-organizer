// Main-process side of casting: owns device discovery and the one active
// session (stream encoder + LAN server + connection to the TV), and
// reports status to the renderer. The renderer owns the other half —
// capturing MCO's output and feeding it in via writeChunk() (see
// src/cast/castSession.ts).
import { CastClient } from './castClient'
import { CastDiscovery } from './castDiscovery'
import { CastStream, pickLocalAddress } from './castStream'
import {
  FALLBACK_DELAY_SECONDS,
  combineHlsSamples,
  combineMp3Samples,
  hlsDelaySample,
  mp3DelaySample,
} from './castDelay'
import type { CastDevice, CastStatus } from '../../../src/types'

const STREAM_READY_TIMEOUT_MS = 20000
const READY_POLL_MS = 250
// How often the device is asked for its position, and how many recent
// samples the delay estimate is taken over.
const DELAY_POLL_MS = 1000
const DELAY_SAMPLES = 10
// Status updates for a delay change smaller than this aren't worth sending.
const DELAY_REPORT_STEP_SECONDS = 0.1

interface ActiveSession {
  id: number
  device: CastDevice
  stream: CastStream
  client: CastClient
  delayTimer: ReturnType<typeof setInterval> | null
  delaySamples: number[]
}

export class CastController {
  private discovery: CastDiscovery
  private session: ActiveSession | null = null
  private nextSessionId = 1
  private status: CastStatus = { state: 'idle' }

  constructor(
    private readonly sendDevices: (devices: CastDevice[]) => void,
    private readonly sendStatus: (status: CastStatus) => void,
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

  // Starts the encoder and server and resolves once they're ready to
  // take chunks; connecting to the TV and loading the stream carries on
  // in the background, reported through status updates.
  async start(deviceId: string): Promise<void> {
    const device = this.discovery.get(deviceId)
    if (!device) throw new Error('That device is no longer available')
    // Replacing a running session (e.g. a restart with new settings):
    // no 'idle' in between, or the renderer would tear down the recording
    // it has just started for the new one.
    this.stop(false)

    const id = this.nextSessionId++
    const stream = new CastStream(device.audioOnly ? 'audio' : 'video', (message) => this.endSession(id, message))
    const client = new CastClient(device.host, device.port)
    this.session = { id, device, stream, client, delayTimer: null, delaySamples: [] }
    this.setStatus({ state: 'connecting', deviceName: device.name, audioOnly: device.audioOnly })

    try {
      await stream.start()
    } catch (err) {
      this.endSession(id, err instanceof Error ? err.message : String(err))
      throw err
    }
    void this.connectAndLoad(id)
  }

  writeChunk(chunk: Uint8Array): void {
    this.session?.stream.write(chunk)
  }

  stop(reportIdle = true): void {
    const session = this.session
    if (!session) return
    this.session = null
    if (session.delayTimer) clearInterval(session.delayTimer)
    session.stream.stop()
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
    if (session.delayTimer) clearInterval(session.delayTimer)
    session.stream.stop()
    this.setStatus({ state: 'idle' })
    await Promise.race([session.client.stop(), new Promise((resolve) => setTimeout(resolve, timeoutMs))])
  }

  dispose(): void {
    this.stop()
    this.discovery.stop()
  }

  private async connectAndLoad(id: number): Promise<void> {
    const session = this.session
    if (!session || session.id !== id) return
    const { device, stream, client } = session
    client.on('error', (err: Error) => this.endSession(id, err.message))
    // The TV ended the session (turned off, switched app, someone else
    // cast to it) — not an error, just over.
    client.on('closed', () => this.endSession(id, null))
    try {
      await client.connect()
      if (this.session?.id !== id) return
      this.setStatus({ state: 'buffering', deviceName: device.name, audioOnly: device.audioOnly })

      const startedAt = Date.now()
      while (!stream.isReady()) {
        if (this.session?.id !== id) return
        if (Date.now() - startedAt > STREAM_READY_TIMEOUT_MS) throw new Error('MCO did not produce any stream data')
        await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS))
      }

      const localAddress = pickLocalAddress(device.host)
      if (!localAddress) throw new Error("This Mac doesn't seem to be on a network")
      await client.load({
        url: stream.url(localAddress),
        contentType: stream.contentType,
        title: 'MCO',
      })
      if (this.session?.id !== id) return
      this.setStatus(this.castingStatus(session, FALLBACK_DELAY_SECONDS[stream.kind], false))
      this.trackDelay(session)
    } catch (err) {
      this.endSession(id, err instanceof Error ? err.message : String(err))
    }
  }

  private castingStatus(session: ActiveSession, delaySeconds: number, delayMeasured: boolean): CastStatus {
    const { device } = session
    return { state: 'casting', deviceName: device.name, audioOnly: device.audioOnly, delaySeconds, delayMeasured }
  }

  // Keeps the reported delay current by asking the device where it is
  // every second (see castDelay.ts). Until it answers usefully, the
  // fallback estimate stands.
  private trackDelay(session: ActiveSession): void {
    let inFlight = false
    session.delayTimer = setInterval(async () => {
      if (inFlight || this.session !== session) return
      inFlight = true
      try {
        const times = await session.client.getMediaTimes().catch(() => null)
        if (!times || this.session !== session) return
        const { stream } = session
        let sample: number | null = null
        if (stream.kind === 'video') {
          const age = stream.publishedAgeSeconds()
          if (age !== null) sample = hlsDelaySample(times, age)
        } else {
          const listening = stream.listeningSeconds()
          if (listening !== null) sample = mp3DelaySample(times, listening)
        }
        if (sample === null) return
        session.delaySamples = [...session.delaySamples, sample].slice(-DELAY_SAMPLES)
        const delay =
          stream.kind === 'video' ? combineHlsSamples(session.delaySamples) : combineMp3Samples(session.delaySamples)
        if (delay === null) return
        const previous = this.status
        if (
          previous.delayMeasured &&
          previous.delaySeconds !== undefined &&
          Math.abs(previous.delaySeconds - delay) < DELAY_REPORT_STEP_SECONDS
        ) {
          return
        }
        this.setStatus(this.castingStatus(session, delay, true))
      } finally {
        inFlight = false
      }
    }, DELAY_POLL_MS)
  }

  // Ends session `id` if it's still the active one; `error` null means it
  // ended normally.
  private endSession(id: number, error: string | null): void {
    const session = this.session
    if (!session || session.id !== id) return
    this.session = null
    if (session.delayTimer) clearInterval(session.delayTimer)
    session.stream.stop()
    session.client.close()
    this.setStatus(error ? { state: 'error', deviceName: session.device.name, error } : { state: 'idle' })
  }

  private setStatus(status: CastStatus): void {
    this.status = status
    this.sendStatus(status)
  }
}
