// src/audio/mic.ts
//
// The mic's audio chain on the shared engine (docs/features/recording.md):
//
//   mic ─> gain ─> 80 Hz HPF ─> gate/meter (micWorklet) ─> compressor ─> make-up
//       ─> EQ ─> radio (insert) ─> talk ─┬─> dry ──────────────────┐
//                                        ├─> echo send ─> echo ────┼─> engine.micInput
//                                        └─> reverb send ─> reverb ┘
//
// Talk mutes before the effects, so an echo or reverb tail rings out after
// muting. Throw opens the echo send while held, even when Echo is off. The
// voice's level (from the worklet) ducks the music on the engine.
import micWorkletUrl from './micWorklet.ts?worker&url'
import { getAudioEngine, type AudioEngine } from './audioEngine'
import { DelayModule, ReverbModule } from './fxModules'
import { MIC_GATE_OFF_DB, type MicSettings } from '../types'

const PARAM_TAU = 0.02
const HIGH_PASS_HZ = 80
const EQ_LOW_HZ = 150
const EQ_MID_HZ = 1500
const EQ_HIGH_HZ = 6000
// The radio voice: a telephone/megaphone band.
const RADIO_LOW_HZ = 500
const RADIO_HIGH_HZ = 3200
const RADIO_PRESENCE_HZ = 1600
// Ducking: the voice counts as talking above this level; the music comes
// back after a short hold once it stops.
const DUCK_VOICE_THRESHOLD = 0.02 // about -34 dBFS
const DUCK_HOLD_MS = 350
const DUCK_ATTACK_TAU = 0.04
const DUCK_RELEASE_TAU = 0.3

export interface MicLevels {
  // Peak of what comes in (after the gain knob), 0..1+.
  peak: number
  // The voice after the gate, 0..1.
  voice: number
}

// Compressor amount (0..1) → DynamicsCompressor settings and make-up gain:
// 0 is off (ratio 1), 1 squashes hard from -40 dB at 12:1.
export function compressorParams(amount: number): { thresholdDb: number; ratio: number; makeupDb: number } {
  const a = Math.min(1, Math.max(0, amount))
  const thresholdDb = -10 - 30 * a
  const ratio = 1 + 11 * a
  const makeupDb = Math.min(12, 0.4 * -thresholdDb * (1 - 1 / ratio))
  return { thresholdDb, ratio, makeupDb }
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

// The radio's drive: a tanh curve, harder with more drive, normalised so a
// full-scale input still peaks at full scale.
function radioCurve(drive: number): Float32Array<ArrayBuffer> {
  const k = 1 + drive * 15
  const length = 2048
  const curve = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT))
  for (let i = 0; i < length; i++) {
    const x = (i / (length - 1)) * 2 - 1
    curve[i] = Math.tanh(k * x) / Math.tanh(k)
  }
  return curve
}

let workletLoaded: Promise<void> | null = null

export class MicChain {
  private context: AudioContext
  private stream: MediaStream
  private source: MediaStreamAudioSourceNode
  private inputGain: GainNode
  private highPass: BiquadFilterNode
  private gate: AudioWorkletNode
  private compressor: DynamicsCompressorNode
  private makeup: GainNode
  private eqLow: BiquadFilterNode
  private eqMid: BiquadFilterNode
  private eqHigh: BiquadFilterNode
  private radioDry: GainNode
  private radioLow: BiquadFilterNode
  private radioHigh: BiquadFilterNode
  private radioPresence: BiquadFilterNode
  private radioShaper: WaveShaperNode
  private radioWet: GainNode
  private talkGain: GainNode
  private echoSend: GainNode
  private echo: DelayModule
  private reverbSend: GainNode
  private reverb: ReverbModule
  private output: GainNode
  private settings: MicSettings
  private live = true
  private throwHeld = false
  private lastRadioDrive = -1
  private duckedUntil = 0
  private ducking = false
  private levelListeners = new Set<(levels: MicLevels) => void>()

