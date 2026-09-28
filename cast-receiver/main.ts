// MCO's Cast receiver: the page a Google TV opens when MCO casts to it
// with its own app (registered as MCO's Cast application — see
// src/cast/receiverProtocol.ts). The TV plays the track file itself,
// fetched from MCO over the LAN, through MCO's own effects chain and Dub
// Siren, and shows either the visualizer (rendered from that same audio,
// so picture and sound are generated together with no stream delay) or a
// now-playing screen (nowPlaying.ts, shared with MCO's second screen). MCO
// only sends small messages — load/play/pause/seek, FX settings, siren
// presses, what to display — and the page reports back what it's playing,
// so controls respond right away.
//
// Open it in a normal browser with ?dev to try it without a Cast device:
// window.mcoReceiver.receive(message) then stands in for MCO.
import { Visualizer } from 'threejs-visualisers'
import { TvVisualizer } from './tvVisualizer'
import { NowPlayingScreen } from './nowPlaying'
import './nowPlaying.css'
import { isTvVisualizer } from '../src/cast/tvVisualizers'
import { EffectsChain } from '../src/audio/effectsChain'
import { DubSirenEngine } from '../src/audio/sirenEngine'
import { DEFAULT_EFFECTS_SETTINGS, type EffectsSettings } from '../src/types'
import { RECEIVER_NAMESPACE, type ReceiverPlayerState, type ReceiverStatus, type ToReceiver } from '../src/cast/receiverProtocol'

// Minimal typing for the bits of Google's Cast receiver framework used here.
interface CastContext {
  addCustomMessageListener(namespace: string, listener: (event: { data: unknown }) => void): void
  sendCustomMessage(namespace: string, senderId: string | undefined, message: unknown): void
  start(options: object): void
  stop(): void
}
declare const cast:
  | {
      framework: {
        CastReceiverContext: { getInstance(): CastContext }
        CastReceiverOptions: new () => { disableIdleTimeout?: boolean; skipPlayersLoad?: boolean }
      }
    }
  | undefined

// Holds a screen wake lock (see where it's first called). Where the API is
// missing or refused, nothing changes.
let wakeLock: { released: boolean } | null = null
function keepScreenAwake(): void {
  const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ released: boolean }> } }
  if (!nav.wakeLock || (wakeLock && !wakeLock.released) || document.visibilityState !== 'visible') return
  nav.wakeLock
    .request('screen')
    .then((lock) => {
      wakeLock = lock
    })
    .catch((err) => console.warn('[receiver] wake lock refused', err))
}

// MCO's seekbar follows these reports (see src/cast/directCast.ts).
const STATUS_INTERVAL_MS = 500
// How long the app can be out of view (another app opened on the TV)
// before it ends the session.
const HIDDEN_STOP_MS = 30000

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

const screen = new NowPlayingScreen(document.body, () => ({
  currentTime: audio.currentTime,
  duration: audio.duration,
  state: playerState(),
}))
const $ = (id: string) => screen.$(id)

let showVisualizer = false
let hideTrackInfo = false
let visualizer: Visualizer | null = null
// The TV-only themes (no GPU); `tvTheme` says one of them is chosen, in
// which case the three.js visualizer isn't used at all.
let tvVisualizer: TvVisualizer | null = null
let tvTheme = false

function render(): void {
  const visualizing = screen.loaded && showVisualizer
  screen.setShowVisualizer(showVisualizer)
  $('stage').hidden = !visualizing || tvTheme
  $('tvstage').hidden = !visualizing || !tvTheme
  $('overlay').hidden = !visualizing || hideTrackInfo
  // A visualizer only runs while it's on screen — the TV's GPU is modest.
  if (visualizing && !tvTheme) visualizer?.start()
  else visualizer?.stop()
  if (visualizing && tvTheme) tvVisualizer?.start()
  else tvVisualizer?.stop()
}

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
}

for (const event of ['play', 'playing', 'waiting', 'seeked']) audio.addEventListener(event, sendStatus)
// At the end of a track the element pauses just before it ends — that
// isn't a pause to report (MCO would pause its own copy to match, short of
// its end); 'ended' reports FINISHED instead.
audio.addEventListener('pause', () => {
  if (!audio.ended) sendStatus()
})
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
      keepScreenAwake()
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
      screen.load(message, message.position)
      render()
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
      screen.setEffects(effects)
      // A beat-synced siren runs on its own schedule once enabled.
      if (effects.siren.enabled && effects.siren.beat !== 'off') ensureSiren()
      break
    case 'siren':
      screen.setSirenHeld(message.held)
      if (message.held) {
        if (effects.siren.enabled && effects.siren.beat === 'off') ensureSiren().triggerDown()
      } else {
        siren?.triggerUp()
      }
      break
    case 'queue':
      // MCO's queue is empty: nothing is loaded there any more, so the TV
      // goes back to its "Load a song" screen rather than keeping the last
      // track's title, year and seek bar up.
      if (!message.current && screen.loaded) {
        audio.pause()
        screen.setQueue(message)
        screen.clear()
        render()
        break
      }
      screen.setQueue(message)
      break
    case 'display': {
      showVisualizer = message.showVisualizer
      hideTrackInfo = message.hideTrackInfo
      tvTheme = isTvVisualizer(message.theme)
      if (isTvVisualizer(message.theme)) {
        tvVisualizer ??= new TvVisualizer($('tvstage'), () => chain?.getAnalyser() ?? null)
        tvVisualizer.setTheme(message.theme, message.options)
      } else if (!visualizer) {
        visualizer = new Visualizer($('stage'), {
          analyser: () => chain?.getAnalyser() ?? null,
          theme: message.theme,
          themeOptions: message.options,
          // Render at CSS resolution (720p on most TVs): the TV's GPU is modest.
          pixelRatio: 1,
          // Capped: a theme the TV can't hold at 60 runs evenly instead of
          // stuttering, and the GPU gets half the work.
          fps: 30,
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

  // This page plays audio itself, not through the framework's media player,
  // so Google TV doesn't know anything is playing and starts its
  // screensaver after a few idle minutes — which hid this app and (with the
  // rule below) ended the session mid-track. A screen wake lock keeps the
  // screen, and this app, up for the whole session.
  keepScreenAwake()

  // Opening another app on the TV (Plex, YouTube…) only sends this one to
  // the background — the Cast session would stay up, and MCO would keep
  // showing "casting" to a TV that's moved on. Out of view for a while
  // (not just a blip) ends the session, after telling MCO why.
  let hiddenTimer: ReturnType<typeof setTimeout> | null = null
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenTimer ??= setTimeout(() => {
        audio.pause()
        context.sendCustomMessage(RECEIVER_NAMESPACE, undefined, { type: 'goodbye', reason: 'hidden' })
        // Let the goodbye go out before the session closes.
        setTimeout(() => context.stop(), 500)
      }, HIDDEN_STOP_MS)
    } else {
      if (hiddenTimer) clearTimeout(hiddenTimer)
      hiddenTimer = null
      // A wake lock is dropped whenever the page is hidden; take it again.
      keepScreenAwake()
    }
  })
} else {
  ;(window as unknown as { mcoReceiver: { receive: typeof receive } }).mcoReceiver = { receive }
  console.log('[receiver] dev mode: call window.mcoReceiver.receive(message)')
}
