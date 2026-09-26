// Renders the TV-only visualizers (src/cast/tvVisualizers.ts) without the
// GPU: a small 2D canvas with `willReadFrequently`, which makes Chromium
// rasterize it in software, drawn at 30 fps and scaled up to the screen.
// Only filled rectangles, lines and arcs — cheap on a Chromecast's CPU.
import { BeatDetector, logBands, type TvVisualizerId } from '../src/cast/tvVisualizers'

const WIDTH = 480
const HEIGHT = 270
const FRAME_MS = 1000 / 30

// "Color Changing" (every theme's colour option): the hue goes round the
// wheel this many degrees a second — a full turn in about 45 s.
const HUE_DRIFT_PER_SECOND = 8
const CHANGING = 'changing'

const SCOPE_COLOURS: Record<string, string> = { green: '#4ade80', cyan: '#22d3ee', amber: '#fbbf24' }

// Drift: particles carried by a slowly turning flow field.
const DRIFT_PARTICLES = 320
// Hue range (start, span) per palette; mono is drawn in white.
const DRIFT_PALETTES: Record<string, [number, number]> = { aurora: [160, 110], ember: [0, 45], mono: [0, 0] }
// Ripples: rings from the kicks, their outlines shaped by the spectrum.
const RIPPLE_POINTS = 96
const RIPPLE_PALETTES: Record<string, [number, number]> = { neon: [280, 120], ice: [185, 40], sunset: [340, 60] }
// Mandala: a motif drawn in one wedge, mirrored and repeated round.
const MANDALA_BANDS = 16
// Hue start/span and lightness per palette.
const MANDALA_PALETTES: Record<string, [number, number, number]> = { jewel: [190, 170, 58], pastel: [300, 140, 76] }
interface Ripple {
  r: number
  speed: number
  life: number
  hue: number
  spin: number
  spinRate: number
  seed: number
  // A few sine wobbles around the ring (k lobes each), each drifting in
  // phase and following one spectrum band — together they make each ring's
  // own, changing shape.
  harmonics: { k: number; phase: number; rate: number; weight: number; band: number }[]
}

function newRipple(hue: number, speed: number, life: number): Ripple {
  const lobes = [2, 3, 4, 5, 6, 7, 9].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2))
  return {
    r: 8,
    speed,
    life,
    hue,
    spin: Math.random() * Math.PI * 2,
    spinRate: (Math.random() - 0.5) * 0.6,
    seed: Math.random() * 10,
    harmonics: lobes.map((k) => ({
      k,
      phase: Math.random() * Math.PI * 2,
      rate: (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.9),
      weight: 0.03 + Math.random() * 0.07,
      band: Math.floor(Math.random() * 12),
    })),
  }
}

