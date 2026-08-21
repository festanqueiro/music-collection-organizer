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
// masterGain sits downstream of the dry/delay/reverb mix, like a DJ
// mixer's channel fader — it's the only thing setVolume() controls, so
// turning the volume down brings down the FX along with the dry signal,
// not just the dry path. (HTMLMediaElement.volume was tried first, but
// once a media element's output is captured by createMediaElementSource,
// that property no longer reliably governs what actually reaches
// destination — only nodes inside the graph itself do.)
//
//              ┌─> dryGain ──────────────────────┐
// source ──────┼─> delayNode <-> feedbackGain     ├─> masterGain -> destination
//              │      └────────> delayWetGain ────┤
//              └─> convolver ───> reverbWetGain ───┘
export class EffectsChain {
  private context: AudioContext
  private dryGain: GainNode
  private delayNode: DelayNode
  private delayFeedbackGain: GainNode
  private delayWetGain: GainNode
  private reverbWetGain: GainNode
  private masterGain: GainNode

  constructor(audioElement: HTMLAudioElement) {
    this.context = new AudioContext()
    const source = this.context.createMediaElementSource(audioElement)

    this.masterGain = this.context.createGain()
    this.masterGain.gain.value = 1
    this.masterGain.connect(this.context.destination)

    this.dryGain = this.context.createGain()
    this.dryGain.gain.value = 1
    source.connect(this.dryGain)
    this.dryGain.connect(this.masterGain)

    this.delayNode = this.context.createDelay(MAX_DELAY_SECONDS)
    this.delayFeedbackGain = this.context.createGain()
    this.delayWetGain = this.context.createGain()
    this.delayWetGain.gain.value = 0
    source.connect(this.delayNode)
    this.delayNode.connect(this.delayFeedbackGain)
    this.delayFeedbackGain.connect(this.delayNode)
    this.delayNode.connect(this.delayWetGain)
    this.delayWetGain.connect(this.masterGain)

    const convolver = this.context.createConvolver()
    convolver.buffer = createSyntheticImpulseResponse(this.context)
    this.reverbWetGain = this.context.createGain()
    this.reverbWetGain.gain.value = 0
    source.connect(convolver)
    convolver.connect(this.reverbWetGain)
    this.reverbWetGain.connect(this.masterGain)
  }

  update(settings: EffectsSettings): void {
    this.delayNode.delayTime.value = settings.delay.timeMs / 1000
    this.delayFeedbackGain.gain.value = settings.delay.enabled ? settings.delay.feedback : 0
    this.delayWetGain.gain.value = settings.delay.enabled ? settings.delay.mix : 0
    this.reverbWetGain.gain.value = settings.reverb.enabled ? settings.reverb.mix : 0
  }

  setVolume(value: number): void {
    this.masterGain.gain.value = value
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
