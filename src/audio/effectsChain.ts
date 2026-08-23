import type { EffectsSettings } from '../types'

const MAX_DELAY_SECONDS = 2
const MAX_PRE_DELAY_SECONDS = 0.5
const REVERB_DECAY_EXPONENT = 2
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
const EQ_LOW_HZ = 200
const EQ_MID_HZ = 1000
const EQ_HIGH_HZ = 5000

// Synthesizes a plate-style impulse response (exponentially decaying white
// noise) rather than shipping a recorded .wav — no binary asset, no
// licensing to track, good enough for a DJ preview player. `decaySeconds`
// is user-adjustable (reverb.decaySeconds); regenerating this on every
// settings.reverb change would mean a fresh length*2-channel Math.random()
// loop per slider tick, so the caller only calls this when decaySeconds
// actually changed (see EffectsChain.update's lastDecaySeconds check).
function createSyntheticImpulseResponse(context: BaseAudioContext, decaySeconds: number): AudioBuffer {
  const sampleRate = context.sampleRate
  const length = Math.floor(sampleRate * decaySeconds)
  const impulse = context.createBuffer(2, length, sampleRate)
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, REVERB_DECAY_EXPONENT)
    }
  }
  return impulse
}

// Wraps a single <audio> element's output in a Web Audio graph so delay and
// reverb sends can be mixed in alongside the dry signal. Player.tsx creates
// one of these per mount (it already remounts fresh per track, since
// createMediaElementSource can only be called once per media element), and
// calls close() on unmount.
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
//              ┌─> eqLow -> eqMid -> eqHigh ─> eqWetGain ─┐    ┌─> lowpassNode -> highpassNode -> filterWetGain ─┐                  ┌─────────────────────────────────────────┐
// source ──> dryGain ┤                                    ├──> ┤                                                 ├─> delayNode <-> feedbackGain ├─> destination
//              └───────────────────────────> eqDryGain ───┘    └────────────────────────────────> filterDryGain ─┘   │      └────────> delayWetGain ─┤
//                                                                                                                     ├─> preDelayNode ─> convolver ─> reverbWetGain ┤
//                                                                                                                     └────────────────────────────────────────────┘
//
// EQ sits right after the fader, before the filter — matching a real
// mixer channel strip's EQ-then-filter order — so a boosted/cut band
// carries through the sweep filter and the delay/reverb sends too. Three
// chained BiquadFilterNodes (lowshelf/peaking/highshelf), each just a
// gain knob at a fixed frequency, run in parallel with an unprocessed
// dry tap — eq.mix (via eqWetGain/eqDryGain) blends between the two,
// same dry/wet convention as delay.mix/reverb.mix.
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
// swept signal back against the pre-filter one, same convention as eq.mix.
export class EffectsChain {
  private context: AudioContext
  private dryGain: GainNode
  private eqLow: BiquadFilterNode
  private eqMid: BiquadFilterNode
  private eqHigh: BiquadFilterNode
  private eqDryGain: GainNode
  private eqWetGain: GainNode
  private lowpassNode: BiquadFilterNode
  private highpassNode: BiquadFilterNode
  private filterDryGain: GainNode
  private filterWetGain: GainNode
  private delayNode: DelayNode
  private delayFeedbackGain: GainNode
  private delayWetGain: GainNode
  private preDelayNode: DelayNode
  private convolver: ConvolverNode
  private reverbWetGain: GainNode
  private lastDecaySeconds: number

  constructor(audioElement: HTMLAudioElement) {
    this.context = new AudioContext()
    const source = this.context.createMediaElementSource(audioElement)

    this.dryGain = this.context.createGain()
    this.dryGain.gain.value = 1
    source.connect(this.dryGain)

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
    // eq.mix blends the processed (wet) EQ chain back against the
    // unprocessed (dry) signal — dryGain feeds both eqDryGain (straight
    // through) and the eqLow->Mid->High chain (via eqWetGain at the end),
    // and both land on the same downstream node (lowpassNode), which sums
    // multiple incoming connections automatically.
    this.eqDryGain = this.context.createGain()
    this.eqDryGain.gain.value = 0
    this.eqWetGain = this.context.createGain()
    this.eqWetGain.gain.value = 1
    this.dryGain.connect(this.eqLow)
    this.eqLow.connect(this.eqMid)
    this.eqMid.connect(this.eqHigh)
    this.eqHigh.connect(this.eqWetGain)
    this.dryGain.connect(this.eqDryGain)

    this.lowpassNode = this.context.createBiquadFilter()
    this.lowpassNode.type = 'lowpass'
    this.lowpassNode.frequency.value = FILTER_LOWPASS_OPEN_HZ
    this.highpassNode = this.context.createBiquadFilter()
    this.highpassNode.type = 'highpass'
    this.highpassNode.frequency.value = FILTER_HIGHPASS_OPEN_HZ
    // filter.mix blends the LP/HP-processed (wet) signal back against the
    // pre-filter (dry) one — same dry/wet convention as eq.mix above.
    // filterDryGain/filterWetGain both fan out from the EQ stage's output
    // (eqWetGain/eqDryGain each connect to both the wet path's entry point
    // AND the dry tap) and land on the same downstream nodes together,
    // which sum multiple incoming connections automatically.
    this.filterDryGain = this.context.createGain()
    this.filterDryGain.gain.value = 0
    this.filterWetGain = this.context.createGain()
    this.filterWetGain.gain.value = 1
    this.eqWetGain.connect(this.lowpassNode)
    this.eqDryGain.connect(this.lowpassNode)
    this.eqWetGain.connect(this.filterDryGain)
    this.eqDryGain.connect(this.filterDryGain)
    this.lowpassNode.connect(this.highpassNode)
    this.highpassNode.connect(this.filterWetGain)
    this.filterWetGain.connect(this.context.destination)
    this.filterDryGain.connect(this.context.destination)

    this.delayNode = this.context.createDelay(MAX_DELAY_SECONDS)
    this.delayFeedbackGain = this.context.createGain()
    this.delayWetGain = this.context.createGain()
    this.delayWetGain.gain.value = 0
    this.filterWetGain.connect(this.delayNode)
    this.filterDryGain.connect(this.delayNode)
    this.delayNode.connect(this.delayFeedbackGain)
    this.delayFeedbackGain.connect(this.delayNode)
    this.delayNode.connect(this.delayWetGain)
    this.delayWetGain.connect(this.context.destination)

    this.lastDecaySeconds = 2
    this.preDelayNode = this.context.createDelay(MAX_PRE_DELAY_SECONDS)
    this.convolver = this.context.createConvolver()
    this.convolver.buffer = createSyntheticImpulseResponse(this.context, this.lastDecaySeconds)
    this.reverbWetGain = this.context.createGain()
    this.reverbWetGain.gain.value = 0
    this.filterWetGain.connect(this.preDelayNode)
    this.filterDryGain.connect(this.preDelayNode)
    this.preDelayNode.connect(this.convolver)
    this.convolver.connect(this.reverbWetGain)
    this.reverbWetGain.connect(this.context.destination)
  }

