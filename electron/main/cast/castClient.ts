// Minimal Google Cast v2 sender: TLS to the device's port 8009, launch
// Google's Default Media Receiver (a built-in receiver app every Cast
// device ships with — no developer registration needed), then LOAD a URL
// on it. Only what casting a live stream needs is implemented: no queue,
// seek or track-level control, since the stream itself carries MCO's
// output live.
import { EventEmitter } from 'node:events'
import { connect as tlsConnect, type TLSSocket } from 'node:tls'
import { CastFrameReader, encodeCastMessage } from './castMessage'
import { parseMediaTimes, type MediaTimes } from './castDelay'

export const DEFAULT_MEDIA_RECEIVER_APP_ID = 'CC1AD845'

const NS_CONNECTION = 'urn:x-cast:com.google.cast.tp.connection'
const NS_HEARTBEAT = 'urn:x-cast:com.google.cast.tp.heartbeat'
const NS_RECEIVER = 'urn:x-cast:com.google.cast.receiver'
const NS_MEDIA = 'urn:x-cast:com.google.cast.media'

const SENDER_ID = 'sender-0'
const RECEIVER_ID = 'receiver-0'
const HEARTBEAT_INTERVAL_MS = 5000
const REQUEST_TIMEOUT_MS = 15000
const CONNECT_TIMEOUT_MS = 8000

export interface CastLoadRequest {
  url: string
  contentType: string
  title: string
}

type JsonMessage = { type?: string; requestId?: number; [key: string]: unknown }

interface ReceiverApplication {
  appId: string
  sessionId: string
  transportId: string
}

