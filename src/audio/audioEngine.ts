// src/audio/audioEngine.ts
//
// The app's one AudioContext (ADR 0041). Everything that makes sound
// builds its nodes on `context`: the current track's EffectsChain and the
// dub siren connect to `input` (the music bus), the mic to `micInput`.
// `recordBus` carries both — the single point the recorder taps — which
// separate per-track/per-siren contexts couldn't offer.
//
//   track chain ─┐
//   siren ───────┴─> input ─> duckGain ─┬─> localGain ─> destination
//                                       └─> recordBus ─> recordOutput ─> (recorder, meter)
//   mic ─> micInput ─┬─> recordBus
//                    └─> monitorGain ─> localGain   (off unless monitoring)
//
// recordOutput is the recording's level (the Rec popover's Level knob):
// it changes what's written to the file, not what's heard.
//
//   input ─> visualDelay ─> visualAnalyser   (the visualizers' tap)
//
// The visualizers read the music (track + siren) through a delay line, so
// they can be held back to match sound that reaches the room late (AirPlay,
// Bluetooth) — the Visual delay setting (ADR 0047).
//
// The mic isn't heard through the speakers unless monitoring is on — a
// mic next to speakers feeds back. duckGain pulls the music down under
// the voice (see audio/mic.ts).
//
// Output device and the cast "mute this Mac" live here once, instead of
// being applied to each context separately.

// How long after the last source goes quiet the context keeps running —
// long enough for delay/reverb/echo tails to ring out — before it's
// suspended. A running context renders the whole graph (convolver
// included) even in silence (ADR 0025).
export const IDLE_SUSPEND_MS = 15000
// The Visual delay's ceiling (the setting stops at 3 s).
export const MAX_VISUAL_DELAY_SECONDS = 5
const PARAM_SMOOTH_TAU = 0.02

type EngineContext = Pick<
  AudioContext,
  'state' | 'currentTime' | 'destination' | 'createGain' | 'resume' | 'suspend'
  | 'createDelay' | 'createAnalyser'
> &
  Partial<Pick<AudioContext, 'baseLatency' | 'outputLatency'>> & {
    setSinkId?: (id: string) => Promise<void>
  }

export class AudioEngine {
  readonly context: AudioContext
  // The music bus: connect a track's or the siren's final node here.
  readonly input: GainNode
  // The mic's bus: recorded, and heard only while monitoring.
  readonly micInput: GainNode
  // Music (after ducking) plus the mic.
  readonly recordBus: GainNode
  // recordBus at the recording level — what a recording captures.
  readonly recordOutput: GainNode
  // Pulled down by the mic's ducking.
  readonly duckGain: GainNode
  private monitorGain: GainNode
  private localGain: GainNode
  private recordMeter: RecordMeter | null = null
  private visualTap: { delay: DelayNode; analyser: AnalyserNode } | null = null
  private visualDelaySeconds = 0
  private recordMeterFailed = false
  // Whoever is making sound right now (a playing track, a held siren, a
  // running beat). The context suspends once this has been empty for
  // IDLE_SUSPEND_MS, and never while anything is in it.
  private active = new Set<object>()
  private suspendTimer: ReturnType<typeof setTimeout> | null = null

  constructor(context: EngineContext = new AudioContext()) {
    this.context = context as AudioContext
    this.input = this.context.createGain()
    this.duckGain = this.context.createGain()
    this.recordBus = this.context.createGain()
    this.recordOutput = this.context.createGain()
    this.micInput = this.context.createGain()
    this.monitorGain = this.context.createGain()
    this.monitorGain.gain.value = 0
    this.localGain = this.context.createGain()
    this.input.connect(this.duckGain)
    this.duckGain.connect(this.localGain)
    this.duckGain.connect(this.recordBus)
    this.recordBus.connect(this.recordOutput)
    this.micInput.connect(this.recordBus)
    this.micInput.connect(this.monitorGain)
    this.monitorGain.connect(this.localGain)
    this.localGain.connect(this.context.destination)
    this.scheduleSuspend()
  }

  // Marks `owner` as making sound (or not). Becoming active wakes the
  // context; the last owner going quiet starts the idle countdown.
  setActive(owner: object, active: boolean): void {
    if (active) {
      this.active.add(owner)
      this.resume()
    } else if (this.active.delete(owner)) {
      this.scheduleSuspend()
    }
  }

  isActive(): boolean {
    return this.active.size > 0
  }

  // Wakes the context (an AudioContext starts suspended until a user
  // gesture, and after ADR 0025 it's suspended whenever idle). Resuming
  // needs no gesture in Electron, so MIDI triggers work too. If nothing
  // then becomes active, it goes back to sleep after the idle delay.
  resume(): void {
    this.clearSuspendTimer()
    if (this.context.state === 'suspended') this.context.resume().catch(() => {})
    if (!this.isActive()) this.scheduleSuspend()
  }

