// src/audio/micWorklet.ts
//
// Runs on the audio thread (an AudioWorklet, loaded by mic.ts), early in
// the mic's voice chain:
// - a noise gate: below the threshold the voice is turned down (to -40 dB,
//   not silence, so it doesn't sound chopped), opening fast and closing
//   gently after a short hold;
// - a peak meter of what comes in (after the gain knob), for the level
//   meter and clip light;
// - the voice's level after the gate, which mic.ts uses to duck the music.
// Levels are posted about 50 times a second. The threshold arrives as a
// message: { gateDb }.

// Audio-thread globals: see worklet-globals.d.ts.

const GATE_OFF_DB = -80
const FLOOR_GAIN = 0.01 // -40 dB
const HOLD_SECONDS = 0.15
const REPORT_EVERY_BLOCKS = 8 // 128-frame blocks: ~21 ms at 48 kHz

function dbToAmplitude(db: number): number {
  return Math.pow(10, db / 20)
}

// One-pole coefficient for a time constant in seconds.
function coefficient(seconds: number): number {
  return Math.exp(-1 / (seconds * sampleRate))
}

class MicProcessor extends AudioWorkletProcessor {
  private threshold = dbToAmplitude(-55)
  private gateOn = true
  private envelope = 0
  private gain = 1
  private holdSamples = 0
  private peak = 0
  private voice = 0
  private blocks = 0
  private envAttack = coefficient(0.001)
  private envRelease = coefficient(0.1)
  private gainOpen = coefficient(0.002)
  private gainClose = coefficient(0.08)

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<{ gateDb?: number }>) => {
      if (typeof e.data.gateDb === 'number') {
        this.gateOn = e.data.gateDb > GATE_OFF_DB
        this.threshold = dbToAmplitude(e.data.gateDb)
      }
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]
    const output = outputs[0]
    const frames = output[0]?.length ?? 128
    for (let i = 0; i < frames; i++) {
      // Mono detection across the input's channels.
      let level = 0
      for (let c = 0; c < input.length; c++) level = Math.max(level, Math.abs(input[c][i]))
      if (level > this.peak) this.peak = level

      const envCoef = level > this.envelope ? this.envAttack : this.envRelease
      this.envelope = envCoef * this.envelope + (1 - envCoef) * level

      let target = 1
      if (this.gateOn) {
        if (this.envelope >= this.threshold) this.holdSamples = HOLD_SECONDS * sampleRate
        else if (this.holdSamples > 0) this.holdSamples--
        target = this.holdSamples > 0 ? 1 : FLOOR_GAIN
      }
      const gainCoef = target > this.gain ? this.gainOpen : this.gainClose
      this.gain = gainCoef * this.gain + (1 - gainCoef) * target

      for (let c = 0; c < output.length; c++) {
        const source = input[c] ?? input[0]
        output[c][i] = source ? source[i] * this.gain : 0
      }
      const gated = this.envelope * this.gain
      if (gated > this.voice) this.voice = gated
    }

    if (++this.blocks >= REPORT_EVERY_BLOCKS) {
      this.port.postMessage({ peak: this.peak, voice: this.voice })
      this.blocks = 0
      this.peak = 0
      this.voice = 0
    }
    return true
  }
}

registerProcessor('mco-mic', MicProcessor)