// Events: 'closed' (the session ended from the device side — another app
// took over the TV, the TV turned off, the socket dropped) and 'error'.
export class CastClient extends EventEmitter {
  private socket: TLSSocket | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private nextRequestId = 1
  private pending = new Map<number, { resolve: (m: JsonMessage) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private app: ReceiverApplication | null = null
  private closed = false

  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {
    super()
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Cast devices present a self-signed certificate chained to Google's
      // device CA, not a public one — there's no hostname to verify against
      // on a LAN IP anyway.
      const socket = tlsConnect({ host: this.host, port: this.port, rejectUnauthorized: false })
      this.socket = socket
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error(`Couldn't reach the device at ${this.host}`))
      }, CONNECT_TIMEOUT_MS)
      const reader = new CastFrameReader()
      socket.once('secureConnect', () => {
        clearTimeout(timer)
        this.send(NS_CONNECTION, RECEIVER_ID, { type: 'CONNECT' })
        this.heartbeat = setInterval(() => this.send(NS_HEARTBEAT, RECEIVER_ID, { type: 'PING' }), HEARTBEAT_INTERVAL_MS)
        resolve()
      })
      socket.on('data', (chunk: Buffer) => {
        let messages
        try {
          messages = reader.push(chunk)
        } catch (err) {
          this.fail(err instanceof Error ? err : new Error(String(err)))
          return
        }
        for (const message of messages) this.handle(message.namespace, message.sourceId, message.payload)
      })
      socket.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
        this.fail(err)
      })
      socket.on('close', () => {
        clearTimeout(timer)
        this.teardown()
      })
    })
  }

  // Launches the Default Media Receiver (or joins it if it's already
  // running) and loads `request` on it as a live stream.
  async load(request: CastLoadRequest): Promise<void> {
    const status = await this.request(NS_RECEIVER, RECEIVER_ID, { type: 'LAUNCH', appId: DEFAULT_MEDIA_RECEIVER_APP_ID })
    const app = findApplication(status, DEFAULT_MEDIA_RECEIVER_APP_ID)
    if (!app) throw new Error('The TV did not start its media player')
    this.app = app
    this.send(NS_CONNECTION, app.transportId, { type: 'CONNECT' })
    const result = await this.request(NS_MEDIA, app.transportId, {
      type: 'LOAD',
      sessionId: app.sessionId,
      autoplay: true,
      media: {
        contentId: request.url,
        contentUrl: request.url,
        contentType: request.contentType,
        streamType: 'LIVE',
        metadata: { metadataType: 0, title: request.title },
      },
    })
    if (result.type !== 'MEDIA_STATUS') throw new Error(`The TV couldn't play the stream (${result.type ?? 'unknown error'})`)
  }

  // Asks the device where it is in the stream (null if it can't say yet).
  async getMediaTimes(): Promise<MediaTimes | null> {
    if (!this.app || this.closed) return null
    const status = await this.request(NS_MEDIA, this.app.transportId, { type: 'GET_STATUS' }, 3000)
    return parseMediaTimes(status as { status?: unknown })
  }

  // Stops the receiver app on the TV (back to its home screen) and closes
  // the connection. Best effort — the device may already be gone.
  async stop(): Promise<void> {
    if (this.app && this.socket && !this.closed) {
      try {
        await this.request(NS_RECEIVER, RECEIVER_ID, { type: 'STOP', sessionId: this.app.sessionId }, 3000)
      } catch {
        // Ignore — closing the socket below is what matters.
      }
    }
    this.close()
  }

  close(): void {
    this.socket?.destroy()
    this.teardown()
  }

  private handle(namespace: string, sourceId: string, payload: string): void {
    let message: JsonMessage
    try {
      message = JSON.parse(payload)
    } catch {
      return
    }
    if (namespace === NS_HEARTBEAT && message.type === 'PING') {
      this.send(NS_HEARTBEAT, sourceId, { type: 'PONG' })
      return
    }
    if (typeof message.requestId === 'number' && message.requestId > 0) {
      const waiter = this.pending.get(message.requestId)
      if (waiter) {
        this.pending.delete(message.requestId)
        clearTimeout(waiter.timer)
        if (message.type === 'LAUNCH_ERROR' || message.type === 'INVALID_REQUEST') {
          waiter.reject(new Error(`The TV rejected the request (${String(message.reason ?? message.type)})`))
        } else {
          waiter.resolve(message)
        }
        return
      }
    }
    if (!this.app) return
    // The receiver app closing its end (e.g. the TV switched to another
    // app, or someone else cast to it).
    if (namespace === NS_CONNECTION && message.type === 'CLOSE' && sourceId === this.app.transportId) {
      this.endFromDevice()
      return
    }
    if (namespace === NS_RECEIVER && message.type === 'RECEIVER_STATUS') {
      if (!findApplication(message, DEFAULT_MEDIA_RECEIVER_APP_ID, this.app.sessionId)) this.endFromDevice()
      return
    }
    if (namespace === NS_MEDIA && message.type === 'MEDIA_STATUS') {
      const statuses = Array.isArray(message.status) ? (message.status as Array<Record<string, unknown>>) : []
      for (const s of statuses) {
        if (s.playerState === 'IDLE' && s.idleReason === 'ERROR') {
          this.emit('error', new Error('The TV hit a playback error'))
          this.endFromDevice()
        } else if (s.playerState === 'IDLE' && (s.idleReason === 'CANCELLED' || s.idleReason === 'FINISHED')) {
          this.endFromDevice()
        }
      }
    }
  }

  private request(namespace: string, destinationId: string, body: JsonMessage, timeoutMs = REQUEST_TIMEOUT_MS): Promise<JsonMessage> {
    const requestId = this.nextRequestId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('The TV did not respond'))
      }, timeoutMs)
      this.pending.set(requestId, { resolve, reject, timer })
      this.send(namespace, destinationId, { ...body, requestId })
    })
  }

  private send(namespace: string, destinationId: string, body: JsonMessage): void {
    if (!this.socket || this.closed) return
    this.socket.write(encodeCastMessage({ sourceId: SENDER_ID, destinationId, namespace, payload: JSON.stringify(body) }))
  }

  private endFromDevice(): void {
    if (this.closed) return
    this.close()
  }

  private fail(err: Error): void {
    if (this.closed) return
    this.emit('error', err)
    this.close()
  }

  private teardown(): void {
    if (this.closed) return
    this.closed = true
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('Connection to the TV closed'))
    }
    this.pending.clear()
    this.emit('closed')
  }
}

// Pulls the running app matching `appId` (and, if given, `sessionId`)
// out of a RECEIVER_STATUS message.
export function findApplication(message: JsonMessage, appId: string, sessionId?: string): ReceiverApplication | null {
  const status = message.status as { applications?: unknown } | undefined
  const apps = Array.isArray(status?.applications) ? (status.applications as Array<Record<string, unknown>>) : []
  for (const app of apps) {
    if (app.appId !== appId) continue
    if (sessionId && app.sessionId !== sessionId) continue
    if (typeof app.sessionId === 'string' && typeof app.transportId === 'string') {
      return { appId, sessionId: app.sessionId, transportId: app.transportId }
    }
  }
  return null
}
