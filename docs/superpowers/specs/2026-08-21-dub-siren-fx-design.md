# Dub Siren FX Module Design

**Status:** Approved for planning.
**Builds on:** the merged player work (footer player, MIDI CC mapping, delay/reverb FX chain — now on `main`, including the post-fader FX send fix in `9efbc32`). This work is on its own new branch, `dub-siren-fx`.
**Source:** the user's existing watchOS dub siren (`festanqueiro/watchOS-dubsiren`, itself a port of the DSP core of `festanqueiro/vst-dubsiren`) — its sound design and parameter set are reused here; its UI is not. Refined through brainstorming.

## Goal

Add a **dub siren** — a classic reggae/dub siren voice — as a third FX module alongside delay and reverb:

1. A synthesized siren voice (oscillator + pitch LFO + per-mode sweeps/stabs) with its own echo, generated in Web Audio.
2. Controls in the existing FX row, following the same `<label>` + slider + `<MidiLearnBadge>` conventions as delay/reverb, plus a hold-to-sound trigger button.
3. MIDI-mappable parameters via the existing CC-learn system, including a hands-free auto-fire "Beat" control so the siren is usable from a knob-only controller like the user's Akai MIDI Mix.

The siren is a **sound generator**, not a processor: it is a sibling audio source mixed into the output, never a node inserted into `EffectsChain`'s track graph.

## What was taken from the watchOS app

Read from `SirenVoice.swift`, `SirenEngine.swift`, `EchoEffect.swift`, `ParameterStore.swift`, `BeatClock.swift`, `Preset.swift` and its design spec. Carried over verbatim as *sound design*:

| watchOS parameter | Carried over as | Notes |
|---|---|---|
| Mode (siren / bomb / gun / laser) | `siren.mode` | Mode drives carrier waveform + LFO depth, exactly as `SirenEngine.setMode` does |
| Pitch (90–520 Hz) | `siren.pitchHz` | Same clamp range as `SirenVoice.pitchHzMin/Max` |
| Speed (LFO rate, 0.5–12 Hz) | `siren.speedHz` | Same range as the watch's `SpeedView` crown range |
| Feedback (0–0.85, fixed 0.35 s delay, fixed 0.6 wet) | `siren.echoFeedback` | Same constants as `EchoEffect.swift` / `SirenEngine`'s `setDelayTimeSeconds(0.35)` |
| Beat (off / 3 tempo steps) | `siren.beat` | Same four states, same 0.6 / 0.4 / 0.25 s intervals as `BeatClock.BeatDivision` |
| Tap-and-hold trigger | hold-to-sound trigger button + hold-`S` key | Momentary, not latching |
| — | `siren.level` | New: the watch had no volume control; a desktop FX module needs one |

Envelope times, sweep ranges/durations, and the `tanh` output limiter are ported numerically from `SirenVoice.swift` / `SirenEngine.swift` (see §2).

Deliberately **not** carried over: the watch's screen-per-parameter Digital Crown UI (wrong platform), and its Presets list (out of scope, see below).

## Decisions from brainstorming

