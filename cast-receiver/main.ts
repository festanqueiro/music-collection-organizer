// MCO's Cast receiver: the page a Google TV opens when MCO casts to it
// with its own app (registered as MCO's Cast application — see
// src/cast/receiverProtocol.ts). The TV plays the track file itself,
// fetched from MCO over the LAN, and shows what's playing; MCO sends
// small control messages (load/play/pause/seek) and the page reports back
// what it's doing, so controls respond right away.
//
// Open it in a normal browser with ?dev to try it without a Cast device:
// window.mcoReceiver.receive(message) then stands in for MCO.
import { decodeHtmlEntities, formatDuration } from '../src/format'
import {
  RECEIVER_NAMESPACE,
  type ReceiverPlayerState,
  type ReceiverStatus,
  type ToReceiver,
} from '../src/cast/receiverProtocol'
import logoUrl from '../resources/icon.png'

// Minimal typing for the bits of Google's Cast receiver framework used here.
interface CastContext {
  addCustomMessageListener(namespace: string, listener: (event: { data: unknown }) => void): void
  sendCustomMessage(namespace: string, senderId: string | undefined, message: unknown): void
  start(options: object): void
}
declare const cast:
  | {
      framework: {
        CastReceiverContext: { getInstance(): CastContext }
        CastReceiverOptions: new () => { disableIdleTimeout?: boolean; skipPlayersLoad?: boolean }
      }
    }
  | undefined

const STATUS_INTERVAL_MS = 1000

const $ = (id: string) => document.getElementById(id)!
;($('logo') as HTMLImageElement).src = logoUrl
;($('waiting-logo') as HTMLImageElement).src = logoUrl

const audio = new Audio()
audio.preload = 'auto'
let trackId: number | null = null
let idleReason: ReceiverStatus['idleReason'] = null

// --- Screen ---------------------------------------------------------------

function showTrack(message: Extract<ToReceiver, { type: 'load' }>): void {
  $('title').textContent = decodeHtmlEntities(message.title)
  $('artist').textContent = message.artist ? decodeHtmlEntities(message.artist) : ''
  const artwork = $('artwork') as HTMLImageElement
  artwork.hidden = !message.artworkUrl
  if (message.artworkUrl) artwork.src = message.artworkUrl
  $('placeholder').hidden = !!message.artworkUrl
  $('playing').hidden = false
  $('waiting').hidden = true
}

function renderProgress(): void {
  const duration = audio.duration
  const known = Number.isFinite(duration) && duration > 0
  $('bar').style.width = known ? `${Math.min(100, (audio.currentTime / duration) * 100)}%` : '0%'
  $('time').textContent = known ? `${formatDuration(audio.currentTime)} / ${formatDuration(duration)}` : ''
  $('state').textContent = playerState() === 'PAUSED' ? 'Paused' : playerState() === 'BUFFERING' ? 'Loading…' : ''
}
setInterval(renderProgress, 250)

// --- Talking to MCO -------------------------------------------------------

const context: CastContext | null =
  typeof cast !== 'undefined' && !new URLSearchParams(location.search).has('dev')
    ? cast.framework.CastReceiverContext.getInstance()
    : null

function playerState(): ReceiverPlayerState {
  if (trackId === null || idleReason) return 'IDLE'
  if (audio.paused) return 'PAUSED'
  return audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ? 'BUFFERING' : 'PLAYING'
}

function sendStatus(): void {
  const status: ReceiverStatus = {
    type: 'status',
    trackId,
    playerState: playerState(),
    idleReason,
    currentTime: audio.currentTime || 0,
  }
  if (context) context.sendCustomMessage(RECEIVER_NAMESPACE, undefined, status)
  else console.log('[receiver] status', JSON.stringify(status))
  renderProgress()
}

for (const event of ['play', 'pause', 'playing', 'waiting', 'seeked']) audio.addEventListener(event, sendStatus)
audio.addEventListener('ended', () => {
  idleReason = 'FINISHED'
  sendStatus()
})
audio.addEventListener('error', () => {
  idleReason = 'ERROR'
  sendStatus()
})
setInterval(() => {
  if (!audio.paused) sendStatus()
}, STATUS_INTERVAL_MS)

function receive(message: ToReceiver): void {
  switch (message.type) {
    case 'load': {
      trackId = message.trackId
      idleReason = null
      audio.src = message.url
      audio.addEventListener(
        'loadedmetadata',
        () => {
          audio.currentTime = message.position
          if (message.autoplay) audio.play().catch(() => {})
        },
        { once: true },
      )
      showTrack(message)
      sendStatus()
      break
    }
    case 'play':
      audio.play().catch(() => {})
      break
    case 'pause':
      audio.pause()
      break
    case 'seek':
      audio.currentTime = message.position
      break
  }
}

if (context) {
  context.addCustomMessageListener(RECEIVER_NAMESPACE, (event) => receive(event.data as ToReceiver))
  const options = new cast!.framework.CastReceiverOptions()
  // This page plays audio itself (not through the framework's media
  // player), so the framework would otherwise think it idle and close it.
  options.disableIdleTimeout = true
  options.skipPlayersLoad = true
  context.start(options)
} else {
  ;(window as unknown as { mcoReceiver: { receive: typeof receive } }).mcoReceiver = { receive }
  console.log('[receiver] dev mode: call window.mcoReceiver.receive(message)')
}
