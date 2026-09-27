// src/audio/fxModules.ts
//
// Delay and reverb as self-contained send effects: connect a signal into
// `input`, and `output` carries only the wet signal, to be summed with the
// dry one downstream. Used by the track's EffectsChain, and meant to be
// reused by the mic's own effects.

const MAX_DELAY_SECONDS = 2
const MAX_PRE_DELAY_SECONDS = 0.5
const REVERB_DECAY_EXPONENT = 2
// Reassigning delayTime.value directly jumps the delay line's read
// position while audio flows through it — a click on every knob tick.
// setTargetAtTime glides to the new value instead.
const DELAY_TIME_TAU = 0.08
const PRE_DELAY_TAU = 0.05

// Synthesizes a plate-style impulse response (exponentially decaying white
// noise) rather than shipping a recorded .wav — no binary asset, no
// licensing to track. It's a length*2-channel Math.random() loop, so it's
// only regenerated when the decay actually changes (see ReverbModule).
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

export interface DelayParams {
  enabled: boolean
  timeMs: number
  feedback: number
  mix: number
}

//   input (delayNode) <-> feedbackGain
//        └─> wetGain = output
export class DelayModule {
  readonly input: DelayNode
  readonly output: GainNode
  private feedbackGain: GainNode

  constructor(private context: BaseAudioContext) {
    this.input = context.createDelay(MAX_DELAY_SECONDS)
    this.feedbackGain = context.createGain()
    this.output = context.createGain()
    this.output.gain.value = 0
    this.input.connect(this.feedbackGain)
    this.feedbackGain.connect(this.input)
    this.input.connect(this.output)
  }

  update(params: DelayParams): void {
    this.input.delayTime.setTargetAtTime(params.timeMs / 1000, this.context.currentTime, DELAY_TIME_TAU)
    this.feedbackGain.gain.value = params.enabled ? params.feedback : 0
    this.output.gain.value = params.enabled ? params.mix : 0
  }

  disconnect(): void {
    for (const node of [this.input, this.feedbackGain, this.output]) node.disconnect()
  }
}

export interface ReverbParams {
  enabled: boolean
  mix: number
  decaySeconds: number
  preDelayMs: number
}

//   input (preDelayNode) ─> convolver ─> wetGain = output
export class ReverbModule {
  readonly input: DelayNode
  readonly output: GainNode
  private convolver: ConvolverNode
  private decaySeconds: number

  constructor(
    private context: BaseAudioContext,
    decaySeconds = 2
  ) {
    this.input = context.createDelay(MAX_PRE_DELAY_SECONDS)
    this.convolver = context.createConvolver()
    this.decaySeconds = decaySeconds
    this.convolver.buffer = createSyntheticImpulseResponse(context, decaySeconds)
    this.output = context.createGain()
    this.output.gain.value = 0
    this.input.connect(this.convolver)
    this.convolver.connect(this.output)
  }

  update(params: ReverbParams): void {
    this.input.delayTime.setTargetAtTime(params.preDelayMs / 1000, this.context.currentTime, PRE_DELAY_TAU)
    // Skip regenerating unless the decay changed, so dragging the mix or
    // pre-delay knob doesn't redo the impulse on every tick.
    if (params.decaySeconds !== this.decaySeconds) {
      this.decaySeconds = params.decaySeconds
      this.convolver.buffer = createSyntheticImpulseResponse(this.context, params.decaySeconds)
    }
    this.output.gain.value = params.enabled ? params.mix : 0
  }

  disconnect(): void {
    for (const node of [this.input, this.convolver, this.output]) node.disconnect()
  }
}
