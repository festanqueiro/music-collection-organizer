// src/audio/audioEngine.ts
//
// The app's one AudioContext (ADR 0041). Everything that makes sound — the
// current track's EffectsChain, the dub siren, and later the mic — builds
// its nodes on `context` and connects its output to `input`, the mix bus.
// The bus is the single point a recorder can tap to get exactly what's
// heard, which separate per-track/per-siren contexts couldn't offer
// (a tap on one would lose its input at every track change, and would
// never hear the siren).
//
//   track chain ─┐
//   siren ───────┼─> input (mix bus) ─> localGain ─> destination
//   (mic later) ─┘
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
  // The mix bus: connect a source's final node here.
  readonly input: GainNode
  private localGain: GainNode
  // Whoever is making sound right now (a playing track, a held siren, a
  // running beat). The context suspends once this has been empty for
  // IDLE_SUSPEND_MS, and never while anything is in it.
  private active = new Set<object>()
  private suspendTimer: ReturnType<typeof setTimeout> | null = null

  constructor(context: EngineContext = new AudioContext()) {
    this.context = context as AudioContext
    this.input = this.context.createGain()
    this.localGain = this.context.createGain()
    this.input.connect(this.localGain)
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

  // Silences this Mac's speakers while casting, without touching the mix
  // bus (the visualizer's analyser and a recorder sit upstream of this).
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
