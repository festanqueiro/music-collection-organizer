import type { MidiBinding, MidiControlKey } from '../types'

// Minimal local typings for the parts of the Web MIDI API this app uses.
// Not relying on lib.dom's (optional, version-dependent) WebMidi types
// avoids a hard dependency on whichever TS lib config happens to include
// them — we only need a few shapes, cast once from `navigator`.
interface MidiInputPort {
  addEventListener: (type: 'midimessage', listener: (e: { data: Uint8Array | null }) => void) => void
  removeEventListener: (type: 'midimessage', listener: (e: { data: Uint8Array | null }) => void) => void
}
interface MidiOutputPort {
  send: (data: number[]) => void
}
interface MidiAccessResult {
  inputs: Map<string, MidiInputPort>
  outputs: Map<string, MidiOutputPort>
  addEventListener: (
    type: 'statechange',
    listener: (e: { port: (MidiInputPort | MidiOutputPort) & { type: string; state: string } }) => void
  ) => void
}

function getRequestMidiAccess(): (() => Promise<MidiAccessResult>) | undefined {
  // Guards environments with no `navigator` global at all (e.g. this
  // module loaded under Vitest's node environment via store.ts) — merely
  // referencing the bare identifier would throw a ReferenceError there,
  // before the optional-chaining on requestMIDIAccess even gets a chance.
  if (typeof navigator === 'undefined') return undefined
  const nav = navigator as unknown as { requestMIDIAccess?: () => Promise<MidiAccessResult> }
  // .bind(nav) matters: requestMIDIAccess is a native WebIDL method that
  // requires `this` to be the exact Navigator instance it came from.
  // Returning the bare function reference (as this used to) detaches it
  // from that binding, so calling it later — requestMIDIAccess() instead
  // of navigator.requestMIDIAccess() — throws "TypeError: Illegal
  // invocation". Confirmed via a live CDP console capture against a real
  // running instance: this was the actual reason MIDI never connected,
  // separate from (and in addition to) the Electron permission grant.
  return nav.requestMIDIAccess?.bind(nav)
}

// Shared across subscribeToMidiCc and sendMidiFeedback so both use the same
// underlying MIDIAccess (and its outputs) instead of requesting it twice.
let sharedAccessPromise: Promise<MidiAccessResult> | undefined
function getSharedMidiAccess(): Promise<MidiAccessResult> | undefined {
  const requestMIDIAccess = getRequestMidiAccess()
  if (!requestMIDIAccess) return undefined
  if (!sharedAccessPromise) sharedAccessPromise = requestMIDIAccess()
  return sharedAccessPromise
}

export interface MidiCcMessage {
  channel: number // 0-15
  controller: number // 0-127
  value: number // 0-127
  kind: 'cc' | 'note'
}

// Subscribes to Control Change messages (status byte 0xB0-0xBF) AND Note
// On/Off messages (0x80-0x9F) from every currently-connected MIDI input,
// and any input connected afterward. Note messages are folded into the
// same {channel, controller, value} shape (note number as "controller",
// velocity as "value", Note Off/zero-velocity Note On as value 0) so
// hardware mute/solo-style buttons — which some controllers (including
// some Akai MIDI Mix firmware modes) send as Notes rather than CC — can be
// MIDI-learned the same way as a knob. Read-only, no sysex — this needs no
// special Electron/OS permission grant. Returns an unsubscribe function.
export function subscribeToMidiCc(onMessage: (msg: MidiCcMessage) => void): () => void {
  const accessPromise = getSharedMidiAccess()
  if (!accessPromise) {
    console.error('Web MIDI API unavailable in this environment')
    return () => {}
  }

  let cancelled = false
  const listeners = new Map<MidiInputPort, (e: { data: Uint8Array | null }) => void>()

  function attachInput(input: MidiInputPort) {
    // Some Electron/Chromium versions fire a redundant 'connected'
    // statechange for a port that was already enumerated (or already
    // attached via an earlier statechange) — without this guard, that
    // registers a second 'midimessage' listener on the same port, so every
    // real message fires onMessage twice. For a toggle bound to
    // delay.enabled/reverb.enabled, two calls per press flip the state
    // twice and silently cancel out — looked exactly like the button
    // doing nothing.
    if (listeners.has(input)) return
    const listener = (e: { data: Uint8Array | null }) => {
      const data = e.data
      if (!data || data.length < 3) return
      const status = data[0]
      const kind = status & 0xf0
      const channel = status & 0x0f
      if (kind === 0xb0) {
        onMessage({ channel, controller: data[1], value: data[2], kind: 'cc' }) // Control Change
      } else if (kind === 0x90) {
        onMessage({ channel, controller: data[1], value: data[2], kind: 'note' }) // Note On (velocity 0 == Note Off)
      } else if (kind === 0x80) {
        onMessage({ channel, controller: data[1], value: 0, kind: 'note' }) // Note Off
      }
    }
    listeners.set(input, listener)
    input.addEventListener('midimessage', listener)
  }

  accessPromise
    .then((access) => {
      if (cancelled) return
      for (const input of access.inputs.values()) attachInput(input)
      access.addEventListener('statechange', (e) => {
        if (e.port.type === 'input' && e.port.state === 'connected') attachInput(e.port as MidiInputPort)
      })
    })
    .catch((err) => {
      console.error('MIDI access request failed', err)
    })

  return () => {
    cancelled = true
    for (const [input, listener] of listeners) input.removeEventListener('midimessage', listener)
  }
}

// Sends LED feedback for a bound button-style control (delay.enabled,
// reverb.enabled) back to every connected MIDI output, in the same message
// format (CC vs Note) the binding was learned from — a CC message won't
// light an LED bound via Note messages, or vice versa. Fire-and-forget:
// hardware feedback is a nice-to-have, never something playback/toggling
// should block or fail on.
export function sendMidiFeedback(binding: MidiBinding, on: boolean): void {
  const accessPromise = getSharedMidiAccess()
  if (!accessPromise) return
  const kind = binding.kind ?? 'cc' // bindings saved before `kind` existed default to CC, the original-only format
  const value = on ? 127 : 0
  const data =
    kind === 'cc'
      ? [0xb0 | binding.channel, binding.controller, value]
      : [0x90 | binding.channel, binding.controller, value]
  accessPromise
    .then((access) => {
      for (const output of access.outputs.values()) output.send(data)
    })
    .catch((err) => console.error('failed to send MIDI feedback', err))
}

export const MIDI_CONTROL_RANGES: Record<MidiControlKey, { min: number; max: number }> = {
  volume: { min: 0, max: 1 },
  'delay.enabled': { min: 0, max: 1 },
  'delay.timeMs': { min: 0, max: 1000 },
  'delay.feedback': { min: 0, max: 0.9 },
  'delay.mix': { min: 0, max: 1 },
  'reverb.enabled': { min: 0, max: 1 },
  'reverb.mix': { min: 0, max: 1 },
}

// Scales a 7-bit MIDI CC value (0-127) to a control's real-world range.
export function scaleMidiValue(control: MidiControlKey, ccValue: number): number {
  const { min, max } = MIDI_CONTROL_RANGES[control]
  return min + (ccValue / 127) * (max - min)
}
