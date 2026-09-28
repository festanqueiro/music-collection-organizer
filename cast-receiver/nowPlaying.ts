// MCO's now-playing screen: the track's artwork, details and stats, the
// queue, the waveform and a clock, sized for a TV. Shown by the Cast
// receiver (main.ts, fed by Cast messages) and by the second screen's "Now
// playing" (src/components/SecondScreen.tsx, fed by MCO's store) — the same
// messages either way (src/cast/receiverProtocol.ts). Its styles are in
// nowPlaying.css; the receiver's visualizer stages are part of the markup
// but driven by main.ts.
import { decodeHtmlEntities, formatDate, formatDuration } from '../src/format'
import { listenedSeconds, playedThreshold } from '../src/state/playCount'
import { activeEffects } from '../src/cast/fxIndicators'
import type { EffectsSettings } from '../src/types'
import type { ReceiverPlayerState, ReceiverTrackInfo, ToReceiver } from '../src/cast/receiverProtocol'
import logoUrl from '../resources/icon.png'

export const NOW_PLAYING_MARKUP = `
<canvas id="backdrop" width="16" height="9"></canvas>
<div id="scrim"></div>
<div id="stage" hidden></div>
<div id="tvstage" hidden></div>
<div id="overlay" hidden>
  <div id="overlay-title" class="ellipsis"></div>
  <div id="overlay-artist" class="ellipsis"></div>
  <div id="overlay-meta" class="ellipsis"></div>
</div>
<header id="topbar">
  <div class="topleft"><div class="brand"><img id="logo" alt="" />MCO</div><span id="session"></span></div>
  <div class="topright"><span id="state" hidden></span><span id="clock"></span></div>
</header>
<div id="fx"></div>
<div id="waiting">
  <div class="logo"><img id="waiting-logo" alt="MCO" /></div>
  <div class="headline">Load a song to continue</div>
  <div class="sub">MCO is connected — play a track and it will show up here.</div>
  <div class="rule"></div>
</div>
<main id="playing" hidden>
  <section class="hero">
    <div class="art">
      <img id="artwork" alt="" hidden />
      <div id="placeholder" class="placeholder">♪</div>
    </div>
    <div class="details">
      <div id="album" class="ellipsis"></div>
      <h1 id="title"><span id="title-text"></span></h1>
      <div id="artist" class="ellipsis"></div>
      <div id="tags"></div>
    </div>
    <dl id="stats"></dl>
  </section>
  <aside id="queue">
    <div class="queue-head"><h2>Up next</h2><span id="queue-count"></span></div>
    <div id="upnext-area">
      <ol id="upnext"></ol>
      <div id="queue-empty">Nothing queued after this track.</div>
    </div>
    <div id="played-section"><div class="queue-head"><h2>Just played</h2></div><ol id="played"></ol></div>
    <div id="queue-foot"><span>Queue <strong id="queue-duration"></strong></span><span>Ends ≈ <strong id="queue-ends"></strong></span></div>
  </aside>
  <footer class="progress">
    <div id="wave" class="wave flat">
      <canvas id="wave-base"></canvas>
      <div id="wave-fill"><canvas id="wave-top"></canvas></div>
      <div id="bar"><div></div></div>
    </div>
    <div class="times"><span id="elapsed"></span><span id="remaining"></span></div>
  </footer>
</main>
`

// Where playback is, as the screen should show it.
export interface NowPlayingPlayback {
  currentTime: number
  duration: number
  state: ReceiverPlayerState
}

export type NowPlayingTrack = Pick<Extract<ToReceiver, { type: 'load' }>, 'trackId' | 'title' | 'artist' | 'artworkUrl'>
export type NowPlayingQueue = Extract<ToReceiver, { type: 'queue' }>

// Rows in the Up next panel — fixed, so it never changes size.
const UP_NEXT_ROWS = 3
const PROGRESS_INTERVAL_MS = 250
const CLOCK_INTERVAL_MS = 5000

// MCO's accent (--accent in nowPlaying.css), for the waveform canvas.
const ACCENT = '#2dd4bf'
// Lossy files below this get flagged, as in MCO's Bitrate column.
const LOSSY_FLOOR_KBPS = 192
const isLossy = (format: string) => ['mp3', 'aac', 'm4a', 'ogg', 'opus', 'wma'].includes(format.toLowerCase())

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

// The tempo change from the track before, compactly: " ↑2", " ↓3", " ½×".
function tempoMove(change: string | null): string {
  if (!change || change === '±0') return ''
  if (change === 'half-time') return ' ½×'
  if (change === 'double-time') return ' 2×'
  return change.startsWith('+') ? ` ↑${change.slice(1)}` : ` ↓${change.slice(1)}`
}

