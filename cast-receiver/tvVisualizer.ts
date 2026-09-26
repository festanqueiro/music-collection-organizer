// Renders the TV-only visualizers (src/cast/tvVisualizers.ts) without the
// GPU: a small 2D canvas with `willReadFrequently`, which makes Chromium
// rasterize it in software, drawn at 30 fps and scaled up to the screen.
// Only filled rectangles, lines and arcs — cheap on a Chromecast's CPU.
import {
  BeatDetector,
  ballistic,
  logBands,
  rmsDb,
  type TvVisualizerId,
} from '../src/cast/tvVisualizers'

const WIDTH = 480
const HEIGHT = 270
const FRAME_MS = 1000 / 30

const SPECTRUM_BARS = 32
const SPECTRUM_SEGMENTS = 14

const SPECTRUM_COLOURS: Record<string, [string, string, string]> = {
  // low, mid, top segment colours
  classic: ['#22c55e', '#eab308', '#ef4444'],
  mco: ['#818cf8', '#c084fc', '#f472b6'],
  amber: ['#b45309', '#f59e0b', '#fde68a'],
}
const SCOPE_COLOURS: Record<string, string> = { green: '#4ade80', cyan: '#22d3ee', amber: '#fbbf24' }

export class TvVisualizer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private theme: TvVisualizerId = 'tv-spectrum'
  private options: Record<string, string> = {}
  private running = false
  private frame = 0
  private lastDraw = 0
  private freq = new Uint8Array(1024)
  private time = new Uint8Array(2048)
  private peaks = new Array<number>(SPECTRUM_BARS).fill(0)
  private levels = new Array<number>(SPECTRUM_BARS).fill(0)
  private needles = [0, 0]
  private flash = 0
  private beats = new BeatDetector()

  constructor(
    host: HTMLElement,
    private readonly analyser: () => AnalyserNode | null,
  ) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = WIDTH
    this.canvas.height = HEIGHT
    Object.assign(this.canvas.style, { width: '100%', height: '100%', display: 'block' })
    host.append(this.canvas)
    this.ctx = this.canvas.getContext('2d', { alpha: false, willReadFrequently: true })!
  }

  setTheme(theme: TvVisualizerId, options: Record<string, string>): void {
    this.theme = theme
    this.options = options
    // Pixels for the LED look; smooth lines for the scope and meters.
    this.canvas.style.imageRendering = theme === 'tv-spectrum' ? 'pixelated' : 'auto'
    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }

  start(): void {
    if (this.running) return
    this.running = true
    const loop = (now: number) => {
      if (!this.running) return
      this.frame = requestAnimationFrame(loop)
      if (now - this.lastDraw < FRAME_MS - 2) return
      const dt = Math.min(0.1, (now - this.lastDraw) / 1000)
      this.lastDraw = now
      this.draw(dt)
    }
    this.frame = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.frame)
  }

  private draw(dt: number): void {
    const analyser = this.analyser()
    if (analyser) {
      if (this.freq.length !== analyser.frequencyBinCount) this.freq = new Uint8Array(analyser.frequencyBinCount)
      if (this.time.length !== analyser.fftSize) this.time = new Uint8Array(analyser.fftSize)
      analyser.getByteFrequencyData(this.freq)
      analyser.getByteTimeDomainData(this.time)
    } else {
      this.freq.fill(0)
      this.time.fill(128)
    }
    const sampleRate = analyser?.context.sampleRate ?? 44100
    const bass = logBands(this.freq, sampleRate, 1, 40, 150)[0]
    const beat = this.beats.update(bass, dt)
    this.flash = beat ? 1 : Math.max(0, this.flash - dt * 4)

    if (this.theme === 'tv-spectrum') this.drawSpectrum(dt, sampleRate)
    else if (this.theme === 'tv-scope') this.drawScope()
    else this.drawVu(dt, bass)
  }

  private drawSpectrum(dt: number, sampleRate: number): void {
    const ctx = this.ctx
    const [low, mid, top] = SPECTRUM_COLOURS[this.options.colours] ?? SPECTRUM_COLOURS.classic
    ctx.fillStyle = `rgb(${Math.round(this.flash * 18)}, ${Math.round(this.flash * 12)}, ${Math.round(this.flash * 24)})`
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    const bands = logBands(this.freq, sampleRate, SPECTRUM_BARS)
    const margin = 24
    const gap = 3
    const barWidth = (WIDTH - margin * 2 - gap * (SPECTRUM_BARS - 1)) / SPECTRUM_BARS
    const segmentHeight = (HEIGHT - margin * 2) / SPECTRUM_SEGMENTS
    for (let i = 0; i < SPECTRUM_BARS; i++) {
      this.levels[i] = ballistic(this.levels[i], bands[i], dt, 0.03, 0.12)
      this.peaks[i] = Math.max(this.levels[i], ballistic(this.peaks[i], 0, dt, 0.01, 0.9))
      const x = margin + i * (barWidth + gap)
      const lit = Math.round(this.levels[i] * SPECTRUM_SEGMENTS)
      for (let s = 0; s < lit; s++) {
        ctx.fillStyle = s >= SPECTRUM_SEGMENTS - 2 ? top : s >= SPECTRUM_SEGMENTS * 0.6 ? mid : low
        ctx.fillRect(x, HEIGHT - margin - (s + 1) * segmentHeight + 1, barWidth, segmentHeight - 2)
      }
      const peakSegment = Math.min(SPECTRUM_SEGMENTS - 1, Math.round(this.peaks[i] * SPECTRUM_SEGMENTS))
      if (peakSegment > 0) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(x, HEIGHT - margin - (peakSegment + 1) * segmentHeight + 1, barWidth, 2)
      }
    }
  }

  private drawScope(): void {
    const ctx = this.ctx
    const colour = SCOPE_COLOURS[this.options.colour] ?? SCOPE_COLOURS.green
    // Fading the last frame instead of clearing it leaves a phosphor trail.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= WIDTH; x += WIDTH / 10) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, HEIGHT)
    }
    for (let y = 0; y <= HEIGHT; y += HEIGHT / 8) {
      ctx.moveTo(0, y)
      ctx.lineTo(WIDTH, y)
    }
    ctx.stroke()
    // Starts at a rising zero crossing so the trace holds still.
    let start = 0
    for (let i = 1; i < this.time.length / 2; i++) {
      if (this.time[i - 1] < 128 && this.time[i] >= 128) {
        start = i
        break
      }
    }
    const samples = Math.min(this.time.length - start, 1024)
    ctx.strokeStyle = colour
    ctx.lineWidth = 1.5 + this.flash * 1.5
    ctx.beginPath()
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * WIDTH
      const y = HEIGHT / 2 + ((this.time[start + i] - 128) / 128) * (HEIGHT * 0.42)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  private drawVu(dt: number, bass: number): void {
    const ctx = this.ctx
    const black = this.options.face === 'black'
    ctx.fillStyle = '#0b0b0f'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    // Level: -20 dB .. +3 dB (0 VU at -12 dBFS); Bass: 0..1 of the low band.
    const db = rmsDb(this.time)
    const level = Math.min(1, Math.max(0, (db + 12 + 20) / 23))
    this.needles[0] = ballistic(this.needles[0], level, dt, 0.15, 0.3)
    this.needles[1] = ballistic(this.needles[1], bass, dt, 0.08, 0.25)
    const faceWidth = 200
    const faceHeight = 130
    const y = (HEIGHT - faceHeight) / 2
    ;[
      { x: 26, value: this.needles[0], label: 'VU', red: 20 / 23 },
      { x: WIDTH - 26 - faceWidth, value: this.needles[1], label: 'BASS', red: 0.85 },
    ].forEach(({ x, value, label, red }) => {
      ctx.save()
      // The needle pivots below the face; everything is clipped to it.
      ctx.beginPath()
      ctx.rect(x, y, faceWidth, faceHeight)
      ctx.clip()
      ctx.fillStyle = black ? '#16161c' : '#efe6c8'
      ctx.fillRect(x, y, faceWidth, faceHeight)
      const cx = x + faceWidth / 2
      const cy = y + faceHeight + 40
      const radius = 135
      const from = -Math.PI / 2 - 0.75
      const to = -Math.PI / 2 + 0.75
      const scale = black ? '#d4d4d8' : '#222'
      // Scale arc: black, then red past the red line.
      ctx.lineWidth = 3
      ctx.strokeStyle = scale
      ctx.beginPath()
      ctx.arc(cx, cy, radius - 20, from, from + (to - from) * red)
      ctx.stroke()
      ctx.strokeStyle = '#dc2626'
      ctx.beginPath()
      ctx.arc(cx, cy, radius - 20, from + (to - from) * red, to)
      ctx.stroke()
      ctx.lineWidth = 1.5
      for (let t = 0; t <= 10; t++) {
        const a = from + ((to - from) * t) / 10
        const inner = t % 5 === 0 ? radius - 32 : radius - 27
        ctx.strokeStyle = t / 10 >= red ? '#dc2626' : scale
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner)
        ctx.lineTo(cx + Math.cos(a) * (radius - 20), cy + Math.sin(a) * (radius - 20))
        ctx.stroke()
      }
      ctx.fillStyle = scale
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(label, cx, y + faceHeight - 14)
      // Peak LED
      ctx.fillStyle = value >= red ? '#ef4444' : black ? '#3f1d1d' : '#c9b9a0'
      ctx.beginPath()
      ctx.arc(x + faceWidth - 16, y + 16, 5, 0, Math.PI * 2)
      ctx.fill()
      // Needle
      const angle = from + (to - from) * value
      ctx.strokeStyle = black ? '#fbbf24' : '#111'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * 40, cy + Math.sin(angle) * 40)
      ctx.lineTo(cx + Math.cos(angle) * (radius - 8), cy + Math.sin(angle) * (radius - 8))
      ctx.stroke()
      ctx.restore()
      ctx.strokeStyle = '#555'
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, faceWidth, faceHeight)
    })
  }
}
