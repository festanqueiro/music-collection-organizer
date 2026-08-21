import type { EffectsSettings } from '../types'

const MAX_DELAY_SECONDS = 2
const REVERB_IMPULSE_SECONDS = 2
const REVERB_DECAY_EXPONENT = 2

// Synthesizes a plate-style impulse response (exponentially decaying white
// noise) rather than shipping a recorded .wav — no binary asset, no
// licensing to track, good enough for a DJ preview player.
function createSyntheticImpulseResponse(context: BaseAudioContext): AudioBuffer {
  const sampleRate = context.sampleRate
  const length = Math.floor(sampleRate * REVERB_IMPULSE_SECONDS)
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
// setVolume() controls only dryGain — like an FX return bus on a real
// mixer, the delay/reverb wet paths tap the source directly and are NOT
// downstream of the volume knob, so pulling the volume down mutes the dry
// track while any already-decaying delay/reverb tail keeps ringing out
// and decaying naturally instead of cutting off with it. (A single
// downstream "master" gain covering everything was tried first, but that
// makes the volume knob behave like a hard mute on the whole channel —
// FX tails included — which isn't how a DJ mixer's channel fader usually
// interacts with its FX return.)
//
//              ┌─> dryGain ────────────────────────┐
// source ──────┼─> delayNode <-> feedbackGain       ├─> destination
//              │      └────────> delayWetGain ──────┤
//              └─> convolver ───> reverbWetGain ─────┘
export class EffectsChain {
  private context: AudioContext
  private dryGain: GainNode
  private delayNode: DelayNode
  private delayFeedbackGain: GainNode
  private delayWetGain: GainNode
  private reverbWetGain: GainNode

  constructor(audioElement: HTMLAudioElement) {
    this.context = new AudioContext()
    const source = this.context.createMediaElementSource(audioElement)

    this.dryGain = this.context.createGain()
    this.dryGain.gain.value = 1
    source.connect(this.dryGain)
    this.dryGain.connect(this.context.destination)

    this.delayNode = this.context.createDelay(MAX_DELAY_SECONDS)
    this.delayFeedbackGain = this.context.createGain()
    this.delayWetGain = this.context.createGain()
    this.delayWetGain.gain.value = 0
    source.connect(this.delayNode)
    this.delayNode.connect(this.delayFeedbackGain)
    this.delayFeedbackGain.connect(this.delayNode)
    this.delayNode.connect(this.delayWetGain)
    this.delayWetGain.connect(this.context.destination)

    const convolver = this.context.createConvolver()
    convolver.buffer = createSyntheticImpulseResponse(this.context)
    this.reverbWetGain = this.context.createGain()
    this.reverbWetGain.gain.value = 0
    source.connect(convolver)
    convolver.connect(this.reverbWetGain)
    this.reverbWetGain.connect(this.context.destination)
  }

  update(settings: EffectsSettings): void {
    this.delayNode.delayTime.value = settings.delay.timeMs / 1000
    this.delayFeedbackGain.gain.value = settings.delay.enabled ? settings.delay.feedback : 0
    this.delayWetGain.gain.value = settings.delay.enabled ? settings.delay.mix : 0
    this.reverbWetGain.gain.value = settings.reverb.enabled ? settings.reverb.mix : 0
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