export class NowPlayingScreen {
  private readonly doc: Document
  private currentTrack: NowPlayingTrack | null = null
  // MCO's latest queue message; its details only apply while its current
  // track is the one loaded here.
  private queue: NowPlayingQueue | null = null
  private showVisualizer = false
  // What the cover and waveform currently show, so queue updates only
  // redraw them when they change.
  private artworkShown: string | null = null
  private waveformShown: number[] | null = null
  private effects: EffectsSettings | null = null
  private sirenHeld = false

  // This session, as seen from the screen: when it started, and what's
  // played so far (a track counts as played by the same rule as MCO's play
  // counts). Each load gets a sequence number, so the same track played
  // twice counts twice.
  private loadSeq = 0
  private sessionStartedAt: number | null = null
  private readonly played: { seq: number; title: string; artist: string }[] = []
  private listened = 0
  private lastPosition = 0
  // The current track's play count and last play from before this load —
  // MCO counts this play partway through, which would otherwise make "last
  // played" read "now".
  private playsBefore: { seq: number; playCount: number; lastPlayedAt: number | null } | null = null
  private readonly timers: ReturnType<typeof setInterval>[]

  // Fills `root` with the screen; `playback` is polled for the progress.
  constructor(
    root: HTMLElement,
    private readonly playback: () => NowPlayingPlayback,
  ) {
    this.doc = root.ownerDocument
    root.innerHTML = NOW_PLAYING_MARKUP
    ;(this.$('logo') as HTMLImageElement).src = logoUrl
    ;(this.$('waiting-logo') as HTMLImageElement).src = logoUrl
    this.renderClock()
    this.timers = [
      setInterval(() => this.tick(), PROGRESS_INTERVAL_MS),
      setInterval(() => this.renderClock(), CLOCK_INTERVAL_MS),
    ]
  }

  dispose(): void {
    for (const timer of this.timers) clearInterval(timer)
  }

  get loaded(): boolean {
    return this.currentTrack !== null
  }

  $(id: string): HTMLElement {
    return this.doc.getElementById(id)!
  }

  // A track starts playing (from `position`).
  load(track: NowPlayingTrack, position: number): void {
    this.currentTrack = track
    this.loadSeq++
    this.sessionStartedAt ??= Date.now()
    this.listened = 0
    this.lastPosition = position
    this.renderTrack()
    this.renderQueue()
    this.layout()
  }

  // Nothing is loaded any more: back to the "Load a song" screen, with no
  // cover behind it (a track loaded again repaints it).
  clear(): void {
    this.currentTrack = null
    this.artworkShown = null
    this.paintBackdrop(null)
    this.layout()
  }

  setQueue(queue: NowPlayingQueue): void {
    this.queue = queue
    this.renderTrack()
    this.renderQueue()
  }

  setEffects(effects: EffectsSettings): void {
    this.effects = effects
    this.renderFx()
  }

  setSirenHeld(held: boolean): void {
    this.sirenHeld = held
    this.renderFx()
  }

  // A visualizer (main.ts's) is on screen instead of the details.
  setShowVisualizer(show: boolean): void {
    this.showVisualizer = show
    this.layout()
  }

