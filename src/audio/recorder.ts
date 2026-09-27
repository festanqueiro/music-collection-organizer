// src/audio/recorder.ts
//
// Records the audio engine's record bus — the music as heard (before the
// cast "mute this Mac") plus the mic — to a file (docs/features/recording.md). The
// AudioWorklet (recorderWorklet.ts) turns the bus into 24-bit PCM on the
// audio thread; each chunk goes straight to the main process, which
// appends it to a WAV on disk.
import workletUrl from './recorderWorklet.ts?worker&url'
import { getAudioEngine, type AudioEngine } from './audioEngine'
import type { RecordingFormat, RecordingResult } from '../types'

// Matches the MP3 bitrate in electron/main/recording.ts.
const MP3_BITS_PER_SECOND = 192000

let workletLoaded: Promise<void> | null = null

export class Recorder {
  private node: AudioWorkletNode | null = null
  private bytes = 0
  private finished: Promise<void> | null = null
  private startedAt = 0

  private constructor(private engine: AudioEngine) {}

  static async start(engine: AudioEngine = getAudioEngine()): Promise<Recorder> {
    const recorder = new Recorder(engine)
    await recorder.begin()
    return recorder
  }

  private async begin(): Promise<void> {
    const { context } = this.engine
    workletLoaded ??= context.audioWorklet.addModule(workletUrl)
    await workletLoaded
    // Keeps the engine running (and so recording) through silences, which
    // would otherwise idle-suspend it and stop the clock (ADR 0025).
    this.engine.setActive(this, true)
    await window.api.startRecording(context.sampleRate)

    const node = new AudioWorkletNode(context, 'mco-recorder', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    })
    this.finished = new Promise((resolve) => {
      node.port.onmessage = (e: MessageEvent<{ pcm?: Uint8Array; done?: boolean }>) => {
        if (e.data.pcm) {
          this.bytes += e.data.pcm.byteLength
          window.api.sendRecordingChunk(e.data.pcm)
        }
        if (e.data.done) resolve()
      }
    })
    this.engine.recordBus.connect(node)
    // A node only gets processed if it leads to the destination; it
    // outputs silence.
    node.connect(context.destination)
    this.node = node
    this.startedAt = performance.now()
  }

  get elapsedSeconds(): number {
    return this.node ? (performance.now() - this.startedAt) / 1000 : 0
  }

  // The finished file's size so far: exact for WAV (what's been written),
  // an estimate for FLAC (~60 % of it) and MP3 (its fixed bitrate).
  estimatedFileBytes(format: RecordingFormat): number {
    if (format === 'mp3') return this.elapsedSeconds * (MP3_BITS_PER_SECOND / 8)
    return format === 'flac' ? this.bytes * 0.6 : this.bytes
  }

  // Sends what's left of the audio, closes the file and (for FLAC/MP3)
  // converts it.
  async stop(format: RecordingFormat): Promise<RecordingResult> {
    const node = this.node
    this.node = null
    if (node) {
      node.port.postMessage('stop')
      await this.finished
      this.engine.recordBus.disconnect(node)
      node.disconnect()
      node.port.onmessage = null
    }
    this.engine.setActive(this, false)
    return window.api.stopRecording(format)
  }
}
