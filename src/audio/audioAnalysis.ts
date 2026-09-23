// Frequency-band and beat analysis for the Visualizer. The pure helpers
// (computeBands, BeatDetector) take raw AnalyserNode output so they're
// testable without a real AudioContext.

// The current track's AnalyserNode. Player.tsx remounts per track (and
// so does its EffectsChain/AnalyserNode), while the Visualizer stays open
// across track changes — it re-reads this every frame instead of
// capturing one node. Deliberately a plain module variable, not zustand
// state: nothing should re-render when it changes, and the Visualizer's
// render loop polls it anyway.
let activeAnalyser: AnalyserNode | null = null

export function setActiveAnalyser(analyser: AnalyserNode | null): void {
  activeAnalyser = analyser
}

export function getActiveAnalyser(): AnalyserNode | null {
  return activeAnalyser
}

export interface Bands {
  bass: number // 0..1
  mid: number // 0..1
  high: number // 0..1
}

const BASS_HZ: [number, number] = [20, 250]
const MID_HZ: [number, number] = [250, 4000]
const HIGH_HZ: [number, number] = [4000, 16000]

function averageRange(freq: Uint8Array, binHz: number, [lo, hi]: [number, number]): number {
  const start = Math.max(0, Math.floor(lo / binHz))
  const end = Math.min(freq.length - 1, Math.ceil(hi / binHz))
  if (end < start) return 0
  let sum = 0
  for (let i = start; i <= end; i++) sum += freq[i]
  return sum / (end - start + 1) / 255
}

// `freq` is getByteFrequencyData() output: freq.length === fftSize / 2
// bins spanning 0..sampleRate/2.
export function computeBands(freq: Uint8Array, sampleRate: number): Bands {
  const binHz = sampleRate / 2 / freq.length
  return {
    bass: averageRange(freq, binHz, BASS_HZ),
    mid: averageRange(freq, binHz, MID_HZ),
    high: averageRange(freq, binHz, HIGH_HZ),
  }
}

// Flags a kick when bass energy jumps well above its own recent average —
// a fixed threshold would either fire constantly on bass-heavy tracks or
// never on quiet ones. The refractory period stops one kick's decay from
// registering as several beats.
export class BeatDetector {
  private average = 0
  private lastBeatMs = -Infinity

  constructor(
    private readonly sensitivity = 1.35,
    private readonly minLevel = 0.25,
    private readonly refractoryMs = 250,
    private readonly smoothing = 0.93,
  ) {}

  update(bass: number, nowMs: number): boolean {
    const isBeat =
      bass > this.minLevel && bass > this.average * this.sensitivity && nowMs - this.lastBeatMs >= this.refractoryMs
    this.average = this.average * this.smoothing + bass * (1 - this.smoothing)
    if (isBeat) this.lastBeatMs = nowMs
    return isBeat
  }
}

// Splits the spectrum into `bars` log-spaced [startBin, endBin] ranges
// (inclusive) between minHz and maxHz, so each bar covers a similar
// musical range — linear bins would spend nearly every bar on treble.
export function logBinRanges(
  binCount: number,
  sampleRate: number,
  bars: number,
  minHz: number,
  maxHz: number,
): Array<[number, number]> {
  const binHz = sampleRate / 2 / binCount
  const ranges: Array<[number, number]> = []
  for (let i = 0; i < bars; i++) {
    const lo = minHz * (maxHz / minHz) ** (i / bars)
    const hi = minHz * (maxHz / minHz) ** ((i + 1) / bars)
    const start = Math.min(binCount - 1, Math.floor(lo / binHz))
    const end = Math.min(binCount - 1, Math.max(start, Math.ceil(hi / binHz)))
    ranges.push([start, end])
  }
  return ranges
}

// Attack fast, release slow — raw analyser values flicker too much to
// drive visuals directly.
export function follow(current: number, target: number, attack = 0.5, release = 0.08): number {
  return current + (target - current) * (target > current ? attack : release)
}
