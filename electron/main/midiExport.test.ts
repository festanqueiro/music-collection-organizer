import { describe, it, expect } from 'vitest'
import { buildMidiExport, parseMidiExport, parseMidiExportText } from './midiExport'
import type { MidiMappings } from '../../src/types'

const mappings: MidiMappings = {
  volume: { channel: 0, controller: 21, kind: 'cc' },
  'player.playPause': { channel: 9, controller: 36, kind: 'note' },
  'delay.mix': { channel: 1, controller: 7 },
}

describe('buildMidiExport', () => {
  it('wraps mappings with type, version and timestamp', () => {
    const data = buildMidiExport(mappings, new Date('2026-09-23T10:00:00Z'))
    expect(data).toEqual({
      type: 'mco-midi-mappings',
      version: 1,
      exportedAt: '2026-09-23T10:00:00.000Z',
      mappings,
    })
  })
})

describe('parseMidiExport', () => {
  it('round-trips an export', () => {
    const text = JSON.stringify(buildMidiExport(mappings))
    expect(parseMidiExportText(text)).toEqual({ mappings, skipped: [] })
  })

  it('skips unknown controls and invalid bindings, keeping the rest', () => {
    const result = parseMidiExport({
      type: 'mco-midi-mappings',
      version: 1,
      mappings: {
        volume: { channel: 0, controller: 21, kind: 'cc' },
        'future.control': { channel: 0, controller: 1 },
        'delay.mix': { channel: 16, controller: 7 },
        'reverb.mix': { channel: 0, controller: 128 },
        'eq.low': { channel: 0, controller: 5, kind: 'pitchbend' },
        'eq.mid': 'nope',
      },
    })
    expect(result).toEqual({
      mappings: { volume: { channel: 0, controller: 21, kind: 'cc' } },
      skipped: ['future.control', 'delay.mix', 'reverb.mix', 'eq.low', 'eq.mid'],
    })
  })

  it('rejects files that are not MIDI exports', () => {
    expect(parseMidiExport({ version: 1, genres: [] })).toHaveProperty('error')
    expect(parseMidiExport([])).toHaveProperty('error')
    expect(parseMidiExport(null)).toHaveProperty('error')
  })

  it('rejects unsupported versions and missing mappings', () => {
    expect(parseMidiExport({ type: 'mco-midi-mappings', version: 2, mappings: {} })).toHaveProperty('error')
    expect(parseMidiExport({ type: 'mco-midi-mappings', version: 1 })).toHaveProperty('error')
  })

  it('reports invalid JSON as an error instead of throwing', () => {
    expect(parseMidiExportText('{ not json')).toEqual({ error: "The file isn't valid JSON." })
  })
})
