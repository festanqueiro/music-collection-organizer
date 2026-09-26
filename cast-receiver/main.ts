// MCO's Cast receiver: the page a Google TV opens when MCO casts to it
// with its own app (registered as MCO's Cast application — see
// src/cast/receiverProtocol.ts). The TV plays the track file itself,
// fetched from MCO over the LAN, through MCO's own effects chain and Dub
// Siren, and shows either the visualizer (rendered from that same audio,
// so picture and sound are generated together with no stream delay) or a
// now-playing screen. MCO only sends small messages — load/play/pause/
// seek, FX settings, siren presses, what to display — and the page
// reports back what it's playing, so controls respond right away.
//
// Open it in a normal browser with ?dev to try it without a Cast device:
// window.mcoReceiver.receive(message) then stands in for MCO.
import { Visualizer } from 'threejs-visualisers'
import { EffectsChain } from '../src/audio/effectsChain'
import { DubSirenEngine } from '../src/audio/sirenEngine'
import { DEFAULT_EFFECTS_SETTINGS, type EffectsSettings } from '../src/types'
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

// MCO's seekbar follows these reports (see src/cast/directCast.ts).
const STATUS_INTERVAL_MS = 500

const $ = (id: string) => document.getElementById(id)!
;($('logo') as HTMLImageElement).src = logoUrl
;($('waiting-logo') as HTMLImageElement).src = logoUrl

// --- Audio: MCO's own effects chain and siren -------------------------------

// One <audio> element for the whole session (createMediaElementSource can
// only be called once per element), switched between tracks.
const audio = new Audio()
audio.crossOrigin = 'anonymous' // the Web Audio graph needs CORS-clean media
audio.preload = 'auto'
let chain: EffectsChain | null = null
let siren: DubSirenEngine | null = null
let effects: EffectsSettings = DEFAULT_EFFECTS_SETTINGS
let volume = 1
let trackId: number | null = null
let idleReason: ReceiverStatus['idleReason'] = null

function ensureChain(): EffectsChain {
  if (!chain) {
    chain = new EffectsChain(audio)
    chain.update(effects)
    chain.setVolume(volume)
  }
  chain.resume()
  return chain
}

function ensureSiren(): DubSirenEngine {
  if (!siren) {
    siren = new DubSirenEngine()
    siren.update(effects.siren)
  }
  siren.resume()
  return siren
}

// --- Screens ----------------------------------------------------------------

let showVisualizer = false
let hideTrackInfo = false
let visualizer: Visualizer | null = null
let currentTrack: Extract<ToReceiver, { type: 'load' }> | null = null

function render(): void {
  const loaded = currentTrack !== null
  $('waiting').hidden = loaded
  $('playing').hidden = !loaded || showVisualizer
  $('stage').hidden = !loaded || !showVisualizer
  $('overlay').hidden = !loaded || !showVisualizer || hideTrackInfo
  $('brand').hidden = loaded && showVisualizer
  // The visualizer only runs while it's on screen — the TV's GPU is modest.
  if (loaded && showVisualizer) visualizer?.start()
  else visualizer?.stop()
}

function showTrack(message: Extract<ToReceiver, { type: 'load' }>): void {
  currentTrack = message
  const title = decodeHtmlEntities(message.title)
  const artist = message.artist ? decodeHtmlEntities(message.artist) : ''
  $('title').textContent = title
  $('artist').textContent = artist
  $('overlay-title').textContent = title
  $('overlay-artist').textContent = artist
  const artwork = $('artwork') as HTMLImageElement
  artwork.hidden = !message.artworkUrl
  if (message.artworkUrl) artwork.src = message.artworkUrl
  $('placeholder').hidden = !!message.artworkUrl
  render()
}

function renderProgress(): void {
  const duration = audio.duration
  const known = Number.isFinite(duration) && duration > 0
  $('bar').style.width = known ? `${Math.min(100, (audio.currentTime / duration) * 100)}%` : '0%'
  $('time').textContent = known ? `${formatDuration(audio.currentTime)} / ${formatDuration(duration)}` : ''
  $('state').textContent = playerState() === 'PAUSED' ? 'Paused' : playerState() === 'BUFFERING' ? 'Loading…' : ''
}
setInterval(renderProgress, 250)

// --- Talking to MCO ---------------------------------------------------------

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
    // Where playback is *audibly* — the element runs ahead of the speakers
    // by the audio graph's and the TV's output latency.
    currentTime: Math.max(0, (audio.currentTime || 0) - (chain?.outputLatencySeconds() ?? 0)),
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
      ensureChain()
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
      ensureChain()
      audio.play().catch(() => {})
      break
    case 'pause':
      audio.pause()
      break
    case 'seek':
      audio.currentTime = message.position
      break
    case 'effects':
      effects = message.settings
      volume = message.volume
      chain?.update(effects)
      chain?.setVolume(volume)
      siren?.update(effects.siren)
      // A beat-synced siren runs on its own schedule once enabled.
      if (effects.siren.enabled && effects.siren.beat !== 'off') ensureSiren()
      break
    case 'siren':
      if (message.held) {
        if (effects.siren.enabled && effects.siren.beat === 'off') ensureSiren().triggerDown()
      } else {
        siren?.triggerUp()
      }
      break
    case 'display': {
      showVisualizer = message.showVisualizer
      hideTrackInfo = message.hideTrackInfo
      if (!visualizer) {
        visualizer = new Visualizer($('stage'), {
          analyser: () => chain?.getAnalyser() ?? null,
          theme: message.theme,
          themeOptions: message.options,
          // Render at CSS resolution (720p on most TVs): the TV's GPU is modest.
          pixelRatio: 1,
          autoStart: false,
        })
      } else if (message.theme !== visualizer.theme.id) {
        visualizer.setTheme(message.theme, message.options)
      } else {
        for (const [optionId, valueId] of Object.entries(message.options)) visualizer.setOption(optionId, valueId)
      }
      render()
      break
    }
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