export class TvVisualizer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private theme: TvVisualizerId = 'tv-drift'
  private options: Record<string, string> = {}
  private running = false
  private frame = 0
  private lastDraw = 0
  private freq = new Uint8Array(1024)
  private time = new Uint8Array(2048)
  private flash = 0
  private beats = new BeatDetector()
  private t = 0
  private drift: { x: number; y: number; age: number }[] = []
  private ripples: Ripple[] = []

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
    this.drift = []
    this.ripples = []
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

  // The slowly turning hue for "Color Changing".
  private shiftingHue(): number {
    return (this.t * HUE_DRIFT_PER_SECOND) % 360
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
    if (this.theme === 'tv-scope') this.drawScope()
    else if (this.theme === 'tv-drift') this.drawDrift(dt, sampleRate, bass, beat)
    else if (this.theme === 'tv-ripples') this.drawRipples(dt, sampleRate, bass, beat)
    else this.drawMandala(sampleRate, bass)
  }

  private drawScope(): void {
    const ctx = this.ctx
    const colour =
      this.options.colour === CHANGING
        ? `hsl(${this.shiftingHue()}, 85%, 60%)`
        : (SCOPE_COLOURS[this.options.colour] ?? SCOPE_COLOURS.green)
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

  private drawDrift(dt: number, sampleRate: number, bass: number, beat: boolean): void {
    const ctx = this.ctx
    const [hueStart, hueSpan] =
      this.options.palette === CHANGING
        ? [this.shiftingHue(), 100]
        : (DRIFT_PALETTES[this.options.palette] ?? DRIFT_PALETTES.aurora)
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
    const [hueStart, hueSpan] =
      this.options.palette === CHANGING
        ? [this.shiftingHue(), 90]
        : (RIPPLE_PALETTES[this.options.palette] ?? RIPPLE_PALETTES.neon)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    const bands = logBands(this.freq, sampleRate, 12)
    // The rings rise from the middle of the bottom edge.
    const cx = WIDTH / 2
    const cy = HEIGHT + 6
    if (beat && this.ripples.length < 14) this.ripples.push(newRipple(hueStart + Math.random() * hueSpan, 60 + bass * 140, 1))
    // Something keeps moving in a quiet passage.
    const last = this.ripples[this.ripples.length - 1]
    if (!last || (last.r > 90 && Math.random() < dt)) this.ripples.push(newRipple(hueStart + Math.random() * hueSpan, 40, 0.6))
    for (const ring of this.ripples) {
      ring.r += ring.speed * dt
      ring.life -= dt * 0.35
      ring.spin += ring.spinRate * dt
      for (const h of ring.harmonics) h.phase += h.rate * dt
      // The outline morphs as it goes: each ring has its own few wobbles,
      // drifting in phase and swelling with the spectrum band they follow,
      // and its own stretch that slowly breathes.
      const stretchX = 1.25 + 0.22 * Math.sin(this.t * 0.35 + ring.seed)
      const stretchY = 1 - 0.18 * Math.sin(this.t * 0.27 + ring.seed * 2)
      ctx.strokeStyle = `hsla(${ring.hue}, 90%, 62%, ${Math.max(0, ring.life)})`
      ctx.lineWidth = 1 + ring.life * 2
      ctx.beginPath()
      for (let i = 0; i <= RIPPLE_POINTS; i++) {
        const a = (i / RIPPLE_POINTS) * Math.PI * 2
        let wobble = 0
        for (const h of ring.harmonics) {
          wobble += h.weight * (0.4 + bands[h.band] * 1.6) * Math.sin(h.k * a + h.phase)
        }
        const r = ring.r * (1 + wobble)
        const angle = a + ring.spin
        const x = cx + Math.cos(angle) * r * stretchX
        const y = cy + Math.sin(angle) * r * stretchY
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    this.ripples = this.ripples.filter((ring) => ring.life > 0 && ring.r < WIDTH * 1.2)
  }

  private drawMandala(sampleRate: number, bass: number): void {
    const ctx = this.ctx
    const segments = Number(this.options.symmetry) || 8
    const [hueStart, hueSpan, light] =
      this.options.palette === CHANGING
        ? [this.shiftingHue(), 120, 60]
        : (MANDALA_PALETTES[this.options.palette] ?? MANDALA_PALETTES.jewel)
    const bands = logBands(this.freq, sampleRate, MANDALA_BANDS)
    // Soft trails rather than a hard clear.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    const zoom = 1 + this.flash * 0.12 + bass * 0.08
    const maxR = HEIGHT * 0.5 * zoom
    // Half a wedge's angle: the motif stays inside it, so the mirrored
    // copies meet at the seams.
    const halfTan = Math.tan(Math.PI / segments) * 0.92
    ctx.save()
    ctx.translate(WIDTH / 2, HEIGHT / 2)
    ctx.rotate(this.t * 0.12)
    ctx.lineCap = 'round'
    for (let seg = 0; seg < segments; seg++) {
      ctx.save()
      ctx.rotate((seg * Math.PI * 2) / segments)
      for (const mirror of [1, -1]) {
        ctx.save()
        ctx.scale(1, mirror)
        // Petal: a line out from the centre whose sway follows the spectrum.
        ctx.beginPath()
        ctx.moveTo(0, 0)
        for (let i = 1; i <= MANDALA_BANDS; i++) {
          const r = (i / MANDALA_BANDS) * maxR
          const sway = 0.5 + 0.5 * Math.sin(this.t * 0.7 + i * 0.55 + bands[i - 1] * 3)
          ctx.lineTo(r, r * halfTan * sway)
        }
        ctx.strokeStyle = `hsla(${hueStart + hueSpan * 0.2}, 80%, ${light}%, 0.8)`
        ctx.lineWidth = 1.4
        ctx.stroke()
        // Beads along it, sized by their band, and a second, inner line.
        for (let i = 2; i <= MANDALA_BANDS; i += 2) {
          const r = (i / MANDALA_BANDS) * maxR
          const band = bands[i - 1]
          const y = r * halfTan * (0.35 + 0.3 * Math.sin(this.t * 0.9 - i * 0.4))
          ctx.fillStyle = `hsla(${hueStart + (i / MANDALA_BANDS) * hueSpan}, 85%, ${light}%, ${0.35 + band * 0.65})`
          ctx.beginPath()
          ctx.arc(r, y, 0.8 + band * 5, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.beginPath()
        for (let i = 0; i <= MANDALA_BANDS; i++) {
          const r = (i / MANDALA_BANDS) * maxR * 0.7
          const y = r * halfTan * (0.15 + 0.25 * (bands[Math.min(MANDALA_BANDS - 1, i)] ?? 0))
          if (i === 0) ctx.moveTo(r, y)
          else ctx.lineTo(r, y)
        }
        ctx.strokeStyle = `hsla(${hueStart + hueSpan * 0.7}, 75%, ${light + 10}%, 0.6)`
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.restore()
      }
      ctx.restore()
    }
    // A glowing centre on the bass.
    ctx.fillStyle = `hsla(${hueStart + hueSpan * 0.5}, 90%, ${light}%, ${0.3 + bass * 0.6})`
    ctx.beginPath()
    ctx.arc(0, 0, 3 + bass * 14 * zoom, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}
