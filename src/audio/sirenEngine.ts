// src/audio/sirenEngine.ts
import type { SirenMode, SirenSettings } from '../types'
import { BEAT_INTERVAL_SECONDS, stabTimesInWindow } from './sirenSchedule'

interface ModeVoice {
  carrier: OscillatorType
  lfoDepth: number // ratio of base pitch
  sweep: { fromRatio: number; toRatio: number; durationSeconds: number } | null
  // Non-null = one-shot: the voice decays on its own schedule and ignores triggerUp().
  oneShot: { attackTau: number; decayDelaySeconds: number; decayTau: number } | null
  retriggerMs: number | null // non-null = rapid restab while held
}

// Ported from the watchOS app's SirenEngine.setMode plus the per-mode
// branches of SirenVoice.noteOn.
const MODE_VOICES: Record<SirenMode, ModeVoice> = {
  siren: { carrier: 'sine', lfoDepth: 0.5, sweep: null, oneShot: null, retriggerMs: null },
  bomb: {
    carrier: 'sawtooth',
    lfoDepth: 0,
    sweep: { fromRatio: 2.2, toRatio: 0.35, durationSeconds: 0.6 },
    oneShot: { attackTau: 0.005, decayDelaySeconds: 0.15, decayTau: 0.22 },
    retriggerMs: null,
  },
  gun: { carrier: 'square', lfoDepth: 0, sweep: null, oneShot: null, retriggerMs: 110 },
  laser: {
    carrier: 'sawtooth',
    lfoDepth: 0.5,
    sweep: { fromRatio: 4, toRatio: 1, durationSeconds: 0.4 },
    oneShot: null,
    retriggerMs: null,
  },
}

const SUSTAIN_GAIN = 0.9
const SUSTAIN_ATTACK_TAU = 0.005
const RELEASE_TAU = 0.08
const STAB_GAIN = 0.9
const STAB_ATTACK_TAU = 0.003
const STAB_DECAY_DELAY_SECONDS = 0.05
const STAB_DECAY_TAU = 0.03
const BEAT_STAB_GAIN = 0.85
const BEAT_STAB_ATTACK_TAU = 0.008
const BEAT_STAB_DECAY_DELAY_SECONDS = 0.11
const BEAT_STAB_DECAY_TAU = 0.05

const PARAM_SMOOTH_TAU = 0.02 // matches EchoEffect's smoothers
const MIN_SWEEP_HZ = 20
const ECHO_DELAY_SECONDS = 0.35
const ECHO_WET = 0.6
const DRY_TRIM = 0.8
const SCHEDULER_TICK_MS = 25
const SCHEDULER_LOOKAHEAD_SECONDS = 0.1

// tanh(x) sampled over x in [-4, 4] — replaces the Swift tanh() per-sample
// limiter. A sustained tone through a high-feedback echo accumulates
// energy and hard-clips audibly without this.
function createSoftClipCurve(): Float32Array<ArrayBuffer> {
  const length = 4096
  const curve = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT))
  for (let i = 0; i < length; i++) {
    const x = (i / (length - 1)) * 8 - 4
    curve[i] = Math.tanh(x)
  }
  return curve
}

export class DubSirenEngine {
  private context: AudioContext
  private osc: OscillatorNode
  private lfoOsc: OscillatorNode
  private lfoDepthGain: GainNode
  private envGain: GainNode
  private levelGain: GainNode
  private echoDelay: DelayNode
  private echoFeedbackGain: GainNode
  private echoWetGain: GainNode

  private mode: SirenMode = 'siren'
  private pitchHz = 350
  private held = false
  private sweeping = false
  private gunRetriggerId: ReturnType<typeof setInterval> | null = null
  private beatSchedulerId: ReturnType<typeof setInterval> | null = null
  private lastBeatStabTime: number | null = null
  private currentBeat: SirenSettings['beat'] = 'off'

