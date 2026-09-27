import type { EffectsSettings } from '../types'
import { getAudioEngine, type AudioEngine } from './audioEngine'
import { DelayModule, ReverbModule } from './fxModules'

const FILTER_PARAM_TAU = 0.02
// Bypass sits at each type's edge of audibility: a lowpass at 20kHz or a
// highpass at 20Hz cuts essentially nothing, so the filter can stay
// permanently in the signal path (no connect/disconnect click) with the
// knob at center. Sweep endpoints (open -> closed) are exponential, not
// linear, matching how a real filter knob's perceived "speed" is roughly
// even across its travel — a linear Hz sweep would spend almost all of
// the knob's range barely changing anything up near 20kHz.
const FILTER_LOWPASS_OPEN_HZ = 20000
const FILTER_LOWPASS_CLOSED_HZ = 80
const FILTER_HIGHPASS_OPEN_HZ = 20
const FILTER_HIGHPASS_CLOSED_HZ = 8000
// A flat (Butterworth) filter: no resonant peak at the cutoff.
const FLAT_Q = Math.SQRT1_2
// How much of a stage's travel (0..1) the resonance fades in over.
const RESONANCE_FADE_IN = 0.25

// Resonance for one filter stage at `amount` (0 open .. 1 closed). An open
// stage stays flat: the dialed-in Q at 20kHz/20Hz would boost hiss and
// rumble by up to +26dB with the knob at rest. It reaches full resonance
// a quarter of the way in, so the sweep still sounds resonant.
export function stageQ(amount: number, resonance: number): number {
  const engaged = Math.min(1, amount / RESONANCE_FADE_IN)
  return FLAT_Q + (Math.max(FLAT_Q, resonance) - FLAT_Q) * engaged
}

// Level compensation for the resonant peaks (a stage peaks at about Q
// times its input): pulls the filtered signal down so sweeping with high
// resonance doesn't clip the output into noise. 1 when both stages are flat.
export function resonanceCompensation(lowpassQ: number, highpassQ: number): number {
  return Math.sqrt((FLAT_Q / lowpassQ) * (FLAT_Q / highpassQ))
}

const EQ_LOW_HZ = 200
const EQ_MID_HZ = 1000
const EQ_HIGH_HZ = 5000

// Wraps a single <audio> element's output in a Web Audio graph so delay and
// reverb sends can be mixed in alongside the dry signal. Player.tsx creates
// one of these per mount (it already remounts fresh per track, since
// createMediaElementSource can only be called once per media element), and
// calls close() on unmount. The graph is built on the app's shared
// AudioEngine and feeds its mix bus (ADR 0041); close() disconnects it
// rather than closing a context of its own.
//
// setVolume() controls dryGain, and the delay/reverb sends are tapped
// FROM dryGain's output (post-fader), not from the raw source — so
// pulling volume to 0 stops any NEW signal from entering the delay line
// or convolver. This matters: tapping the raw source directly (tried
// first) meant the delay kept receiving and re-echoing the live track
// forever regardless of volume, so muting didn't actually mute anything
// with delay/feedback turned up — you'd just keep hearing the whole
// track, quietly, through the echo. Post-fader sends fix that while
// still preserving the desired "FX tail rings out after muting" behavior:
// the delay's own feedback loop and the convolver's in-flight
// convolution are self-contained once fed, so whatever's already inside
// them keeps decaying on its own after the input goes silent — it just
// can't be topped up with fresh signal anymore.
//
//                                                              ┌─> lowpassNode -> highpassNode -> filterWetGain ─┐                  ┌─────────────────────────────────────────┐
// source ──> dryGain ──> eqLow -> eqMid -> eqHigh ─────────────> ┤                                                 ├─> delayNode <-> feedbackGain ├─> engine mix bus
//                                                              └────────────────────────────────> filterDryGain ─┘   │      └────────> delayWetGain ─┤
//                                                                                                                     ├─> preDelayNode ─> convolver ─> reverbWetGain ┤
//                                                                                                                     └────────────────────────────────────────────┘
//
// EQ sits right after the fader, before the filter — matching a real
// mixer channel strip's EQ-then-filter order — so a boosted/cut band
// carries through the sweep filter and the delay/reverb sends too. Three
// chained BiquadFilterNodes (lowshelf/peaking/highshelf), each just a
// gain knob at a fixed frequency, always fully applied (flat = off).
//
// lowpassNode/highpassNode sit after the fader like a mixer channel's
// filter knobs — everything downstream (the dry signal AND the delay/
// reverb sends) is swept together, same as sweeping a real Xone-style
// filter with a delay throw active filters the repeats too. Two separate,
// permanently-typed BiquadFilterNodes chained in series (lowpass then
// highpass), each always in the signal path — filter.lowpass/highpass
// (0..1) only move each node's own frequency, never its type. This
// replaces an earlier single-node design that flipped one BiquadFilterNode
// between lowpass/highpass type as a bipolar knob crossed its center,
// which caused an audible level jump right at that crossover (the two
// filter types don't have identical passband gain at the boundary) —
// keeping both nodes permanently typed and always-open-by-default avoids
// ever performing that type switch. filter.mix (via filterWetGain/
// filterDryGain, fed from the EQ stage's own wet+dry outputs) blends the
// swept signal back against the pre-filter one, same convention as delay.mix.
export class EffectsChain {
  private engine: AudioEngine
  private context: AudioContext
  private source: MediaElementAudioSourceNode
  private dryGain: GainNode
  private eqLow: BiquadFilterNode
  private eqMid: BiquadFilterNode
  private eqHigh: BiquadFilterNode
  private lowpassNode: BiquadFilterNode
  private highpassNode: BiquadFilterNode
  private filterDryGain: GainNode
  private filterWetGain: GainNode
  private delay: DelayModule
  private reverb: ReverbModule
  private masterGain: GainNode
  private analyser: AnalyserNode
  private audioElement: HTMLAudioElement