  private layout(): void {
    const loaded = this.loaded
    this.$('waiting').hidden = loaded
    this.$('playing').hidden = !loaded || this.showVisualizer
    this.$('topbar').hidden = loaded && this.showVisualizer
    // Drawn at the waveform's on-screen size, which is zero while hidden.
    if (loaded && !this.showVisualizer) this.drawWaveform(this.waveformShown)
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = this.doc.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  // Artwork that 404s (the track has none) falls back to the ♪ placeholder.
  private setArtwork(img: HTMLImageElement, placeholder: HTMLElement, url: string | null, onLoad?: () => void): void {
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
  private paintBackdrop(img: HTMLImageElement | null): void {
    const canvas = this.$('backdrop') as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (img) {
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side * 0.5625, 0, 0, canvas.width, canvas.height)
    }
    canvas.classList.toggle('shown', !!img)
  }

  private currentInfo(): ReceiverTrackInfo | null {
    const queue = this.queue
    return queue?.current && queue.current.trackId === this.currentTrack?.trackId ? queue.current : null
  }

  private renderTrack(): void {
    const track = this.currentTrack
    if (!track) return
    const $ = (id: string) => this.$(id)
    const info = this.currentInfo()
    const title = decode(track.title)
    const artist = decode(track.artist)
    $('title-text').textContent = title
    $('artist').textContent = artist
    $('overlay-title').textContent = title
    $('overlay-artist').textContent = artist

    $('album').textContent = [decode(info?.album ?? null), info?.year ?? ''].filter(Boolean).join(' · ')

    const tags = $('tags')
    tags.replaceChildren()
    for (const genre of info?.genres ?? []) {
      const chip = this.el('span', 'chip genre', genre.name)
      const tint = genre.color && hexToRgba(genre.color, 0.28)
      if (tint) {
        chip.style.background = tint
        chip.style.borderColor = hexToRgba(genre.color!, 0.6)!
      }
      tags.append(chip)
    }
    for (const name of info?.subgenres ?? []) tags.append(this.el('span', 'chip sub', name))

    const stats = $('stats')
    stats.replaceChildren()
    // Always all eight, in the same places; "—" for what isn't known.
    const stat = (label: string, value: string | Node | null, small = false) => {
      const cell = this.el('div')
      const dd = this.el('dd', [small ? 'small' : '', value === null ? 'none' : ''].filter(Boolean).join(' ') || undefined)
      dd.classList.add('ellipsis')
      dd.append(value ?? '—')
      cell.append(this.el('dt', undefined, label), dd)
      stats.append(cell)
    }
    stat('BPM', info?.bpm ? String(Math.round(info.bpm)) : null)
    if (!info?.key) stat('Key', null)
    else {
      const value = this.el('span')
      if (info.keyColor) {
        const dot = this.el('span', 'keydot')
        dot.style.background = info.keyColor
        value.append(dot)
      }
      value.append(info.key)
      stat('Key', value)
    }
    if (!info?.energy) stat('Energy', null)
    else {
      const value = this.el('span', undefined, String(info.energy))
      const meter = this.el('span', 'meter')
      for (let i = 1; i <= 10; i++) meter.append(this.el('i', i <= info.energy ? 'on' : undefined))
      value.append(meter)
      stat('Energy', value)
    }
    stat('Loudness', info?.loudness !== null && info?.loudness !== undefined ? `${info.loudness.toFixed(1).replace('-', '−')} LUFS` : null)
    if (!info) stat('Format', null)
    else {
      const quality = this.el('span', info.bitrate && info.bitrate < LOSSY_FLOOR_KBPS && isLossy(info.format) ? 'lossy' : undefined)
      quality.textContent = [info.format.toUpperCase(), info.bitrate ? `${info.bitrate}k` : ''].filter(Boolean).join(' · ')
      stat('Format', quality)
    }
    stat('Added', info?.addedAt ? formatDate(info.addedAt) : null)
    if (!info) {
      stat('Played', null, true)
      stat('Folder', null, true)
    } else {
      if (!this.playsBefore || this.playsBefore.seq !== this.loadSeq) {
        this.playsBefore = { seq: this.loadSeq, playCount: info.playCount, lastPlayedAt: info.lastPlayedAt }
      }
      const { playCount, lastPlayedAt } = this.playsBefore
      stat('Played', playCount === 0 ? 'First time' : [`${playCount}×`, lastPlayedAt ? ago(lastPlayedAt) : ''].filter(Boolean).join(' · '), true)
      stat('Folder', info.folder, true)
    }

    const overlayMeta = [info?.bpm ? `${Math.round(info.bpm)} BPM` : '', info?.key ?? ''].filter(Boolean)
    const next = this.queue?.upNext[0]
    if (next) overlayMeta.push(`Next: ${decode(next.title)}${next.artist ? ` — ${decode(next.artist)}` : ''}`)
    $('overlay-meta').textContent = overlayMeta.join('  ·  ')

    if (this.artworkShown !== track.artworkUrl) {
      this.artworkShown = track.artworkUrl
      const artwork = $('artwork') as HTMLImageElement
      this.setArtwork(artwork, $('placeholder'), this.artworkShown, () => this.paintBackdrop(artwork))
      if (!this.artworkShown) this.paintBackdrop(null)
    }

    const waveform = info ? this.queue!.waveform : null
    if (waveform !== this.waveformShown) {
      this.waveformShown = waveform
      this.drawWaveform(waveform)
    }
  }

  private renderQueue(): void {
    const list = this.$('upnext')
    list.replaceChildren()
    const earlier = this.played.filter((entry) => entry.seq !== this.loadSeq).slice(-2).reverse()
    // A fixed three upcoming rows and two played ones, so the panel never
    // changes size.
    const upNext = (this.queue?.upNext ?? []).slice(0, UP_NEXT_ROWS)
    for (const track of upNext) {
      const item = this.el('li')
      const thumb = this.el('div', 'thumb')
      const img = this.el('img')
      img.alt = ''
      const placeholder = this.el('div', 'placeholder', '♪')
      thumb.append(img, placeholder)
      this.setArtwork(img, placeholder, track.artworkUrl)

      const text = this.el('div', 'up-text')
      text.append(this.el('div', 'up-title ellipsis', decode(track.title)))
      const sub = [decode(track.artist), track.duration ? formatDuration(track.duration) : ''].filter(Boolean).join('  ·  ')
      text.append(this.el('div', 'up-sub ellipsis', sub))
      const meta = this.el('div', 'up-meta ellipsis')
      const parts: Node[] = []
      if (track.bpm) parts.push(this.mixMark(`${Math.round(track.bpm)} BPM${tempoMove(track.bpmChange)}`, track.bpmMixes))
      if (track.key) parts.push(this.mixMark(track.key, track.keyMixes))
      parts.forEach((part, i) => {
        if (i > 0) meta.append('  ·  ')
        meta.append(part)
      })
      text.append(meta)
      item.append(thumb, text)
      list.append(item)
    }
    for (let i = upNext.length; i < UP_NEXT_ROWS; i++) list.append(this.el('li', 'empty'))
    this.$('played').replaceChildren(
      ...[0, 1].map((i) => {
        const entry = earlier[i]
        if (!entry) return this.el('li', 'ellipsis', i === 0 ? 'Nothing yet this session' : '')
        const item = this.el('li', 'ellipsis', entry.title)
        if (entry.artist) item.append(this.el('span', undefined, ` — ${entry.artist}`))
        return item
      }),
    )
    const count = this.queue?.queuedCount ?? 0
    this.$('queue-count').textContent = count === 0 ? '' : `${count} track${count === 1 ? '' : 's'}`
    this.$('queue-empty').hidden = count > 0
    this.$('queue-duration').textContent = count === 0 ? '—' : formatDuration(this.queue?.queuedDuration ?? 0)
    this.renderClock()
  }

  // A value that mixes well with the track before it gets MCO's accent.
  private mixMark(text: string, mixes: boolean): Node {
    if (!mixes) return this.doc.createTextNode(text)
    return this.el('span', 'mix', `${text} ✓`)
  }

  private drawWaveform(peaks: number[] | null): void {
    const wave = this.$('wave')
    wave.classList.toggle('flat', !peaks || peaks.length === 0)
    if (!peaks || peaks.length === 0) return
    const width = wave.clientWidth
    const height = wave.clientHeight
    const ratio = this.doc.defaultView?.devicePixelRatio || 1
    for (const [id, colour] of [
      ['wave-base', 'rgba(255, 255, 255, 0.22)'],
      ['wave-top', ACCENT],
    ] as const) {
      const canvas = this.$(id) as HTMLCanvasElement
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

  // The progress, and the listening time on the current load (for the
  // session's played count).
  private tick(): void {
    const { currentTime, duration, state } = this.playback()
    const known = Number.isFinite(duration) && duration > 0
    const fraction = known ? Math.min(1, currentTime / duration) : 0
    this.$('wave-fill').style.width = `${fraction * 100}%`
    ;(this.$('bar').firstElementChild as HTMLElement).style.width = `${fraction * 100}%`
    this.$('elapsed').textContent = known ? formatDuration(currentTime) : ''
    this.$('remaining').textContent = known ? `−${formatDuration(duration - currentTime)}` : ''

    const label = state === 'PLAYING' ? 'Playing' : state === 'PAUSED' ? 'Paused' : state === 'BUFFERING' ? 'Loading' : ''
    const pill = this.$('state')
    pill.hidden = !this.currentTrack || !label
    pill.textContent = label
    pill.classList.toggle('playing', state === 'PLAYING')

    if (state === 'PLAYING') this.listened += listenedSeconds(this.lastPosition, currentTime)
    this.lastPosition = currentTime
    const track = this.currentTrack
    if (track && this.listened >= playedThreshold(duration) && this.played[this.played.length - 1]?.seq !== this.loadSeq) {
      this.played.push({ seq: this.loadSeq, title: decode(track.title), artist: decode(track.artist) })
      this.renderQueue()
    }
  }

  private renderClock(): void {
    const now = new Date()
    this.$('clock').textContent = clockTime(now)
    const { currentTime, duration } = this.playback()
    const left = (Number.isFinite(duration) ? duration - currentTime : 0) + (this.queue?.queuedDuration ?? 0)
    this.$('queue-ends').textContent = clockTime(new Date(now.getTime() + left * 1000))
    this.$('session').textContent =
      this.sessionStartedAt === null
        ? ''
        : `Session ${hoursMinutes((now.getTime() - this.sessionStartedAt) / 1000)} · ${this.played.length} played`
  }

  private renderFx(): void {
    const names = this.effects ? activeEffects(this.effects, this.sirenHeld) : []
    this.$('fx').replaceChildren(...names.map((name) => this.el('span', name === 'Siren' ? 'siren' : undefined, name)))
  }
}
