// src/audio/micControls.ts
//
// How each MIDI-mappable mic control changes MicSettings: on/off toggles
// (flipped on a button press, with LED feedback) and continuous knobs
// (a value already scaled to the control's range by scaleMidiValue).
// Talk, Throw and the echo's Division are actions, handled in the store.
import type { MicSettings, MidiControlKey } from '../types'

type Toggle = { get: (s: MicSettings) => boolean; set: (s: MicSettings, on: boolean) => MicSettings }

export const MIC_TOGGLES: Partial<Record<MidiControlKey, Toggle>> = {
  'mic.enabled': { get: (s) => s.enabled, set: (s, on) => ({ ...s, enabled: on }) },
  'mic.echo.enabled': { get: (s) => s.echo.enabled, set: (s, on) => ({ ...s, echo: { ...s.echo, enabled: on } }) },
  'mic.reverb.enabled': { get: (s) => s.reverb.enabled, set: (s, on) => ({ ...s, reverb: { ...s.reverb, enabled: on } }) },
  'mic.pitch.enabled': { get: (s) => s.pitch.enabled, set: (s, on) => ({ ...s, pitch: { ...s.pitch, enabled: on } }) },
  'mic.radio.enabled': { get: (s) => s.radio.enabled, set: (s, on) => ({ ...s, radio: { ...s.radio, enabled: on } }) },
  'mic.duck.enabled': { get: (s) => s.duck.enabled, set: (s, on) => ({ ...s, duck: { ...s.duck, enabled: on } }) },
}

export const MIC_KNOBS: Partial<Record<MidiControlKey, (s: MicSettings, v: number) => MicSettings>> = {
  'mic.gainDb': (s, v) => ({ ...s, gainDb: v }),
  'mic.gateDb': (s, v) => ({ ...s, gateDb: v }),
  'mic.compressor': (s, v) => ({ ...s, compressor: v }),
  'mic.eq.low': (s, v) => ({ ...s, eq: { ...s.eq, low: v } }),
  'mic.eq.mid': (s, v) => ({ ...s, eq: { ...s.eq, mid: v } }),
  'mic.eq.high': (s, v) => ({ ...s, eq: { ...s.eq, high: v } }),
  'mic.echo.timeMs': (s, v) => ({ ...s, echo: { ...s.echo, timeMs: v } }),
  'mic.echo.feedback': (s, v) => ({ ...s, echo: { ...s.echo, feedback: v } }),
  'mic.echo.mix': (s, v) => ({ ...s, echo: { ...s.echo, mix: v } }),
  'mic.reverb.decaySeconds': (s, v) => ({ ...s, reverb: { ...s.reverb, decaySeconds: v } }),
  'mic.reverb.mix': (s, v) => ({ ...s, reverb: { ...s.reverb, mix: v } }),
  // Whole semitones: a MIDI knob would otherwise land between notes.
  'mic.pitch.semitones': (s, v) => ({ ...s, pitch: { ...s.pitch, semitones: Math.round(v) } }),
  'mic.pitch.mix': (s, v) => ({ ...s, pitch: { ...s.pitch, mix: v } }),
  'mic.radio.drive': (s, v) => ({ ...s, radio: { ...s.radio, drive: v } }),
  'mic.duck.amountDb': (s, v) => ({ ...s, duck: { ...s.duck, amountDb: v } }),
}

// Echo time for a note value at a BPM (beats = quarter notes), clamped to
// the knob's range.
export function echoTimeForDivision(bpm: number, beats: number): number {
  return Math.min(1000, Math.max(20, Math.round((60000 / bpm) * beats)))
}

// Talk is one button that works both ways: a quick press toggles the mic
// between live and muted; holding it while muted talks only for as long as
// it's held (push-to-talk).
export const TALK_HOLD_MS = 350

export function talkAfterRelease(wasLive: boolean, heldMs: number): boolean {
  // Was muted: the press made it live. Held → push-to-talk, so mute again;
  // tapped → stays live.
  if (!wasLive) return heldMs < TALK_HOLD_MS
  // Was live: a tap mutes it (a hold of a live mic changes nothing).
  return heldMs >= TALK_HOLD_MS
}