  private constructor(
    private engine: AudioEngine,
    stream: MediaStream,
    settings: MicSettings
  ) {
    const context = engine.context
    this.context = context
    this.stream = stream
    this.settings = settings
    this.source = context.createMediaStreamSource(stream)
    this.inputGain = context.createGain()
    this.highPass = context.createBiquadFilter()
    this.highPass.type = 'highpass'
    this.highPass.frequency.value = HIGH_PASS_HZ
    this.gate = new AudioWorkletNode(context, 'mco-mic', { outputChannelCount: [1] })
    this.gate.port.onmessage = (e: MessageEvent<MicLevels>) => this.handleLevels(e.data)
    this.compressor = context.createDynamicsCompressor()
    this.compressor.knee.value = 10
    this.compressor.attack.value = 0.005
    this.compressor.release.value = 0.15
    this.makeup = context.createGain()
    this.eqLow = context.createBiquadFilter()
    this.eqLow.type = 'lowshelf'
    this.eqLow.frequency.value = EQ_LOW_HZ
    this.eqMid = context.createBiquadFilter()
    this.eqMid.type = 'peaking'
    this.eqMid.frequency.value = EQ_MID_HZ
    this.eqMid.Q.value = 1
    this.eqHigh = context.createBiquadFilter()
    this.eqHigh.type = 'highshelf'
    this.eqHigh.frequency.value = EQ_HIGH_HZ

    this.radioDry = context.createGain()
    this.radioLow = context.createBiquadFilter()
    this.radioLow.type = 'highpass'
    this.radioLow.frequency.value = RADIO_LOW_HZ
    this.radioHigh = context.createBiquadFilter()
    this.radioHigh.type = 'lowpass'
    this.radioHigh.frequency.value = RADIO_HIGH_HZ
    this.radioPresence = context.createBiquadFilter()
    this.radioPresence.type = 'peaking'
    this.radioPresence.frequency.value = RADIO_PRESENCE_HZ
    this.radioPresence.Q.value = 1.2
    this.radioPresence.gain.value = 6
    this.radioShaper = context.createWaveShaper()
    this.radioShaper.oversample = '2x'
    this.radioWet = context.createGain()

    this.talkGain = context.createGain()
    this.echoSend = context.createGain()
    this.echoSend.gain.value = 0
    this.echo = new DelayModule(context)
    this.reverbSend = context.createGain()
    this.reverbSend.gain.value = 0
    this.reverb = new ReverbModule(context, settings.reverb.decaySeconds)
    this.output = context.createGain()

    this.source.connect(this.inputGain)
    this.inputGain.connect(this.highPass)
    this.highPass.connect(this.gate)
    this.gate.connect(this.compressor)
    this.compressor.connect(this.makeup)
    this.makeup.connect(this.eqLow)
    this.eqLow.connect(this.eqMid)
    this.eqMid.connect(this.eqHigh)
    this.eqHigh.connect(this.radioDry)
    this.eqHigh.connect(this.radioLow)
    this.radioLow.connect(this.radioHigh)
    this.radioHigh.connect(this.radioPresence)
    this.radioPresence.connect(this.radioShaper)
    this.radioShaper.connect(this.radioWet)
    this.radioDry.connect(this.talkGain)
    this.radioWet.connect(this.talkGain)
    this.talkGain.connect(this.output)
    this.talkGain.connect(this.echoSend)
    this.echoSend.connect(this.echo.input)
    this.echo.output.connect(this.output)
    this.talkGain.connect(this.reverbSend)
    this.reverbSend.connect(this.reverb.input)
    this.reverb.output.connect(this.output)
    this.output.connect(engine.micInput)

    this.update(settings)
    engine.setActive(this, true)
  }

  // Opens the input device and builds the chain. Throws if the mic can't
  // be opened (no permission, device gone).
  static async open(settings: MicSettings, engine: AudioEngine = getAudioEngine()): Promise<MicChain> {
    workletLoaded ??= engine.context.audioWorklet.addModule(micWorkletUrl)
    await workletLoaded
    // The voice chain does its own processing, so the browser's (tuned for
    // calls, and audible on a voice-over) is off.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: settings.deviceId ? { exact: settings.deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    })
    engine.resume()
    return new MicChain(engine, stream, settings)
  }

