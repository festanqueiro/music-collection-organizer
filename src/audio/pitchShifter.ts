// src/audio/pitchShifter.ts
//
// A low-latency pitch shifter for the mic (run on the audio thread by
// micWorklet.ts; plain code so it's testable). Two read heads sweep a short
// delay line at the pitch ratio's speed, half a window apart, each faded in
// and out with a Hann window so the pair always sums to full level. Formants
// move with the pitch — chipmunk up, monster down — which is the effect.
//
// Latency is at most one window (WINDOW_SECONDS). Mix blends the shifted
// voice with the dry one: 1 is only shifted, below that a harmony.

export const WINDOW_SECONDS = 0.05
// How fast the ratio and mix follow a change (per sample), so knob moves
// don't click.
const SMOOTHING = 0.9995

export function semitonesToRatio(semitones: number): number {
  return Math.pow(2, semitones / 12)
}

export class PitchShifter {
  private buffer: Float32Array
  private write = 0
  private phase = 0
  private window: number
  private ratio = 1
  private targetRatio = 1
  private mix = 0
  private targetMix = 0

  constructor(sampleRate: number) {
    this.window = Math.round(sampleRate * WINDOW_SECONDS)
    // Room for the window plus the interpolation's next sample.
    this.buffer = new Float32Array(this.window + 4)
  }

  // `mix` 0 passes the voice through untouched (and cheaply).
  set(semitones: number, mix: number): void {
    this.targetRatio = semitonesToRatio(semitones)
    this.targetMix = Math.min(1, Math.max(0, mix))
  }

  process(input: Float32Array, output: Float32Array): void {
    const size = this.buffer.length
    for (let i = 0; i < output.length; i++) {
      const dry = input[i] ?? 0
      this.buffer[this.write] = dry
      this.ratio = SMOOTHING * this.ratio + (1 - SMOOTHING) * this.targetRatio
      this.mix = SMOOTHING * this.mix + (1 - SMOOTHING) * this.targetMix

      let wet = 0
      if (this.mix > 1e-4) {
        // The delay shrinks (ratio > 1: read faster than written) or grows
        // (ratio < 1) by (1 - ratio) samples per sample; wrapping the phase
        // jumps a head back across the window while its fade is at zero.
        this.phase += (1 - this.ratio) / this.window
        this.phase -= Math.floor(this.phase)
        for (let head = 0; head < 2; head++) {
          const p = (this.phase + head * 0.5) % 1
          const delay = p * (this.window - 1) + 1
          let read = this.write - delay
          if (read < 0) read += size
          const index = Math.floor(read)
          const frac = read - index
          const a = this.buffer[index]
          const b = this.buffer[(index + 1) % size]
          const fade = Math.sin(Math.PI * p)
          wet += (a + (b - a) * frac) * fade * fade
        }
      }
      output[i] = dry * (1 - this.mix) + wet * this.mix
      this.write = (this.write + 1) % size
    }
  }
}
