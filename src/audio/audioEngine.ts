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
//                                       └─> recordBus ─> (recorder)
//   mic ─> micInput ─┬─> recordBus
//                    └─> monitorGain ─> localGain   (off unless monitoring)
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
const PARAM_SMOOTH_TAU = 0.02

type EngineContext = Pick<
  AudioContext,
  'state' | 'currentTime' | 'destination' | 'createGain' | 'resume' | 'suspend'
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
  // Music (after ducking) plus the mic — what a recording captures.
  readonly recordBus: GainNode
  // Pulled down by the mic's ducking.
  readonly duckGain: GainNode
  private monitorGain: GainNode
  private localGain: GainNode
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
    this.micInput = this.context.createGain()
    this.monitorGain = this.context.createGain()
    this.monitorGain.gain.value = 0
    this.localGain = this.context.createGain()
    this.input.connect(this.duckGain)
    this.duckGain.connect(this.localGain)
    this.duckGain.connect(this.recordBus)
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

let sharedEngine: AudioEngine | undefined

// Created lazily on first use: an AudioContext created outside a user
// gesture starts suspended, and resume() (called from the gesture that
// starts playback or a siren) wakes it.
export function getAudioEngine(): AudioEngine {
  if (!sharedEngine) sharedEngine = new AudioEngine()
  return sharedEngine
}