- **The siren is global, not per-track.** It gets its own module-level `AudioContext`, separate from `EffectsChain`'s per-track one. `EffectsChain`'s context is created in `Player`'s mount effect and `close()`d on unmount, and `Player` remounts on every track change — a siren living in that context would have its echo tail cut off and its auto-fire clock reset every time the DJ loads a new track. A siren is a live-performance drop-in sound, so it survives track changes.
- **The siren does NOT pass through the player volume fader, and has its own `level` control instead.** Pulling the track fader to zero and dropping a siren over the silence is the canonical dub move; routing the siren through `playerVolume` would mute it at exactly the moment it's wanted. This is not a repeat of the bug fixed in `9efbc32` — that bug was the *track's own audio* still reaching the FX sends at zero volume; here no track audio enters the siren path at all.
- **The siren's echo send is post-`level`, mirroring `effectsChain.ts`'s post-fader send.** Pulling `siren.level` to 0 must stop feeding the echo line while whatever is already in it rings out — the same behavior, and the same reasoning, as the delay/reverb sends being tapped from `dryGain` rather than from the raw source.
- **The siren has its own echo; it does not reuse the delay module.** Two reasons: the existing delay lives in a different `AudioContext` (Web Audio nodes cannot be connected across contexts, so this isn't even mechanically possible without collapsing both into one shared context), and the source app treats the echo as part of the siren voice.
- **Echo delay time is fixed at 0.35 s; only feedback is exposed.** Same as the watchOS app. The FX row is already crowded, and the dub-siren echo character comes from feedback, not from precise time-setting.
- **No noise/buzz generator.** The siren's buzz comes from the per-mode carrier waveform (square for Gun, sawtooth for Bomb/Laser), which is how both the VST and the watchOS port produce that character. Adding a noise blend would be a new sound not present in the source app.
- **The trigger is momentary hold-to-sound, not a latching toggle.** Matches the watch's tap-and-hold and a physical dub siren; a siren accidentally left latched on during a set is a worst-case failure.
- **The trigger is deliberately NOT MIDI-mappable; `siren.beat` is the hands-free path instead.** This app's MIDI layer is CC-only and maps a knob's continuous value to a continuous parameter (`scaleMidiValue`) — it has no note-on/note-off or discrete-trigger concept, and a MIDI Mix has knobs and faders, not usable trigger pads. Gating a note on "CC value above halfway" would be unmusical on a fader and unreliable on a knob. Binding `siren.beat` to a knob gives genuinely hands-free operation: turn it up and the siren auto-fires at one of three tempos, turn it back down to stop. This is exactly what the Beat control exists for in the source app.
- **The two discrete controls (`mode`, `beat`) ARE MIDI-mappable**, via a new `scaleMidiValueToOption` helper that quantizes a CC value into a fixed option list, rather than by abusing the continuous `scaleMidiValue`.
- **Manual triggering is disabled while Beat is active**, matching the watchOS app — manual and auto-fire never overlap.
- **Persistence uses the existing `effectsSettings` electron-store blob**, with one exception: `siren.beat` is coerced back to `'off'` on load, so relaunching the app never starts auto-firing a siren by itself.
- **The siren UI lives in the existing FX row inside `Player.tsx`**, which means it's only reachable while a track is loaded. Accepted: the FX row is the established home for FX controls, and a siren with no track playing isn't a live-performance scenario.

## 1. Types (`src/types.ts`)

```ts
export type SirenMode = 'siren' | 'bomb' | 'gun' | 'laser'
export type SirenBeat = 'off' | 'slow' | 'medium' | 'fast'

// Option orders are load-bearing: MIDI_DISCRETE_CONTROLS quantizes a CC
// value into an index against exactly these arrays, so a knob sweeps
// through them left-to-right in this order.
export const SIREN_MODES: readonly SirenMode[] = ['siren', 'bomb', 'gun', 'laser']
export const SIREN_BEATS: readonly SirenBeat[] = ['off', 'slow', 'medium', 'fast']

export interface SirenSettings {
  enabled: boolean
  mode: SirenMode
  pitchHz: number      // 90..520
  speedHz: number      // 0.5..12  (LFO / "wobble" rate)
  level: number        // 0..1     (the siren's own output gain)
  echoFeedback: number // 0..0.85
  beat: SirenBeat
}

export interface EffectsSettings {
  delay: { enabled: boolean; timeMs: number; feedback: number; mix: number }
  reverb: { enabled: boolean; mix: number }
  siren: SirenSettings
}

// Defaults are the watchOS app's "Cisco Siren" default preset
// (Preset.defaultPreset), with level added and beat forced off.
export const DEFAULT_SIREN_SETTINGS: SirenSettings = {
  enabled: false,
  mode: 'siren',
  pitchHz: 350,
  speedHz: 6,
  level: 0.8,
  echoFeedback: 0.45,
  beat: 'off',
}

export const DEFAULT_EFFECTS_SETTINGS: EffectsSettings = {
  delay: { enabled: false, timeMs: 300, feedback: 0.3, mix: 0.3 },
  reverb: { enabled: false, mix: 0.3 },
  siren: DEFAULT_SIREN_SETTINGS,
}

export type MidiControlKey =
  | 'volume'
  | 'delay.timeMs'
  | 'delay.feedback'
  | 'delay.mix'
  | 'reverb.mix'
  | 'siren.mode'
  | 'siren.pitchHz'
  | 'siren.speedHz'
  | 'siren.level'
  | 'siren.echoFeedback'
  | 'siren.beat'
```

## 2. The siren engine (`src/audio/sirenEngine.ts`, new)

### Node graph

The siren owns its own `AudioContext` and builds this graph once:

```
osc ──> envGain ──> levelGain ─┬─> dryTrim(0.8) ────────────────┐
 ^                             │                                 ├─> softClip ──> destination
 │                             └─> echoDelay(0.35s) <-> echoFeedbackGain
lfoOsc ──> lfoDepthGain             └────────────> echoWetGain(0.6) ┘
 (modulates osc.frequency)
```

- `osc` — an `OscillatorNode`; its `type` is set from the mode (see the mode table). Web Audio's built-in `square`/`sawtooth` are already band-limited, which is what the watch's hand-rolled polyBLEP was there to achieve — no equivalent code is needed here.
- `lfoOsc` (`sine`) → `lfoDepthGain` → `osc.frequency`. `lfoDepthGain.gain = pitchHz * modeDepth`, reproducing `freqHz = bf + lfoValue * bf * lfoDepthRatio` from `SirenVoice.renderOneSample`.
- `envGain` — the amplitude envelope, driven entirely by `setTargetAtTime`. Web Audio's `timeConstant` argument *is* the same τ as the watch's `Smoother`, so the ported attack/decay numbers carry over unchanged.
- `levelGain` — `siren.level`. **Both** the dry trim and the echo send are tapped from its output, so `level = 0` stops new signal entering the echo while the existing tail rings out (same convention as `effectsChain.ts`).
- `dryTrim` — fixed `0.8`, matching `tanh(dry * 0.8 + wet)` in `SirenEngine.swift`.
- `echoDelay` / `echoFeedbackGain` / `echoWetGain` — a `DelayNode` at a fixed `0.35` s, feedback = `siren.echoFeedback`, wet fixed at `0.6`, all ported from `EchoEffect.swift`.
- `softClip` — a `WaveShaperNode` whose curve is `tanh(x)` sampled over `x ∈ [-4, 4]` (4096 points, `oversample: '2x'`). This replaces the Swift `tanh()` per-sample limiter and exists for the same documented reason: a sustained tone through a high-feedback echo accumulates energy and hard-clips audibly.

The oscillators are started once at construction and never stopped (`OscillatorNode` is single-use — stopping one would require rebuilding the graph). Silence comes from `envGain` sitting at 0, not from stopping the source.

### Mode table

Ported from `SirenEngine.setMode` plus the per-mode branches of `SirenVoice.noteOn`:

```ts
interface ModeVoice {
  carrier: OscillatorType   // 'sine' | 'square' | 'sawtooth' | 'triangle'
  lfoDepth: number          // ratio of base pitch
  sweep: { fromRatio: number; toRatio: number; durationSeconds: number } | null
  // Non-null = one-shot: the voice decays on its own schedule and ignores triggerUp().
  oneShot: { attackTau: number; decayDelaySeconds: number; decayTau: number } | null
  retriggerMs: number | null // non-null = rapid restab while held
}

const MODE_VOICES: Record<SirenMode, ModeVoice> = {
  siren: { carrier: 'sine',     lfoDepth: 0.5, sweep: null,                                              oneShot: null,                                                       retriggerMs: null },
  bomb:  { carrier: 'sawtooth', lfoDepth: 0,   sweep: { fromRatio: 2.2, toRatio: 0.35, durationSeconds: 0.6 }, oneShot: { attackTau: 0.005, decayDelaySeconds: 0.15, decayTau: 0.22 }, retriggerMs: null },
  gun:   { carrier: 'square',   lfoDepth: 0,   sweep: null,                                              oneShot: null,                                                       retriggerMs: 110 },
  laser: { carrier: 'sawtooth', lfoDepth: 0.5, sweep: { fromRatio: 4, toRatio: 1, durationSeconds: 0.4 },      oneShot: null,                                                       retriggerMs: null },
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
```

`triggerDown()` applies `SUSTAIN_GAIN`/`SUSTAIN_ATTACK_TAU` for every mode **except** `gun`, which instead starts its retrigger scheduler and emits `STAB_*` stabs for as long as it's held — matching `SirenVoice.noteOn`, where the `.gun` branch skips the sustain envelope entirely. Beat auto-fire always emits `BEAT_STAB_*` stabs of the current mode, whatever that mode is.

Sweep endpoints are absolute Hz derived from the current pitch, floored at 20 Hz (`max(bf * ratio, 20)`), matching `SirenVoice.noteOn`. Sweeps use `osc.frequency.exponentialRampToValueAtTime` — the watch's `FrequencyRamp.swift` was itself a reimplementation of exactly that Web Audio curve, so the port is exact. While a sweep is active the LFO is silenced (`lfoDepthGain.gain = 0`) and restored when it ends, matching the watch's `if sweeping || bombing { ... } else { lfo }` branch.

### Public API

```ts
export class DubSirenEngine {
  constructor()

  // Applies the current parameter values. Called on every settings change.
  // Pitch/speed/level/feedback are applied with short setTargetAtTime
  // ramps (tau 0.02s, matching EchoEffect's smoothers) rather than
  // assigning .value, so dragging a slider or sweeping a MIDI knob
  // doesn't produce zipper noise. Changing `mode` swaps osc.type and the
  // LFO depth immediately. Changing `beat` starts/stops the scheduler.
  //
  // Two coupling rules: `lfoDepthGain.gain` is `pitchHz * MODE_VOICES[mode].lfoDepth`,
  // so it must be recomputed when EITHER pitch or mode changes; and while a
  // sweep is in flight the engine holds `lfoDepthGain.gain` at 0 and does not
  // write `osc.frequency` from `pitchHz` (the sweep's scheduled ramp owns
  // that param until it completes) — both are restored when the sweep ends.
  update(settings: SirenSettings): void

  // Momentary trigger. triggerDown is a no-op unless enabled and
  // beat === 'off'. triggerUp is ignored by one-shot modes (bomb), which
  // decay on their own schedule regardless of hold length.
  triggerDown(): void
  triggerUp(): void

  // AudioContexts start suspended until a user gesture — call from the
  // same handler that starts a trigger or enables the module.
  resume(): void

  close(): void
}

// Lazily-constructed module singleton. The AudioContext is not created
// until this is first called, which must be from inside a user gesture.
export function getDubSirenEngine(): DubSirenEngine
export function closeDubSirenEngine(): void
```

### Auto-fire scheduling

`beat` and `gun`-mode retrigger both need repeating stabs. Both use the standard Web Audio look-ahead pattern rather than firing a stab directly from a timer callback: a `setInterval(SCHEDULER_TICK_MS)` wakes up, asks a pure function which stab times fall inside the next look-ahead window, and schedules each of them against `context.currentTime` with `setTargetAtTime`. A plain `setInterval` that fired stabs directly would inherit the timer's jitter; the watch solved the same problem with a sample-accurate `BeatClock`.

```ts
const SCHEDULER_TICK_MS = 25
const SCHEDULER_LOOKAHEAD_SECONDS = 0.1
```

The scheduling arithmetic is the part most likely to double-fire or drift, so it lives in its own pure, dependency-free module:

**`src/audio/sirenSchedule.ts` (new)**

```ts
import type { SirenBeat } from '../types'

// Ported from BeatClock.BeatDivision.stabIntervalSeconds.
export const BEAT_INTERVAL_SECONDS: Record<SirenBeat, number | null> = {
  off: null,
  slow: 0.6,
  medium: 0.4,
  fast: 0.25,
}

// Returns every stab time in (lastStabTime, untilTime], spaced by
// intervalSeconds, ascending. Empty when intervalSeconds is null.
// lastStabTime === null means "never fired" — the first stab is scheduled
// at untilTime's window start, i.e. `fromTime`, so enabling Beat fires
// immediately rather than after one silent interval.
export function stabTimesInWindow(
  intervalSeconds: number | null,
  fromTime: number,
  untilTime: number,
  lastStabTime: number | null
): number[]
```

The engine keeps `lastStabTime` and feeds back the final returned value each tick, so no stab is ever scheduled twice and none is skipped when a tick runs late.

## 3. MIDI (`src/audio/midi.ts`)

`MIDI_CONTROL_RANGES` gains the five continuous siren controls. `siren.mode`/`siren.beat` also need entries (the `Record` is total) but are never read through `scaleMidiValue` — their ranges are the index bounds, present for completeness:

```ts
export const MIDI_CONTROL_RANGES: Record<MidiControlKey, { min: number; max: number }> = {
  volume: { min: 0, max: 1 },
  'delay.timeMs': { min: 0, max: 1000 },
  'delay.feedback': { min: 0, max: 0.9 },
  'delay.mix': { min: 0, max: 1 },
  'reverb.mix': { min: 0, max: 1 },
  'siren.mode': { min: 0, max: SIREN_MODES.length - 1 },
  'siren.pitchHz': { min: 90, max: 520 },
  'siren.speedHz': { min: 0.5, max: 12 },
  'siren.level': { min: 0, max: 1 },
  'siren.echoFeedback': { min: 0, max: 0.85 },
  'siren.beat': { min: 0, max: SIREN_BEATS.length - 1 },
}

// Controls whose value is one of a fixed option list rather than a
// continuous range. A knob bound to one of these sweeps through the
// options in order.
export const MIDI_DISCRETE_CONTROLS: Partial<Record<MidiControlKey, readonly string[]>> = {
  'siren.mode': SIREN_MODES,
  'siren.beat': SIREN_BEATS,
}

// Quantizes a 7-bit CC value into one of `options`, in even bands.
// min() guards the top band: ccValue 127 would otherwise land on
// options.length.
export function scaleMidiValueToOption<T extends string>(options: readonly T[], ccValue: number): T {
  return options[Math.min(options.length - 1, Math.floor((ccValue / 127) * options.length))]
}
```

## 4. Store (`src/state/store.ts`)

No new state fields — the siren's parameters live inside the existing `effectsSettings`, so `setEffectsSettings`'s existing 300 ms debounced persistence covers them for free. `loadEffectsSettings` gains the beat coercion:

```ts
loadEffectsSettings: async () => {
  const settings = await window.api.getEffectsSettings()
  // Never resume auto-firing a siren on launch, whatever was persisted.
  set({ effectsSettings: { ...settings, siren: { ...settings.siren, beat: 'off' } } })
},
```

`handleMidiControlChange` gains the siren branches. The discrete controls are handled before the continuous scaling, since `scaleMidiValue` doesn't apply to them:

```ts
const discreteOptions = MIDI_DISCRETE_CONTROLS[match]
const effectsSettings = get().effectsSettings
if (discreteOptions) {
  const option = scaleMidiValueToOption(discreteOptions, value)
  const key = match === 'siren.mode' ? 'mode' : 'beat'
  get().setEffectsSettings({ ...effectsSettings, siren: { ...effectsSettings.siren, [key]: option } })
  return
}

const scaled = scaleMidiValue(match, value)
// ...existing volume / delay / reverb branches...
} else if (match === 'siren.pitchHz') {
  get().setEffectsSettings({ ...effectsSettings, siren: { ...effectsSettings.siren, pitchHz: scaled } })
} else if (match === 'siren.speedHz') {
  get().setEffectsSettings({ ...effectsSettings, siren: { ...effectsSettings.siren, speedHz: scaled } })
} else if (match === 'siren.level') {
  get().setEffectsSettings({ ...effectsSettings, siren: { ...effectsSettings.siren, level: scaled } })
} else if (match === 'siren.echoFeedback') {
  get().setEffectsSettings({ ...effectsSettings, siren: { ...effectsSettings.siren, echoFeedback: scaled } })
}
```

Two typing notes for the implementer: `MIDI_DISCRETE_CONTROLS` is typed as `readonly string[]`, so `option` comes back as `string` and needs narrowing to `SirenMode`/`SirenBeat`; and the computed key `[key]:` widens the spread's result type. If either fights TypeScript, write this as an explicit two-branch `if (match === 'siren.mode') ... else if (match === 'siren.beat') ...` with `scaleMidiValueToOption(SIREN_MODES, value)` / `scaleMidiValueToOption(SIREN_BEATS, value)` called directly — those are generic over the literal array, so both types come out exact and no cast is needed. Behavior is identical either way.

## 5. Persistence (`electron/main/config.ts`)

`getEffectsSettings` currently returns the stored blob as-is. Any config written before this feature has no `siren` key, so `settings.siren.mode` would throw in the renderer. It now merges against the defaults:

```ts
export function getEffectsSettings(): EffectsSettings {
  const stored = getStore().get('effectsSettings')
  if (!stored) return DEFAULT_EFFECTS_SETTINGS
  return {
    ...DEFAULT_EFFECTS_SETTINGS,
    ...stored,
    siren: { ...DEFAULT_SIREN_SETTINGS, ...stored.siren },
  }
}
```

`setEffectsSettings` is unchanged. Note the merge is one level deep per sub-object, which is enough for this shape — `delay`/`reverb`/`siren` are flat objects of primitives.

## 6. UI (`src/components/Player.tsx`)

The siren controls are appended to the existing FX row `<div>`, using exactly the same markup conventions as delay/reverb: a `<label>` per control, a `<input type="range">` (or `<select>` for the two discrete ones), and a `<MidiLearnBadge control="...">` beside it. `MidiLearnBadge` needs no changes — it is already generic over `MidiControlKey`.

```tsx
function updateSiren(partial: Partial<EffectsSettings['siren']>) {
  setEffectsSettings({ ...effectsSettings, siren: { ...effectsSettings.siren, ...partial } })
}
```

Row contents, in order:

- **`Siren` checkbox** — `effectsSettings.siren.enabled`. Enabling it calls `getDubSirenEngine().resume()` in the same handler (the checkbox click is the user gesture that lets the `AudioContext` start).
- **`Mode` `<select>`** — the four `SIREN_MODES`, plus `<MidiLearnBadge control="siren.mode" />`.
- **`Pitch` slider** — `min={90} max={520} step={1}`, badge `siren.pitchHz`.
- **`Speed` slider** — `min={0.5} max={12} step={0.1}`, badge `siren.speedHz`.
- **`Echo` slider** — `min={0} max={0.85} step={0.01}`, badge `siren.echoFeedback`.
- **`Level` slider** — `min={0} max={1} step={0.01}`, badge `siren.level`.
- **`Beat` `<select>`** — the four `SIREN_BEATS`, badge `siren.beat`.
- **Trigger `<button>`** — labelled `SIREN`, `disabled={!siren.enabled || siren.beat !== 'off'}` (manual and auto-fire never overlap, matching the source app), with `title` explaining the disabled reason.

Trigger button handlers:

```tsx
<button
  disabled={!effectsSettings.siren.enabled || effectsSettings.siren.beat !== 'off'}
  // Pointer capture so the pointerup always lands on this button even if
  // the mouse drags off it mid-hold — without it, dragging off and
  // releasing leaves the siren stuck on.
  onPointerDown={(e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const engine = getDubSirenEngine()
    engine.resume()
    engine.triggerDown()
  }}
  onPointerUp={() => getDubSirenEngine().triggerUp()}
  onLostPointerCapture={() => getDubSirenEngine().triggerUp()}
>
  SIREN
</button>
```

`triggerUp()` is idempotent (it just re-targets `envGain` at 0), so the overlapping `onPointerUp`/`onLostPointerCapture` pair is safe.

### Keyboard trigger

The existing `keydown` effect in `Player.tsx` (the one handling space, already guarded on `modalOpen` and on `INPUT`/`TEXTAREA`/`SELECT`/`BUTTON` focus) gains an `s` case, plus a matching `keyup` listener and a `window` `blur` listener:

- `keydown` `s`: ignored when `e.repeat` (key auto-repeat would re-attack the envelope continuously), otherwise `resume()` + `triggerDown()`.
- `keyup` `s`: `triggerUp()`.
- `window` `blur`: `triggerUp()` — holding `S` and then Cmd-Tabbing away means the `keyup` never arrives, which would leave the siren sounding forever behind another app.

Both new listeners use the same `modalOpen` / focused-element guards as the space handler.

### Engine lifecycle

A single effect in `Player.tsx` pushes settings into the engine, mirroring the existing `effectsSettings` → `EffectsChain` effect:

```tsx
useEffect(() => {
  getDubSirenEngine().update(effectsSettings.siren)
}, [effectsSettings.siren])
```

It deliberately does **not** close the engine on unmount — that's the whole point of the module singleton (see the "global, not per-track" decision). `closeDubSirenEngine()` exists for completeness and is not called from `Player`.

Note: this effect calls `getDubSirenEngine()`, which constructs the `AudioContext` on first run — outside a user gesture, so it starts suspended. That's fine and intended: nothing is audible until the enable checkbox or a trigger calls `resume()`, both of which are user gestures. This matches how `EffectsChain` already behaves.

## File layout

- `src/types.ts` — `SirenMode`, `SirenBeat`, `SIREN_MODES`, `SIREN_BEATS`, `SirenSettings`, `DEFAULT_SIREN_SETTINGS`; `EffectsSettings.siren`; six new `MidiControlKey` members.
- `src/audio/sirenEngine.ts` (new) — `DubSirenEngine`, `getDubSirenEngine`, `closeDubSirenEngine`, the mode table and envelope constants.
- `src/audio/sirenSchedule.ts` (new) — `BEAT_INTERVAL_SECONDS`, `stabTimesInWindow` (pure).
- `src/audio/sirenSchedule.test.ts` (new) — Vitest tests for the above.
- `src/audio/midi.ts` — new `MIDI_CONTROL_RANGES` entries, `MIDI_DISCRETE_CONTROLS`, `scaleMidiValueToOption`.
- `src/audio/midi.test.ts` (new) — Vitest tests for `scaleMidiValueToOption`.
- `src/state/store.ts` — beat coercion in `loadEffectsSettings`; siren branches in `handleMidiControlChange`.
- `electron/main/config.ts` — defaults-merge in `getEffectsSettings`.
- `electron/main/config.test.ts` — a case for the merge (see Testing).
- `src/components/Player.tsx` — the FX-row siren controls, trigger button, `s`-key/blur handling, and the settings→engine effect.
- `src/audio/effectsChain.ts` — **unchanged.** The siren is a sibling source, not a node in the track's chain.

## Testing

Following this codebase's established split — pure logic gets Vitest, Web Audio / React / IPC wiring is verified by `npx tsc -b --noEmit` plus a manual walkthrough:

- **`src/audio/sirenSchedule.test.ts`** — `stabTimesInWindow`: `null` interval returns `[]`; a first call with `lastStabTime === null` fires at `fromTime`; a window shorter than the interval returns `[]`; a window spanning several intervals returns them all in ascending order; a late tick (a window much wider than one interval) doesn't skip stabs; consecutive calls fed the previous result never re-emit the same time.
- **`src/audio/midi.test.ts`** — `scaleMidiValueToOption`: CC `0` → first option, CC `127` → last option (the top-band guard), even band boundaries for a 4-option list.
- **`electron/main/config.test.ts`** — a stored `effectsSettings` blob with no `siren` key returns one with the full defaults merged in (the back-compat case that would otherwise crash the renderer), and a stored blob with a partial `siren` keeps its stored values while filling the missing ones.
- **Manual (`npm run dev`):** each mode's character (sustained wail / pitch-drop stab / rapid retrigger / laser sweep); hold-to-sound releases correctly, including dragging the mouse off the button mid-hold and Cmd-Tabbing while holding `S`; pulling `Level` to 0 kills the siren but lets the echo tail ring out (and does not silence the track); pulling the *track* volume fader to 0 leaves the siren fully audible; the siren keeps sounding across a track change; a MIDI knob bound to `siren.beat` sweeps off → slow → medium → fast; high `Echo` feedback on a sustained tone saturates smoothly instead of hard-clipping; the app relaunches with `Beat` back at off.

## Out of scope

- Presets (the watchOS app's eight named presets) — the parameter set is small enough to dial in by hand; a preset store is its own feature.
- Independent carrier/LFO waveform selection — `mode` drives both, as in the source app.
- A noise/buzz oscillator blend — not part of the source app's sound design.
- BPM-synced siren echo time (a `Sync` button like the delay's) — echo time is fixed at 0.35 s.
- Routing the siren through the existing delay/reverb — impossible across separate `AudioContext`s without collapsing both into a shared one, which is a much larger refactor of `EffectsChain`'s per-track lifecycle.
- Siren controls reachable with no track loaded.
- Making the trigger MIDI-mappable, or any MIDI note-on/note-off support — `siren.beat` is the hands-free path.