  // Routes the output to a specific Core Audio device (an audio interface,
  // say); null means the system default ('' per the spec). Feature-detected
  // and best-effort: a device that's since been unplugged rejects, and the
  // context keeps playing wherever it already was.
  async setSinkId(deviceId: string | null): Promise<void> {
    const context = this.context as AudioContext & { setSinkId?: (id: string) => Promise<void> }
    if (typeof context.setSinkId !== 'function') return
    try {
      await context.setSinkId(deviceId ?? '')
    } catch (err) {
      console.error('failed to set audio output device', err)
    }
  }

  // Whether the mic is heard through the speakers (off by default:
  // feedback). It's recorded either way.
  setMicMonitoring(on: boolean): void {
    this.monitorGain.gain.setTargetAtTime(on ? 1 : 0, this.context.currentTime, PARAM_SMOOTH_TAU)
  }

  // What the visualizers draw from: the music bus, delayed by the Visual
  // delay setting. Built on first use (a delay line of a few seconds of
  // audio only costs anything once something draws).
  getVisualAnalyser(): AnalyserNode {
    if (!this.visualTap) {
      const delay = this.context.createDelay(MAX_VISUAL_DELAY_SECONDS)
      delay.delayTime.value = this.visualDelaySeconds
      const analyser = this.context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.8
      this.input.connect(delay)
      delay.connect(analyser)
      this.visualTap = { delay, analyser }
    }
    return this.visualTap.analyser
  }

  // Holds the visuals back by `seconds` (clamped to 0..MAX), e.g. to match
  // AirPlay audio arriving ~1-2 s late.
  setVisualDelay(seconds: number): void {
    this.visualDelaySeconds = Math.min(MAX_VISUAL_DELAY_SECONDS, Math.max(0, seconds))
    this.visualTap?.delay.delayTime.setValueAtTime(this.visualDelaySeconds, this.context.currentTime)
  }

  get visualDelay(): number {
    return this.visualDelaySeconds
  }

  // The recording's level in dB (0 = as heard). Only what's recorded
  // changes; the speakers don't.
  setRecordLevel(db: number): void {
    this.recordOutput.gain.setTargetAtTime(Math.pow(10, db / 20), this.context.currentTime, PARAM_SMOOTH_TAU)
  }

  // The recording's peak level, left and right (0–1, 1 = full scale, where
  // the file clips), since the last read. Built on first use: two
  // analysers that only cost anything while someone reads them.
  readRecordPeaks(): [number, number] {
    if (this.context.state !== 'running' || this.recordMeterFailed) return [0, 0]
    try {
      this.recordMeter ??= new RecordMeter(this.context, this.recordOutput)
      return this.recordMeter.read()
    } catch (err) {
      // A meter is never worth breaking the app (or a recording) over.
      console.error('record meter failed', err)
      this.recordMeterFailed = true
      return [0, 0]
    }
  }

  // Silences this Mac's speakers while casting, without touching the
  // buses (the visualizer's analyser and a recorder sit upstream of this).
  setLocalMuted(muted: boolean): void {
    this.localGain.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, PARAM_SMOOTH_TAU)
  }

  // How far behind the graph's clock the sound coming out of the speakers
  // is (the graph plus the output device), where the browser reports it.
  outputLatencySeconds(): number {
    return (this.context.baseLatency || 0) + (this.context.outputLatency || 0)
  }

  private scheduleSuspend(): void {
    this.clearSuspendTimer()
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null
      if (!this.isActive() && this.context.state === 'running') this.context.suspend().catch(() => {})
    }, IDLE_SUSPEND_MS)
  }

  private clearSuspendTimer(): void {
    if (this.suspendTimer) clearTimeout(this.suspendTimer)
    this.suspendTimer = null
  }
}

// Left/right peaks of a node's output, from the analysers' latest window
// (about 20 ms: enough for a meter read ~60 times a second).
class RecordMeter {
  private analysers: AnalyserNode[]
  private buffer: Float32Array<ArrayBuffer>

  constructor(context: AudioContext, source: AudioNode) {
    // Mixed to exactly two channels first, so a mono source reads on both
    // sides (a splitter's own channel settings can't be changed).
    const stereo = context.createGain()
    stereo.channelCount = 2
    stereo.channelCountMode = 'explicit'
    stereo.channelInterpretation = 'speakers'
    source.connect(stereo)
    const splitter = context.createChannelSplitter(2)
    stereo.connect(splitter)
    this.analysers = [0, 1].map((channel) => {
      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      splitter.connect(analyser, channel)
      return analyser
    })
    this.buffer = new Float32Array(1024)
  }

  read(): [number, number] {
    const peaks = this.analysers.map((analyser) => {
      analyser.getFloatTimeDomainData(this.buffer)
      let peak = 0
      for (let i = 0; i < this.buffer.length; i++) peak = Math.max(peak, Math.abs(this.buffer[i]))
      return peak
    })
    return [peaks[0], peaks[1]]
  }
}

let sharedEngine: AudioEngine | undefined

// Created lazily on first use: an AudioContext created outside a user
// gesture starts suspended, and resume() (called from the gesture that
// starts playback or a siren) wakes it.
export function getAudioEngine(): AudioEngine {
  if (!sharedEngine) sharedEngine = new AudioEngine()
  return sharedEngine
}
