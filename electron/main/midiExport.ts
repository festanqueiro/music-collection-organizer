import {
  MIDI_CONTROL_KEYS,
  type MidiBinding,
  type MidiControlKey,
  type MidiImportResult,
  type MidiMappings,
} from '../../src/types'

// On-disk format for Settings → Audio → MIDI → Export/Import. Versioned
// so a future format change can still read (or clearly reject) old files.
export interface MidiExportData {
  type: 'mco-midi-mappings'
  version: 1
  exportedAt: string
  mappings: MidiMappings
}

export function buildMidiExport(mappings: MidiMappings, now: Date = new Date()): MidiExportData {
  return { type: 'mco-midi-mappings', version: 1, exportedAt: now.toISOString(), mappings }
}

const KNOWN_KEYS = new Set<string>(MIDI_CONTROL_KEYS)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseBinding(value: unknown): MidiBinding | null {
  if (!isRecord(value)) return null
  const { channel, controller, kind } = value
  if (!Number.isInteger(channel) || (channel as number) < 0 || (channel as number) > 15) return null
  if (!Number.isInteger(controller) || (controller as number) < 0 || (controller as number) > 127) return null
  if (kind !== undefined && kind !== 'cc' && kind !== 'note') return null
  return kind === undefined
    ? { channel: channel as number, controller: controller as number }
    : { channel: channel as number, controller: controller as number, kind }
}

// Validates a parsed JSON file. Bindings for controls this version doesn't
// know about (e.g. a file from a newer version) or with out-of-range
// values are skipped and reported by name rather than failing the whole
// import; a file that isn't a MIDI export at all is rejected.
export function parseMidiExport(raw: unknown): MidiImportResult {
  if (!isRecord(raw) || raw.type !== 'mco-midi-mappings') {
    return { error: "This file isn't an MCO MIDI mappings export." }
  }
  if (raw.version !== 1) {
    return { error: `Unsupported MIDI mappings file version: ${String(raw.version)}.` }
  }
  if (!isRecord(raw.mappings)) {
    return { error: 'The file has no MIDI mappings in it.' }
  }
  const mappings: MidiMappings = {}
  const skipped: string[] = []
  for (const [key, value] of Object.entries(raw.mappings)) {
    const binding = KNOWN_KEYS.has(key) ? parseBinding(value) : null
    if (binding) mappings[key as MidiControlKey] = binding
    else skipped.push(key)
  }
  return { mappings, skipped }
}

// Reads a file's text into a MidiImportResult — invalid JSON becomes an
// error result rather than a thrown exception.
export function parseMidiExportText(text: string): MidiImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { error: "The file isn't valid JSON." }
  }
  return parseMidiExport(raw)
}