  update(settings: EffectsSettings): void {
    // Reassigning delayTime.value directly jumps the delay line's read
    // position discontinuously while audio is already flowing through it —
    // audible as a click/glitch on every slider tick (worse while
    // dragging, since it fires continuously). setTargetAtTime glides to
    // the new value over a short time constant instead, keeping changes
    // smooth while still tracking the slider closely enough to feel
    // immediate.
    const now = this.context.currentTime
    // The three bands always run at their dialed-in gains — enabled and
    // mix both just control how much of that processed signal reaches
    // the output (via eqWetGain/eqDryGain below), same as delay.mix/
    // reverb.mix's wet/dry convention. Leaving the bands themselves alone
    // means re-enabling (or raising mix back up) picks up instantly at
    // the dialed-in position, no separate ramp needed.
    this.eqLow.gain.setTargetAtTime(settings.eq.low, now, FILTER_PARAM_TAU)
    this.eqMid.gain.setTargetAtTime(settings.eq.mid, now, FILTER_PARAM_TAU)
    this.eqHigh.gain.setTargetAtTime(settings.eq.high, now, FILTER_PARAM_TAU)
    const eqWet = settings.eq.enabled ? settings.eq.mix : 0
    this.eqWetGain.gain.setTargetAtTime(eqWet, now, FILTER_PARAM_TAU)
    this.eqDryGain.gain.setTargetAtTime(1 - eqWet, now, FILTER_PARAM_TAU)

    this.delayNode.delayTime.setTargetAtTime(settings.delay.timeMs / 1000, now, 0.08)
    this.delayFeedbackGain.gain.value = settings.delay.enabled ? settings.delay.feedback : 0
    this.delayWetGain.gain.value = settings.delay.enabled ? settings.delay.mix : 0

    // Same glitch-avoidance as delayTime above.
    this.preDelayNode.delayTime.setTargetAtTime(settings.reverb.preDelayMs / 1000, now, 0.05)
    // Regenerating the impulse response is a length*channels Math.random()
    // loop — skip it unless decaySeconds actually changed, so dragging an
    // unrelated reverb slider (mix, pre-delay) doesn't redo this on every
    // tick.
    if (settings.reverb.decaySeconds !== this.lastDecaySeconds) {
      this.lastDecaySeconds = settings.reverb.decaySeconds
      this.convolver.buffer = createSyntheticImpulseResponse(this.context, settings.reverb.decaySeconds)
    }
    this.reverbWetGain.gain.value = settings.reverb.enabled ? settings.reverb.mix : 0

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
    this.lowpassNode.Q.setTargetAtTime(resonance, now, FILTER_PARAM_TAU)
    this.highpassNode.Q.setTargetAtTime(resonance, now, FILTER_PARAM_TAU)
    const filterWet = enabled ? mix : 0
    this.filterWetGain.gain.setTargetAtTime(filterWet, now, FILTER_PARAM_TAU)
    this.filterDryGain.gain.setTargetAtTime(1 - filterWet, now, FILTER_PARAM_TAU)
  }

  setVolume(value: number): void {
    this.dryGain.gain.value = value
  }

  // Routes this context's output to a specific Core Audio device (an
  // audio interface, say) instead of the system default — AudioContext.
  // setSinkId() is a fairly recent addition (Chrome 110+/this Electron's
  // Chromium), so it's feature-detected rather than assumed; null means
  // "system default", passed through as '' per the spec. Best-effort: a
  // device that's since been unplugged rejects, which shouldn't crash
  // playback — the context just keeps outputting to wherever it already
  // was.
  async setSinkId(deviceId: string | null): Promise<void> {
    const context = this.context as AudioContext & { setSinkId?: (id: string) => Promise<void> }
    if (typeof context.setSinkId !== 'function') return
    try {
      await context.setSinkId(deviceId ?? '')
    } catch (err) {
      console.error('failed to set audio output device', err)
    }
  }

  // AudioContexts start suspended until a user gesture resumes them — call
  // this from the same click handler that starts playback.
  resume(): void {
    if (this.context.state === 'suspended') this.context.resume().catch(() => {})
  }

  close(): void {
    this.context.close().catch(() => {})
  }
}
