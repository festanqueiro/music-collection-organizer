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

// Drift: particles carried by a slowly turning flow field.
const DRIFT_PARTICLES = 320
// Hue range (start, span) per palette; mono is drawn in white.
const DRIFT_PALETTES: Record<string, [number, number]> = { aurora: [160, 110], ember: [0, 45], mono: [0, 0] }
// Ripples: rings from the kicks, their outlines shaped by the spectrum.
const RIPPLE_POINTS = 72
const RIPPLE_PALETTES: Record<string, [number, number]> = { neon: [280, 120], ice: [185, 40], sunset: [340, 60] }
// Ridges: the spectrum's recent history as stacked lines.
const RIDGE_LINES = 26
const RIDGE_POINTS = 72

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
  private t = 0
  private drift: { x: number; y: number; age: number }[] = []
  private ripples: { r: number; speed: number; life: number; hue: number; twist: number }[] = []
  private ridges: number[][] = []
  private ridgeClock = 0

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
    this.drift = []
    this.ripples = []
    this.ridges = []
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

    this.t += dt
    if (this.theme === 'tv-spectrum') this.drawSpectrum(dt, sampleRate)
    else if (this.theme === 'tv-scope') this.drawScope()
    else if (this.theme === 'tv-vu') this.drawVu(dt, bass)
    else if (this.theme === 'tv-drift') this.drawDrift(dt, sampleRate, bass, beat)
    else if (this.theme === 'tv-ripples') this.drawRipples(dt, sampleRate, bass, beat)
    else this.drawRidges(dt, sampleRate)
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

  private drawDrift(dt: number, sampleRate: number, bass: number, beat: boolean): void {
    const ctx = this.ctx
    const [hueStart, hueSpan] = DRIFT_PALETTES[this.options.palette] ?? DRIFT_PALETTES.aurora
    const mono = this.options.palette === 'mono'
    const bands = logBands(this.freq, sampleRate, 3)
    const energy = (bands[0] + bands[1] + bands[2]) / 3
    // Fading instead of clearing leaves the trails.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.09)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    while (this.drift.length < DRIFT_PARTICLES) {
      this.drift.push({ x: Math.random() * WIDTH, y: Math.random() * HEIGHT, age: Math.random() * 400 })
    }
    const speed = (0.4 + energy * 3.2 + (beat ? 5 : 0)) * dt * 30
    const cx = WIDTH / 2
    const cy = HEIGHT / 2
    for (const p of this.drift) {
      const angle =
        Math.sin(p.x * 0.011 + this.t * 0.23) * Math.cos(p.y * 0.017 - this.t * 0.17) * Math.PI * 2 + bands[1] * 2
      let vx = Math.cos(angle) * speed
      let vy = Math.sin(angle) * speed
      if (beat) {
        // Kicks throw everything outward from the centre.
        const dx = p.x - cx
        const dy = p.y - cy
        const d = Math.hypot(dx, dy) || 1
        vx += (dx / d) * 6 * bass
        vy += (dy / d) * 6 * bass
      }
      p.x += vx
      p.y += vy
      p.age += 1
      if (p.x < 0 || p.x > WIDTH || p.y < 0 || p.y > HEIGHT || p.age > 500) {
        p.x = Math.random() * WIDTH
        p.y = Math.random() * HEIGHT
        p.age = 0
      }
      const hue = hueStart + ((p.x / WIDTH) * 0.6 + bands[2] * 0.4) * hueSpan
      const light = 45 + energy * 35
      ctx.fillStyle = mono ? `hsl(0, 0%, ${light + 10}%)` : `hsl(${hue}, 85%, ${light}%)`
      const size = 1.2 + bass * 1.6
      ctx.fillRect(p.x, p.y, size, size)
    }
  }

  private drawRipples(dt: number, sampleRate: number, bass: number, beat: boolean): void {
    const ctx = this.ctx
    const [hueStart, hueSpan] = RIPPLE_PALETTES[this.options.palette] ?? RIPPLE_PALETTES.neon
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    const shape = logBands(this.freq, sampleRate, 12)
    const cx = WIDTH / 2
    const cy = HEIGHT / 2
    if (beat && this.ripples.length < 14) {
      this.ripples.push({ r: 8, speed: 60 + bass * 140, life: 1, hue: hueStart + Math.random() * hueSpan, twist: Math.random() * Math.PI })
    }
    // Something keeps moving in a quiet passage.
    if (this.ripples.length === 0 || (this.ripples[this.ripples.length - 1].r > 90 && Math.random() < dt)) {
      this.ripples.push({ r: 8, speed: 40, life: 0.6, hue: hueStart + Math.random() * hueSpan, twist: Math.random() * Math.PI })
    }
    // A core that swells with the bass.
    const core = 6 + bass * 34
    ctx.fillStyle = `hsla(${hueStart + hueSpan / 2}, 90%, 60%, ${0.25 + bass * 0.5})`
    ctx.beginPath()
    ctx.arc(cx, cy, core, 0, Math.PI * 2)
    ctx.fill()
    for (const ring of this.ripples) {
      ring.r += ring.speed * dt
      ring.life -= dt * 0.35
      ring.twist += dt * 0.4
      ctx.strokeStyle = `hsla(${ring.hue}, 90%, 62%, ${Math.max(0, ring.life)})`
      ctx.lineWidth = 1 + ring.life * 2
      ctx.beginPath()
      for (let i = 0; i <= RIPPLE_POINTS; i++) {
        const a = (i / RIPPLE_POINTS) * Math.PI * 2
        // The outline wobbles with the spectrum, going round the ring.
        const band = shape[Math.floor((i / RIPPLE_POINTS) * shape.length) % shape.length]
        const r = ring.r * (1 + band * 0.18 * Math.sin(a * 5 + ring.twist))
        const x = cx + Math.cos(a) * r * 1.25
        const y = cy + Math.sin(a) * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    this.ripples = this.ripples.filter((ring) => ring.life > 0 && ring.r < WIDTH)
  }

  private drawRidges(dt: number, sampleRate: number): void {
    const ctx = this.ctx
    const paper = this.options.ink === 'paper'
    // A new line every ~70 ms; the stack rolls up the screen.
    this.ridgeClock += dt
    if (this.ridgeClock > 0.07 || this.ridges.length === 0) {
      this.ridgeClock = 0
      const bands = logBands(this.freq, sampleRate, RIDGE_POINTS / 2, 40, 12000)
      // Mirrored, loudest in the middle, under a bell-shaped envelope.
      const line = [...bands.slice().reverse(), ...bands].map((v, i) => {
        const x = i / (RIDGE_POINTS - 1) - 0.5
        return v * Math.exp(-(x * x) / 0.045) + Math.random() * 0.015
      })
      this.ridges.unshift(line)
      if (this.ridges.length > RIDGE_LINES) this.ridges.pop()
    }
    ctx.fillStyle = paper ? '#efe9dc' : '#000'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    const left = WIDTH * 0.2
    const width = WIDTH * 0.6
    const top = HEIGHT * 0.12
    const spacing = (HEIGHT * 0.8) / RIDGE_LINES
    ctx.lineWidth = 1.2
    ctx.strokeStyle = paper ? '#111' : '#f4f4f5'
    ctx.fillStyle = paper ? '#efe9dc' : '#000'
    // Back (top) to front (bottom): each line hides the ones behind it.
    for (let i = this.ridges.length - 1; i >= 0; i--) {
      const base = top + (RIDGE_LINES - 1 - i) * spacing + spacing
      const line = this.ridges[i]
      ctx.beginPath()
      ctx.moveTo(left, base)
      for (let p = 0; p < line.length; p++) {
        ctx.lineTo(left + (p / (line.length - 1)) * width, base - line[p] * spacing * 5)
      }
      ctx.lineTo(left + width, base)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  }
}
