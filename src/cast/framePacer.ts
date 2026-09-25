// Paces the cast picture at a steady frame rate. Frames are drawn in step
// with the display (requestAnimationFrame) while the window is visible —
// a plain timer drifts and bunches up, and those uneven gaps become
// repeated/dropped frames once ffmpeg resamples to a constant 30 fps,
// which shows on the TV as stutter. rAF stops while the window is hidden
// or minimised, so a timer takes over whenever it goes quiet.
//
// Also measures what's actually delivered (frames per second and the
// average time a frame takes to draw), reported once a second.

export interface FrameStats {
  fps: number
  drawMs: number
}

// How long rAF has to be silent before the timer takes over.
const RAF_STALL_MS = 100
// Early tolerance: a vsync landing just before a frame is due still
// counts, or at 60 Hz frames would slip to every third vsync.
const EARLY_SLACK_MS = 4

// Pure scheduling decision, kept separate so it's testable without timers.
export class FrameClock {
  private next: number | null = null

  constructor(private readonly intervalMs: number) {}

  // True when a frame is due at `now` (and books the next one).
  due(now: number): boolean {
    if (this.next === null) {
      this.next = now + this.intervalMs
      return true
    }
    if (now < this.next - EARLY_SLACK_MS) return false
    this.next += this.intervalMs
    // Fell well behind (a long stall): restart the schedule from now
    // rather than firing a burst of catch-up frames.
    if (now - this.next > this.intervalMs) this.next = now + this.intervalMs
    return true
  }
}

export class FramePacer {
  private clock: FrameClock
  private raf = 0
  private timer: ReturnType<typeof setInterval>
  private lastRafAt = -Infinity
  private frames = 0
  private drawTotalMs = 0
  private statsSince = performance.now()
  private stopped = false

  constructor(
    fps: number,
    private readonly drawFrame: () => void,
    private readonly onStats: (stats: FrameStats) => void,
  ) {
    this.clock = new FrameClock(1000 / fps)
    const onAnimationFrame = () => {
      if (this.stopped) return
      this.raf = requestAnimationFrame(onAnimationFrame)
      this.lastRafAt = performance.now()
      this.tick(this.lastRafAt)
    }
    this.raf = requestAnimationFrame(onAnimationFrame)
    this.timer = setInterval(() => {
      const now = performance.now()
      if (now - this.lastRafAt > RAF_STALL_MS) this.tick(now)
    }, 1000 / fps / 2)
  }

  stop(): void {
    this.stopped = true
    cancelAnimationFrame(this.raf)
    clearInterval(this.timer)
  }

  private tick(now: number): void {
    if (this.clock.due(now)) {
      const start = performance.now()
      this.drawFrame()
      this.drawTotalMs += performance.now() - start
      this.frames++
    }
    const elapsed = now - this.statsSince
    if (elapsed >= 1000) {
      this.onStats({
        fps: (this.frames * 1000) / elapsed,
        drawMs: this.frames > 0 ? this.drawTotalMs / this.frames : 0,
      })
      this.frames = 0
      this.drawTotalMs = 0
      this.statsSince = now
    }
  }
}