  constructor() {
    this.context = new AudioContext()

    this.osc = this.context.createOscillator()
    this.osc.type = 'sine'
    this.osc.frequency.value = this.pitchHz

    this.lfoOsc = this.context.createOscillator()
    this.lfoOsc.type = 'sine'
    this.lfoOsc.frequency.value = 6
    this.lfoDepthGain = this.context.createGain()
    this.lfoDepthGain.gain.value = 0
    this.lfoOsc.connect(this.lfoDepthGain)
    this.lfoDepthGain.connect(this.osc.frequency)

    this.envGain = this.context.createGain()
    this.envGain.gain.value = 0
    this.osc.connect(this.envGain)

    this.levelGain = this.context.createGain()
    this.levelGain.gain.value = 0.8
    this.envGain.connect(this.levelGain)

    const dryTrim = this.context.createGain()
    dryTrim.gain.value = DRY_TRIM
    this.levelGain.connect(dryTrim)

    this.echoDelay = this.context.createDelay(1)
    this.echoDelay.delayTime.value = ECHO_DELAY_SECONDS
    this.echoFeedbackGain = this.context.createGain()
    this.echoFeedbackGain.gain.value = 0.45
    this.levelGain.connect(this.echoDelay)
    this.echoDelay.connect(this.echoFeedbackGain)
    this.echoFeedbackGain.connect(this.echoDelay)
    this.echoWetGain = this.context.createGain()
    this.echoWetGain.gain.value = ECHO_WET
    this.echoDelay.connect(this.echoWetGain)

    const softClip = this.context.createWaveShaper()
    softClip.curve = createSoftClipCurve()
    softClip.oversample = '2x'
    dryTrim.connect(softClip)
    this.echoWetGain.connect(softClip)
    softClip.connect(this.context.destination)

    this.osc.start()
    this.lfoOsc.start()
  }

  update(settings: SirenSettings): void {
    const now = this.context.currentTime
    this.mode = settings.mode
    this.pitchHz = settings.pitchHz

    this.osc.type = MODE_VOICES[settings.mode].carrier
    // While a sweep is in flight, the sweep's scheduled ramp owns
    // osc.frequency and the LFO is silenced — restored once it ends (see
    // scheduleSweep). Otherwise pitch/LFO depth track settings directly.
    if (!this.sweeping) {
      this.osc.frequency.setTargetAtTime(settings.pitchHz, now, PARAM_SMOOTH_TAU)
      this.lfoDepthGain.gain.setTargetAtTime(
        settings.pitchHz * MODE_VOICES[settings.mode].lfoDepth * settings.depth,
        now,
        PARAM_SMOOTH_TAU
      )
    }
    this.lfoOsc.frequency.setTargetAtTime(settings.speedHz, now, PARAM_SMOOTH_TAU)
    this.levelGain.gain.setTargetAtTime(settings.level, now, PARAM_SMOOTH_TAU)
    this.echoFeedbackGain.gain.setTargetAtTime(settings.echoFeedback, now, PARAM_SMOOTH_TAU)

    this.updateBeat(settings.beat)

    // gun's retrigger loop only makes sense while physically held — a
    // mode switch away from gun (or a release) must stop it.
    if (settings.mode !== 'gun' || !this.held) this.stopGunRetrigger()
    else if (this.held && !this.gunRetriggerId) this.startGunRetrigger()
  }

  // Momentary trigger. No-op unless enabled and beat is off — callers are
  // expected to check `enabled` before calling, but beat/manual mutual
  // exclusion is enforced here too as a second guard.
  triggerDown(): void {
    if (this.held) return
    this.held = true
    const voice = MODE_VOICES[this.mode]

    if (voice.oneShot) {
      this.fireOneShot(voice)
    } else if (voice.retriggerMs) {
      this.fireStab(STAB_GAIN, STAB_ATTACK_TAU, STAB_DECAY_DELAY_SECONDS, STAB_DECAY_TAU)
      this.startGunRetrigger()
    } else {
      if (voice.sweep) this.scheduleSweep(voice.sweep)
      const now = this.context.currentTime
      this.envGain.gain.cancelScheduledValues(now)
      this.envGain.gain.setTargetAtTime(SUSTAIN_GAIN, now, SUSTAIN_ATTACK_TAU)
    }
  }

  triggerUp(): void {
    this.held = false
    this.stopGunRetrigger()
    const voice = MODE_VOICES[this.mode]
    if (voice.oneShot) return // one-shots decay on their own schedule
    const now = this.context.currentTime
    this.envGain.gain.cancelScheduledValues(now)
    this.envGain.gain.setTargetAtTime(0, now, RELEASE_TAU)
  }

  resume(): void {
    if (this.context.state === 'suspended') this.context.resume().catch(() => {})
  }

  // Same output-device routing as EffectsChain.setSinkId — the siren is
  // its own separate AudioContext, so it needs this applied independently
  // or it would keep playing through the system default even after the
  // track's own audio moved to a chosen interface.
  async setSinkId(deviceId: string | null): Promise<void> {
    const context = this.context as AudioContext & { setSinkId?: (id: string) => Promise<void> }
    if (typeof context.setSinkId !== 'function') return
    try {
      await context.setSinkId(deviceId ?? '')
    } catch (err) {
      console.error('failed to set siren audio output device', err)
    }
  }