  constructor(audioElement: HTMLAudioElement, engine: AudioEngine = getAudioEngine()) {
    this.engine = engine
    this.context = engine.context
    this.source = this.context.createMediaElementSource(audioElement)
    this.audioElement = audioElement
    audioElement.addEventListener('play', this.handlePlay)
    audioElement.addEventListener('pause', this.handleStop)
    audioElement.addEventListener('ended', this.handleStop)

    // The true final stage, after every FX send (filter/EQ wet+dry, delay
    // wet, reverb wet) — unlike dryGain (setVolume/playerVolume, right at
    // the start of the chain), pulling masterGain down attenuates an
    // already-ringing delay repeat or reverb tail immediately, since
    // those sends land here downstream of themselves rather than upstream.
    this.masterGain = this.context.createGain()
    this.masterGain.gain.value = 1
    this.masterGain.connect(engine.input)

    // Read-only tap for the Visualizer, after masterGain so it reflects
    // exactly what's heard (FX tails included, silent when muted). An
    // AnalyserNode doesn't need a path to destination to keep processing,
    // so it's a dead-end branch — it can't affect the audio at all.
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.8
    this.masterGain.connect(this.analyser)

    this.dryGain = this.context.createGain()
    this.dryGain.gain.value = 1
    this.source.connect(this.dryGain)

    this.eqLow = this.context.createBiquadFilter()
    this.eqLow.type = 'lowshelf'
    this.eqLow.frequency.value = EQ_LOW_HZ
    this.eqMid = this.context.createBiquadFilter()
    this.eqMid.type = 'peaking'
    this.eqMid.frequency.value = EQ_MID_HZ
    this.eqMid.Q.value = 1
    this.eqHigh = this.context.createBiquadFilter()
    this.eqHigh.type = 'highshelf'
    this.eqHigh.frequency.value = EQ_HIGH_HZ
    this.dryGain.connect(this.eqLow)
    this.eqLow.connect(this.eqMid)
    this.eqMid.connect(this.eqHigh)

    this.lowpassNode = this.context.createBiquadFilter()
    this.lowpassNode.type = 'lowpass'
    this.lowpassNode.frequency.value = FILTER_LOWPASS_OPEN_HZ
    this.highpassNode = this.context.createBiquadFilter()
    this.highpassNode.type = 'highpass'
    this.highpassNode.frequency.value = FILTER_HIGHPASS_OPEN_HZ
    // filter.mix blends the LP/HP-processed (wet) signal back against the
    // pre-filter (dry) one — same dry/wet convention as delay.mix.
    // filterDryGain/filterWetGain both fan out from the EQ stage's output
    // (eqHigh) and land on the same downstream nodes together, which sum
    // multiple incoming connections automatically.
    this.filterDryGain = this.context.createGain()
    this.filterDryGain.gain.value = 0
    this.filterWetGain = this.context.createGain()
    this.filterWetGain.gain.value = 1
    this.eqHigh.connect(this.lowpassNode)
    this.eqHigh.connect(this.filterDryGain)
    this.lowpassNode.connect(this.highpassNode)
    this.highpassNode.connect(this.filterWetGain)
    this.filterWetGain.connect(this.masterGain)
    this.filterDryGain.connect(this.masterGain)

    this.delay = new DelayModule(this.context)
    this.filterWetGain.connect(this.delay.input)
    this.filterDryGain.connect(this.delay.input)
    this.delay.output.connect(this.masterGain)

    this.reverb = new ReverbModule(this.context)
    this.filterWetGain.connect(this.reverb.input)
    this.filterDryGain.connect(this.reverb.input)
    this.reverb.output.connect(this.masterGain)
  }

