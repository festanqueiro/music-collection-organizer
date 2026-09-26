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
import { decodeHtmlEntities, formatDate, formatDuration } from '../src/format'
import { listenedSeconds, playedThreshold } from '../src/state/playCount'
import { activeEffects } from '../src/cast/fxIndicators'
import {
  RECEIVER_NAMESPACE,
  type ReceiverPlayerState,
  type ReceiverStatus,
  type ReceiverTrackInfo,
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

// MCO's accent (--accent in index.html), for the waveform canvas.
const ACCENT = '#2dd4bf'
// Lossy files below this get flagged, as in MCO's Bitrate column.
const LOSSY_FLOOR_KBPS = 192
const isLossy = (format: string) => ['mp3', 'aac', 'm4a', 'ogg', 'opus', 'wma'].includes(format.toLowerCase())

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

type LoadMessage = Extract<ToReceiver, { type: 'load' }>
type QueueMessage = Extract<ToReceiver, { type: 'queue' }>

let showVisualizer = false
let hideTrackInfo = false
let visualizer: Visualizer | null = null
let currentTrack: LoadMessage | null = null
// MCO's latest queue message; its details only apply while its current
// track is the one loaded here.
let queue: QueueMessage | null = null
// What the cover and waveform currently show, so queue updates only
// redraw them when they change.
let artworkShown: string | null = null
let waveformShown: number[] | null = null
let sirenHeld = false

// This casting session, as seen from the TV: when it started, and what's
// played so far (a track counts as played by the same rule as MCO's play
// counts). Each load gets a sequence number, so the same track played
// twice counts twice.
let loadSeq = 0
let sessionStartedAt: number | null = null
const played: { seq: number; title: string; artist: string }[] = []
let listened = 0
let lastPosition = 0
// The current track's play count and last play from before this load —
// MCO counts this play partway through, which would otherwise make "last
// played" read "now".
let playsBefore: { seq: number; playCount: number; lastPlayedAt: number | null } | null = null

function render(): void {
  const loaded = currentTrack !== null
  $('waiting').hidden = loaded
  $('playing').hidden = !loaded || showVisualizer
  $('stage').hidden = !loaded || !showVisualizer
  $('overlay').hidden = !loaded || !showVisualizer || hideTrackInfo
  $('topbar').hidden = loaded && showVisualizer
  // The visualizer only runs while it's on screen — the TV's GPU is modest.
  if (loaded && showVisualizer) visualizer?.start()
  else visualizer?.stop()
  // Drawn at the waveform's on-screen size, which is zero while hidden.
  if (loaded && !showVisualizer) drawWaveform(waveformShown)
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const decode = (text: string | null) => (text ? decodeHtmlEntities(text) : '')

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' })
function ago(epochMs: number): string {
  const hours = (Date.now() - epochMs) / 3_600_000
  if (hours < 24) return relative.format(-Math.max(1, Math.round(hours)), 'hour')
  const days = hours / 24
  if (days < 14) return relative.format(-Math.round(days), 'day')
  if (days < 60) return relative.format(-Math.round(days / 7), 'week')
  if (days < 730) return relative.format(-Math.round(days / 30.4), 'month')
  return relative.format(-Math.round(days / 365), 'year')
}

function hoursMinutes(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

function clockTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function hexToRgba(hex: string, alpha: number): string | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) return null
  const n = parseInt(match[1], 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

// Artwork that 404s (the track has none) falls back to the ♪ placeholder.
function setArtwork(img: HTMLImageElement, placeholder: HTMLElement, url: string | null, onLoad?: () => void): void {
  img.onload = () => {
    img.hidden = false
    placeholder.hidden = true
    onLoad?.()
  }
  img.onerror = () => {
    img.hidden = true
    placeholder.hidden = false
  }
  img.hidden = true
  placeholder.hidden = false
  img.removeAttribute('src')
  if (url) img.src = url
}

// The backdrop: the cover drawn a few pixels wide and stretched to fill
// the screen, which blurs it for free. (Drawing a cross-origin image only
// taints the canvas, which doesn't matter since it's never read back.)
function paintBackdrop(img: HTMLImageElement | null): void {
  const canvas = $('backdrop') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (img) {
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side * 0.5625, 0, 0, canvas.width, canvas.height)
  }
  canvas.classList.toggle('shown', !!img)
}

function currentInfo(): ReceiverTrackInfo | null {
  return queue?.current && queue.current.trackId === currentTrack?.trackId ? queue.current : null
}

function renderTrack(): void {
  if (!currentTrack) return
  const info = currentInfo()
  const title = decode(currentTrack.title)
  const artist = decode(currentTrack.artist)
  $('title').textContent = title
  $('artist').textContent = artist
  $('overlay-title').textContent = title
  $('overlay-artist').textContent = artist

  $('album').textContent = [decode(info?.album ?? null), info?.year ?? ''].filter(Boolean).join(' · ')

  const tags = $('tags')
  tags.replaceChildren()
  for (const genre of info?.genres ?? []) {
    const chip = el('span', 'chip genre', genre.name)
    const tint = genre.color && hexToRgba(genre.color, 0.28)
    if (tint) {
      chip.style.background = tint
      chip.style.borderColor = hexToRgba(genre.color!, 0.6)!
    }
    tags.append(chip)
  }
  for (const name of info?.subgenres ?? []) tags.append(el('span', 'chip sub', name))

  const stats = $('stats')
  stats.replaceChildren()
  const stat = (label: string, value: string | Node, small = false) => {
    const cell = el('div')
    const dd = el('dd', small ? 'small' : undefined)
    dd.append(value)
    cell.append(el('dt', undefined, label), dd)
    stats.append(cell)
  }
  if (info?.bpm) stat('BPM', String(Math.round(info.bpm)))
  if (info?.key) {
    const value = el('span')
    if (info.keyColor) {
      const dot = el('span', 'keydot')
      dot.style.background = info.keyColor
      value.append(dot)
    }
    value.append(info.key)
    stat('Key', value)
  }
  if (info?.energy) {
    const value = el('span', undefined, String(info.energy))
    const meter = el('span', 'meter')
    for (let i = 1; i <= 10; i++) meter.append(el('i', i <= info.energy ? 'on' : undefined))
    value.append(meter)
    stat('Energy', value)
  }
  if (info?.loudness !== null && info?.loudness !== undefined) stat('Loudness', `${info.loudness.toFixed(1).replace('-', '−')} LUFS`)
  if (info) {
    const quality = el('span', info.bitrate && info.bitrate < LOSSY_FLOOR_KBPS && isLossy(info.format) ? 'lossy' : undefined)
    quality.textContent = [info.format.toUpperCase(), info.bitrate ? `${info.bitrate}k` : ''].filter(Boolean).join(' · ')
    stat('Format', quality)
  }
  if (info?.addedAt) stat('Added', formatDate(info.addedAt))
  if (info) {
    if (!playsBefore || playsBefore.seq !== loadSeq) {
      playsBefore = { seq: loadSeq, playCount: info.playCount, lastPlayedAt: info.lastPlayedAt }
    }
    const { playCount, lastPlayedAt } = playsBefore
    stat('Played', playCount === 0 ? 'First time' : [`${playCount}×`, lastPlayedAt ? ago(lastPlayedAt) : ''].filter(Boolean).join(' · '), true)
    stat('Folder', info.folder, true)
  }

  const overlayMeta = [info?.bpm ? `${Math.round(info.bpm)} BPM` : '', info?.key ?? ''].filter(Boolean)
  const next = queue?.upNext[0]
  if (next) overlayMeta.push(`Next: ${decode(next.title)}${next.artist ? ` — ${decode(next.artist)}` : ''}`)
  $('overlay-meta').textContent = overlayMeta.join('  ·  ')

  if (artworkShown !== currentTrack.artworkUrl) {
    artworkShown = currentTrack.artworkUrl
    const artwork = $('artwork') as HTMLImageElement
    setArtwork(artwork, $('placeholder'), artworkShown, () => paintBackdrop(artwork))
    if (!artworkShown) paintBackdrop(null)
  }

  const waveform = info ? queue!.waveform : null
  if (waveform !== waveformShown) {
    waveformShown = waveform
    drawWaveform(waveform)
  }
}

function renderQueue(): void {
  const list = $('upnext')
  list.replaceChildren()
  const earlier = played.filter((entry) => entry.seq !== loadSeq).slice(-2).reverse()
  // Room for the history under the queue means one fewer upcoming track.
  const upNext = (queue?.upNext ?? []).slice(0, earlier.length > 0 ? 3 : 4)
  for (const track of upNext) {
    const item = el('li')
    const thumb = el('div', 'thumb')
    const img = el('img')
    img.alt = ''
    const placeholder = el('div', 'placeholder', '♪')
    thumb.append(img, placeholder)
    setArtwork(img, placeholder, track.artworkUrl)

    const text = el('div', 'up-text')
    text.append(el('div', 'up-title ellipsis', decode(track.title)))
    const sub = [decode(track.artist), track.duration ? formatDuration(track.duration) : ''].filter(Boolean).join('  ·  ')
    if (sub) text.append(el('div', 'up-sub ellipsis', sub))
    const meta = el('div', 'up-meta ellipsis')
    const parts: Node[] = []
    if (track.bpm) parts.push(mixMark(`${Math.round(track.bpm)} BPM${tempoMove(track.bpmChange)}`, track.bpmMixes))
    if (track.key) parts.push(mixMark(track.key, track.keyMixes))
    parts.forEach((part, i) => {
      if (i > 0) meta.append('  ·  ')
      meta.append(part)
    })
    text.append(meta)
    item.append(thumb, text)
    list.append(item)
  }
  $('played-section').hidden = earlier.length === 0
  $('played').replaceChildren(
    ...earlier.map((entry) => {
      const item = el('li', 'ellipsis', entry.title)
      if (entry.artist) item.append(el('span', undefined, ` — ${entry.artist}`))
      return item
    }),
  )
  const count = queue?.queuedCount ?? 0
  $('queue-count').textContent = count === 0 ? '' : `${count} track${count === 1 ? '' : 's'}`
  $('queue-empty').hidden = count > 0
  $('queue-foot').hidden = count === 0
  $('queue-duration').textContent = formatDuration(queue?.queuedDuration ?? 0)
  renderClock()
}

// The tempo change from the track before, compactly: " ↑2", " ↓3", " ½×".
function tempoMove(change: string | null): string {
  if (!change || change === '±0') return ''
  if (change === 'half-time') return ' ½×'
  if (change === 'double-time') return ' 2×'
  return change.startsWith('+') ? ` ↑${change.slice(1)}` : ` ↓${change.slice(1)}`
}

// A value that mixes well with the track before it gets MCO's accent.
function mixMark(text: string, mixes: boolean): Node {
  if (!mixes) return document.createTextNode(text)
  return el('span', 'mix', `${text} ✓`)
}

function drawWaveform(peaks: number[] | null): void {
  const wave = $('wave')
  wave.classList.toggle('flat', !peaks || peaks.length === 0)
  if (!peaks || peaks.length === 0) return
  const width = wave.clientWidth
  const height = wave.clientHeight
  const ratio = window.devicePixelRatio || 1
  for (const [id, colour] of [
    ['wave-base', 'rgba(255, 255, 255, 0.22)'],
    ['wave-top', ACCENT],
  ] as const) {
    const canvas = $(id) as HTMLCanvasElement
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    canvas.style.width = `${width}px`
    const ctx = canvas.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.fillStyle = colour
    const step = width / peaks.length
    const barWidth = Math.max(1, step * 0.6)
    peaks.forEach((peak, i) => {
      const barHeight = Math.max(2, peak * height)
      ctx.fillRect(i * step, (height - barHeight) / 2, barWidth, barHeight)
    })
  }
}

function renderProgress(): void {
  const duration = audio.duration
  const known = Number.isFinite(duration) && duration > 0
  const fraction = known ? Math.min(1, audio.currentTime / duration) : 0
  $('wave-fill').style.width = `${fraction * 100}%`
  ;($('bar').firstElementChild as HTMLElement).style.width = `${fraction * 100}%`
  $('elapsed').textContent = known ? formatDuration(audio.currentTime) : ''
  $('remaining').textContent = known ? `−${formatDuration(duration - audio.currentTime)}` : ''

  const state = playerState()
  const label = state === 'PLAYING' ? 'Playing' : state === 'PAUSED' ? 'Paused' : state === 'BUFFERING' ? 'Loading' : ''
  const pill = $('state')
  pill.hidden = !currentTrack || !label
  pill.textContent = label
  pill.classList.toggle('playing', state === 'PLAYING')
}
setInterval(renderProgress, 250)

function renderClock(): void {
  const now = new Date()
  $('clock').textContent = clockTime(now)
  const duration = audio.duration
  const left = (Number.isFinite(duration) ? duration - audio.currentTime : 0) + (queue?.queuedDuration ?? 0)
  $('queue-ends').textContent = clockTime(new Date(now.getTime() + left * 1000))
  $('session').textContent =
    sessionStartedAt === null
      ? ''
      : `Session ${hoursMinutes((now.getTime() - sessionStartedAt) / 1000)} · ${played.length} played`
}

function renderFx(): void {
  $('fx').replaceChildren(...activeEffects(effects, sirenHeld).map((name) => el('span', name === 'Siren' ? 'siren' : undefined, name)))
}

// Listening time on the current load, for the session's played count.
audio.addEventListener('timeupdate', () => {
  if (!audio.paused) listened += listenedSeconds(lastPosition, audio.currentTime)
  lastPosition = audio.currentTime
  if (currentTrack && listened >= playedThreshold(audio.duration) && played[played.length - 1]?.seq !== loadSeq) {
    played.push({ seq: loadSeq, title: decode(currentTrack.title), artist: decode(currentTrack.artist) })
    renderQueue()
  }
})
renderClock()
setInterval(renderClock, 5000)

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
      currentTrack = message
      loadSeq++
      sessionStartedAt ??= Date.now()
      listened = 0
      lastPosition = message.position
      renderTrack()
      renderQueue()
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
      renderFx()
      // A beat-synced siren runs on its own schedule once enabled.
      if (effects.siren.enabled && effects.siren.beat !== 'off') ensureSiren()
      break
    case 'siren':
      sirenHeld = message.held
      renderFx()
      if (message.held) {
        if (effects.siren.enabled && effects.siren.beat === 'off') ensureSiren().triggerDown()
      } else {
        siren?.triggerUp()
      }
      break
    case 'queue':
      queue = message
      renderTrack()
      renderQueue()
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