  close(): void {
    this.stopGunRetrigger()
    this.stopBeatScheduler()
    this.context.close().catch(() => {})
  }

  private fireOneShot(voice: ModeVoice): void {
    if (voice.sweep) this.scheduleSweep(voice.sweep)
    const now = this.context.currentTime
    const oneShot = voice.oneShot!
    this.envGain.gain.cancelScheduledValues(now)
    this.envGain.gain.setTargetAtTime(SUSTAIN_GAIN, now, oneShot.attackTau)
    this.envGain.gain.setTargetAtTime(0, now + oneShot.decayDelaySeconds, oneShot.decayTau)
  }

  private fireStab(gain: number, attackTau: number, decayDelaySeconds: number, decayTau: number): void {
    const now = this.context.currentTime
    this.envGain.gain.cancelScheduledValues(now)
    this.envGain.gain.setTargetAtTime(gain, now, attackTau)
    this.envGain.gain.setTargetAtTime(0, now + decayDelaySeconds, decayTau)
  }

  private scheduleSweep(sweep: { fromRatio: number; toRatio: number; durationSeconds: number }): void {
    const now = this.context.currentTime
    const fromHz = Math.max(this.pitchHz * sweep.fromRatio, MIN_SWEEP_HZ)
    const toHz = Math.max(this.pitchHz * sweep.toRatio, MIN_SWEEP_HZ)
    this.sweeping = true
    this.lfoDepthGain.gain.setTargetAtTime(0, now, PARAM_SMOOTH_TAU)
    this.osc.frequency.cancelScheduledValues(now)
    this.osc.frequency.setValueAtTime(fromHz, now)
    this.osc.frequency.exponentialRampToValueAtTime(toHz, now + sweep.durationSeconds)
    setTimeout(() => {
      this.sweeping = false
    }, sweep.durationSeconds * 1000)
  }

  private startGunRetrigger(): void {
    if (this.gunRetriggerId) return
    this.fireStab(STAB_GAIN, STAB_ATTACK_TAU, STAB_DECAY_DELAY_SECONDS, STAB_DECAY_TAU)
    this.gunRetriggerId = setInterval(() => {
      this.fireStab(STAB_GAIN, STAB_ATTACK_TAU, STAB_DECAY_DELAY_SECONDS, STAB_DECAY_TAU)
    }, MODE_VOICES.gun.retriggerMs!)
  }

  private stopGunRetrigger(): void {
    if (this.gunRetriggerId) {
      clearInterval(this.gunRetriggerId)
      this.gunRetriggerId = null
    }
  }

  private updateBeat(beat: SirenSettings['beat']): void {
    this.currentBeat = beat
    if (beat === 'off') {
      this.stopBeatScheduler()
      return
    }
    if (this.beatSchedulerId) return // already running — the interval below reads this.currentBeat live on every tick

    this.lastBeatStabTime = null
    this.beatSchedulerId = setInterval(() => {
      const interval = BEAT_INTERVAL_SECONDS[this.currentBeat]
      if (interval === null) return
      const now = this.context.currentTime
      const stabs = stabTimesInWindow(interval, now, now + SCHEDULER_LOOKAHEAD_SECONDS, this.lastBeatStabTime)
      for (const t of stabs) {
        const delayMs = Math.max(0, (t - now) * 1000)
        setTimeout(() => {
          this.fireStab(BEAT_STAB_GAIN, BEAT_STAB_ATTACK_TAU, BEAT_STAB_DECAY_DELAY_SECONDS, BEAT_STAB_DECAY_TAU)
        }, delayMs)
      }
      if (stabs.length > 0) this.lastBeatStabTime = stabs[stabs.length - 1]
    }, SCHEDULER_TICK_MS)
  }

  private stopBeatScheduler(): void {
    if (this.beatSchedulerId) {
      clearInterval(this.beatSchedulerId)
      this.beatSchedulerId = null
    }
    this.lastBeatStabTime = null
  }
}

let sharedEngine: DubSirenEngine | undefined

// Lazily-constructed module singleton. The AudioContext is not created
// until this is first called, which must be from inside a user gesture
// (or immediately after one) — otherwise it starts suspended, same as
// EffectsChain.
export function getDubSirenEngine(): DubSirenEngine {
  if (!sharedEngine) sharedEngine = new DubSirenEngine()
  return sharedEngine
}

export function closeDubSirenEngine(): void {
  sharedEngine?.close()
  sharedEngine = undefined
}