  update(settings: MicSettings): void {
    this.settings = settings
    const now = this.context.currentTime
    this.inputGain.gain.setTargetAtTime(dbToGain(settings.gainDb), now, PARAM_TAU)
    this.gate.port.postMessage({ gateDb: settings.gateDb <= MIC_GATE_OFF_DB ? MIC_GATE_OFF_DB : settings.gateDb })

    const comp = compressorParams(settings.compressor)
    this.compressor.threshold.setTargetAtTime(comp.thresholdDb, now, PARAM_TAU)
    this.compressor.ratio.setTargetAtTime(comp.ratio, now, PARAM_TAU)
    this.makeup.gain.setTargetAtTime(dbToGain(comp.makeupDb), now, PARAM_TAU)

    this.eqLow.gain.setTargetAtTime(settings.eq.low, now, PARAM_TAU)
    this.eqMid.gain.setTargetAtTime(settings.eq.mid, now, PARAM_TAU)
    this.eqHigh.gain.setTargetAtTime(settings.eq.high, now, PARAM_TAU)

    if (settings.radio.drive !== this.lastRadioDrive) {
      this.lastRadioDrive = settings.radio.drive
      this.radioShaper.curve = radioCurve(settings.radio.drive)
    }
    this.radioDry.gain.setTargetAtTime(settings.radio.enabled ? 0 : 1, now, PARAM_TAU)
    this.radioWet.gain.setTargetAtTime(settings.radio.enabled ? 0.8 : 0, now, PARAM_TAU)

    // The echo and reverb outputs stay up, and only their sends switch,
    // so turning one off lets its tail ring out.
    this.echo.update({ enabled: true, timeMs: settings.echo.timeMs, feedback: settings.echo.feedback, mix: settings.echo.mix })
    this.reverb.update({ enabled: true, decaySeconds: settings.reverb.decaySeconds, preDelayMs: 0, mix: settings.reverb.mix })
    this.updateSends()

    this.engine.setMicMonitoring(settings.monitor)
    if (!settings.duck.enabled) this.setDucked(false)
  }

  // Talk: false mutes the mic (before its effects).
  setLive(live: boolean): void {
    this.live = live
    this.talkGain.gain.setTargetAtTime(live ? 1 : 0, this.context.currentTime, 0.01)
    if (!live) this.setDucked(false)
  }

  // Throw: while held, the voice goes into the echo even if Echo is off.
  setThrow(held: boolean): void {
    this.throwHeld = held
    this.updateSends()
  }

  onLevels(listener: (levels: MicLevels) => void): () => void {
    this.levelListeners.add(listener)
    return () => this.levelListeners.delete(listener)
  }

  close(): void {
    this.setDucked(false)
    this.engine.setMicMonitoring(false)
    this.engine.setActive(this, false)
    this.gate.port.onmessage = null
    for (const track of this.stream.getTracks()) track.stop()
    for (const node of [
      this.source,
      this.inputGain,
      this.highPass,
      this.gate,
      this.compressor,
      this.makeup,
      this.eqLow,
      this.eqMid,
      this.eqHigh,
      this.radioDry,
      this.radioLow,
      this.radioHigh,
      this.radioPresence,
      this.radioShaper,
      this.radioWet,
      this.talkGain,
      this.echoSend,
      this.reverbSend,
      this.output,
    ]) {
      node.disconnect()
    }
    this.echo.disconnect()
    this.reverb.disconnect()
    this.levelListeners.clear()
  }

  private updateSends(): void {
    const now = this.context.currentTime
    this.echoSend.gain.setTargetAtTime(this.settings.echo.enabled || this.throwHeld ? 1 : 0, now, 0.005)
    this.reverbSend.gain.setTargetAtTime(this.settings.reverb.enabled ? 1 : 0, now, PARAM_TAU)
  }

  private handleLevels(levels: MicLevels): void {
    for (const listener of this.levelListeners) listener(levels)
    if (!this.settings.duck.enabled || !this.live) return
    const now = performance.now()
    if (levels.voice >= DUCK_VOICE_THRESHOLD) {
      this.duckedUntil = now + DUCK_HOLD_MS
      this.setDucked(true)
    } else if (now > this.duckedUntil) {
      this.setDucked(false)
    }
  }

  private setDucked(ducked: boolean): void {
    if (ducked === this.ducking && ducked) return
    this.ducking = ducked
    const target = ducked ? dbToGain(-this.settings.duck.amountDb) : 1
    this.engine.duckGain.gain.setTargetAtTime(target, this.context.currentTime, ducked ? DUCK_ATTACK_TAU : DUCK_RELEASE_TAU)
  }
}