  update(settings: EffectsSettings): void {
    // setTargetAtTime glides each parameter over a short time constant
    // rather than jumping, so dragging a knob doesn't click.
    const now = this.context.currentTime
    this.eqLow.gain.setTargetAtTime(settings.eq.low, now, FILTER_PARAM_TAU)
    this.eqMid.gain.setTargetAtTime(settings.eq.mid, now, FILTER_PARAM_TAU)
    this.eqHigh.gain.setTargetAtTime(settings.eq.high, now, FILTER_PARAM_TAU)

    this.delay.update(settings.delay)
    this.reverb.update(settings.reverb)

    // lowpass/highpass are each 0 (wide open, inaudible) .. 1 (fully
    // closed) — the node's type never changes, only its frequency, so
    // there's no crossover discontinuity between the two stages the way
    // the old single swept node had. enabled is a hard bypass on top of
    // both (a MIDI-mapped on/off button) — forces both fully open without
    // touching the dialed-in amounts, so re-enabling picks up right where
    // the knobs were left.
    const { enabled, lowpass, highpass, resonance, mix } = settings.filter
    const lowpassAmount = enabled ? lowpass : 0
    const highpassAmount = enabled ? highpass : 0
    const lowpassFreq = FILTER_LOWPASS_OPEN_HZ * (FILTER_LOWPASS_CLOSED_HZ / FILTER_LOWPASS_OPEN_HZ) ** lowpassAmount
    const highpassFreq =
      FILTER_HIGHPASS_OPEN_HZ * (FILTER_HIGHPASS_CLOSED_HZ / FILTER_HIGHPASS_OPEN_HZ) ** highpassAmount
    this.lowpassNode.frequency.setTargetAtTime(lowpassFreq, now, FILTER_PARAM_TAU)
    this.highpassNode.frequency.setTargetAtTime(highpassFreq, now, FILTER_PARAM_TAU)
    const lowpassQ = stageQ(lowpassAmount, resonance)
    const highpassQ = stageQ(highpassAmount, resonance)
    this.lowpassNode.Q.setTargetAtTime(lowpassQ, now, FILTER_PARAM_TAU)
    this.highpassNode.Q.setTargetAtTime(highpassQ, now, FILTER_PARAM_TAU)
    const filterWet = enabled ? mix : 0
    this.filterWetGain.gain.setTargetAtTime(
      filterWet * resonanceCompensation(lowpassQ, highpassQ),
      now,
      FILTER_PARAM_TAU
    )
    this.filterDryGain.gain.setTargetAtTime(1 - filterWet, now, FILTER_PARAM_TAU)
    this.masterGain.gain.setTargetAtTime(settings.masterVolume, now, FILTER_PARAM_TAU)
  }

  getAnalyser(): AnalyserNode {
    return this.analyser
  }

  setVolume(value: number): void {
    this.dryGain.gain.value = value
  }

  // How far behind the element's currentTime the sound actually coming out
  // of the speakers is (the audio graph plus the output device), where the
  // browser reports it.
  outputLatencySeconds(): number {
    return this.engine.outputLatencySeconds()
  }

  // Wakes the shared engine — call this from the same click handler that
  // starts playback (an AudioContext starts suspended until a gesture).
  resume(): void {
    this.engine.resume()
  }

  // Disconnects this track's graph from the engine; the shared context
  // itself keeps running for everything else.
  close(): void {
    this.audioElement.removeEventListener('play', this.handlePlay)
    this.audioElement.removeEventListener('pause', this.handleStop)
    this.audioElement.removeEventListener('ended', this.handleStop)
    this.engine.setActive(this, false)
    for (const node of [
      this.source,
      this.dryGain,
      this.eqLow,
      this.eqMid,
      this.eqHigh,
      this.lowpassNode,
      this.highpassNode,
      this.filterDryGain,
      this.filterWetGain,
      this.masterGain,
      this.analyser,
    ]) {
      node.disconnect()
    }
    this.delay.disconnect()
    this.reverb.disconnect()
  }

  private handlePlay = (): void => this.engine.setActive(this, true)

  // The engine keeps running for IDLE_SUSPEND_MS after the last source goes
  // quiet, so delay/reverb tails ring out before it suspends.
  private handleStop = (): void => this.engine.setActive(this, false)
}
