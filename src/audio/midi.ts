import type { MidiControlKey } from '../types'

// Minimal local typings for the parts of the Web MIDI API this app uses.
// Not relying on lib.dom's (optional, version-dependent) WebMidi types
// avoids a hard dependency on whichever TS lib config happens to include
// them — we only need three shapes, cast once from `navigator`.
interface MidiInputPort {
  addEventListener: (type: 'midimessage', listener: (e: { data: Uint8Array | null }) => void) => void
  removeEventListener: (type: 'midimessage', listener: (e: { data: Uint8Array | null }) => void) => void
}
interface MidiAccessResult {
  inputs: Map<string, MidiInputPort>
  addEventListener: (
    type: 'statechange',
    listener: (e: { port: MidiInputPort & { type: string; state: string } }) => void
  ) => void
}

function getRequestMidiAccess(): (() => Promise<MidiAccessResult>) | undefined {
  return (navigator as unknown as { requestMIDIAccess?: () => Promise<MidiAccessResult> }).requestMIDIAccess
}

export interface MidiCcMessage {
  channel: number // 0-15
  controller: number // 0-127
  value: number // 0-127
}

// Subscribes to Control Change messages (status byte 0xB0-0xBF) from every
// currently-connected MIDI input, and any input connected afterward.
// Read-only, no sysex — CC-only access needs no special Electron/OS
// permission grant. Returns an unsubscribe function.
export function subscribeToMidiCc(onMessage: (msg: MidiCcMessage) => void): () => void {
  const requestMIDIAccess = getRequestMidiAccess()
  if (!requestMIDIAccess) {
    console.error('Web MIDI API unavailable in this environment')
    return () => {}
  }

  let cancelled = false
  const listeners = new Map<MidiInputPort, (e: { data: Uint8Array | null }) => void>()

  function attachInput(input: MidiInputPort) {
    const listener = (e: { data: Uint8Array | null }) => {
      const data = e.data
      if (!data || data.length < 3) return
      const status = data[0]
      if (status < 0xb0 || status > 0xbf) return // Control Change messages only
      onMessage({ channel: status & 0x0f, controller: data[1], value: data[2] })
    }
    listeners.set(input, listener)
    input.addEventListener('midimessage', listener)
  }

  requestMIDIAccess()
    .then((access) => {
      if (cancelled) return
      for (const input of access.inputs.values()) attachInput(input)
      access.addEventListener('statechange', (e) => {
        if (e.port.type === 'input' && e.port.state === 'connected') attachInput(e.port)
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

export const MIDI_CONTROL_RANGES: Record<MidiControlKey, { min: number; max: number }> = {
  volume: { min: 0, max: 1 },
  'delay.timeMs': { min: 0, max: 1000 },
  'delay.feedback': { min: 0, max: 0.9 },
  'delay.mix': { min: 0, max: 1 },
  'reverb.mix': { min: 0, max: 1 },
}

// Scales a 7-bit MIDI CC value (0-127) to a control's real-world range.
export function scaleMidiValue(control: MidiControlKey, ccValue: number): number {
  const { min, max } = MIDI_CONTROL_RANGES[control]
  return min + (ccValue / 127) * (max - min)
}
