// src/audio/recorderWorklet.ts
//
// Runs on the audio thread (an AudioWorklet, loaded by recorder.ts). Takes
// the engine's record bus as its input, converts it to 24-bit little-endian
// interleaved stereo PCM, and posts it to the main thread in chunks of
// about a quarter of a second. On a 'stop' message it posts what's left,
// then { done: true }, and stops processing.

// Audio-thread globals: see worklet-globals.d.ts.

const BYTES_PER_FRAME = 6 // 2 channels × 3 bytes
const MAX_24BIT = 0x7fffff
// Frames per process() call (fixed by the Web Audio spec).
const RENDER_QUANTUM = 128

class RecorderProcessor extends AudioWorkletProcessor {
  private chunk = new Uint8Array(Math.ceil(sampleRate / 4) * BYTES_PER_FRAME)
  private used = 0
  private stopped = false

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data !== 'stop') return
      this.flush()
      this.stopped = true
      this.port.postMessage({ done: true })
    }
  }

  process(inputs: Float32Array[][]): boolean {
    if (this.stopped) return false
    const input = inputs[0]
    // With nothing feeding the bus the input has no channels — that's
    // silence, and it still has to be written, or quiet stretches would
    // vanish from the file.
    const left = input?.[0]
    const right = input?.[1] ?? left
    for (let i = 0; i < RENDER_QUANTUM; i++) {
      this.writeSample(left ? left[i] : 0)
      this.writeSample(right ? right[i] : 0)
      if (this.used === this.chunk.length) this.flush()
    }
    return true
  }

  private writeSample(value: number): void {
    const clamped = value > 1 ? 1 : value < -1 ? -1 : value
    const int = Math.round(clamped * MAX_24BIT)
    this.chunk[this.used++] = int & 0xff
    this.chunk[this.used++] = (int >> 8) & 0xff
    this.chunk[this.used++] = (int >> 16) & 0xff
  }

  private flush(): void {
    if (this.used === 0) return
    const pcm = this.chunk.slice(0, this.used)
    this.port.postMessage({ pcm }, [pcm.buffer])
    this.used = 0
  }
}

registerProcessor('mco-recorder', RecorderProcessor)
