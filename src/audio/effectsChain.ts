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
//                                                             ┌─────────────────────────────────────────┐
// source ──> dryGain ──> eqLow ─> eqMid ─> eqHigh ──> filterNode ──┼─> delayNode <-> feedbackGain ├─> destination
//                                                                    │      └────────> delayWetGain ─┤
//                                                                    ├─> preDelayNode ─> convolver ─> reverbWetGain ┤
//                                                                    └────────────────────────────────────────────┘
//
// EQ sits right after the fader, before the filter — matching a real
// mixer channel strip's EQ-then-filter order — so a boosted/cut band
// carries through the sweep filter and the delay/reverb sends too. Three
// chained BiquadFilterNodes (lowshelf/peaking/highshelf), each just a
// gain knob at a fixed frequency.
//
// filterNode sits after the fader like a mixer channel's filter knob —
// everything downstream (the dry signal AND the delay/reverb sends) is
// swept together, same as sweeping a real Xone-style filter with a delay
// throw active filters the repeats too. It's a single BiquadFilterNode
// whose type/frequency track filter.position: negative sweeps a lowpass
// closed (cuts highs), positive sweeps a highpass closed (cuts lows), 0
// is bypass (wide open) — see update()'s comment for the mapping.
export class EffectsChain {
  private context: AudioContext
  private dryGain: GainNode
  private eqLow: BiquadFilterNode
  private eqMid: BiquadFilterNode
  private eqHigh: BiquadFilterNode
  private filterNode: BiquadFilterNode
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
    this.dryGain.connect(this.eqLow)
    this.eqLow.connect(this.eqMid)
    this.eqMid.connect(this.eqHigh)

    this.filterNode = this.context.createBiquadFilter()
    this.filterNode.type = 'lowpass'
    this.filterNode.frequency.value = FILTER_LOWPASS_OPEN_HZ
    this.eqHigh.connect(this.filterNode)
    this.filterNode.connect(this.context.destination)

    this.delayNode = this.context.createDelay(MAX_DELAY_SECONDS)
    this.delayFeedbackGain = this.context.createGain()
    this.delayWetGain = this.context.createGain()
    this.delayWetGain.gain.value = 0
    this.filterNode.connect(this.delayNode)
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
    this.filterNode.connect(this.preDelayNode)
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
    // enabled forces all three bands flat (0dB) without touching the
    // dialed-in gains, same convention as filter.enabled below.
    this.eqLow.gain.setTargetAtTime(settings.eq.enabled ? settings.eq.low : 0, now, FILTER_PARAM_TAU)
    this.eqMid.gain.setTargetAtTime(settings.eq.enabled ? settings.eq.mid : 0, now, FILTER_PARAM_TAU)
    this.eqHigh.gain.setTargetAtTime(settings.eq.enabled ? settings.eq.high : 0, now, FILTER_PARAM_TAU)

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

    // position < 0: lowpass sweeping closed (cuts highs) as it goes more
    // negative. position > 0: highpass sweeping closed (cuts lows) as it
    // goes more positive. position === 0: type doesn't matter, both are
    // wide open (lowpass parked at 20kHz is equally transparent), so it's
    // left as whatever type was already set rather than switched — no
    // point retyping the node every time it's dead-centered. enabled is a
    // hard bypass on top of that (a MIDI-mapped on/off button) — forces
    // fully open without touching the dialed-in position, so re-enabling
    // picks up right where the knob was left.
    const { enabled, position: rawPosition, resonance } = settings.filter
    const position = enabled ? rawPosition : 0
    if (position < 0) {
      this.filterNode.type = 'lowpass'
      const t = -position // 0 (open) .. 1 (fully closed)
      const freq = FILTER_LOWPASS_OPEN_HZ * (FILTER_LOWPASS_CLOSED_HZ / FILTER_LOWPASS_OPEN_HZ) ** t
      this.filterNode.frequency.setTargetAtTime(freq, now, FILTER_PARAM_TAU)
    } else if (position > 0) {
      this.filterNode.type = 'highpass'
      const t = position // 0 (open) .. 1 (fully closed)
      const freq = FILTER_HIGHPASS_OPEN_HZ * (FILTER_HIGHPASS_CLOSED_HZ / FILTER_HIGHPASS_OPEN_HZ) ** t
      this.filterNode.frequency.setTargetAtTime(freq, now, FILTER_PARAM_TAU)
    } else {
      const openFreq = this.filterNode.type === 'highpass' ? FILTER_HIGHPASS_OPEN_HZ : FILTER_LOWPASS_OPEN_HZ
      this.filterNode.frequency.setTargetAtTime(openFreq, now, FILTER_PARAM_TAU)
    }
    this.filterNode.Q.setTargetAtTime(resonance, now, FILTER_PARAM_TAU)
  }

  setVolume(value: number): void {
    this.dryGain.gain.value = value
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
