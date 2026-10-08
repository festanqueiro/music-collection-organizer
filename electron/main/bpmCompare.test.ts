import { describe, it, expect } from 'vitest'
import { bpmVerdict, compareBpms } from './bpmCompare'

describe('bpmVerdict', () => {
  it('names how MCO relates to Rekordbox', () => {
    expect(bpmVerdict(140, 140.04)).toBe('same')
    expect(bpmVerdict(139.6, 140)).toBe('close')
    expect(bpmVerdict(106.58, 160)).toBe('two-thirds')
    expect(bpmVerdict(85, 170)).toBe('half')
    expect(bpmVerdict(140, 70)).toBe('double')
    expect(bpmVerdict(210, 140)).toBe('three-halves')
    expect(bpmVerdict(128, 140)).toBe('other')
  })
})

describe('compareBpms', () => {
  it('compares the songs both have a tempo for, by path', () => {
    const result = compareBpms(
      [
        { path: '/m/A.wav', bpm: 106.58 },
        { path: '/m/b.wav', bpm: 140 },
        { path: '/m/café.wav', bpm: 85 },
        { path: '/m/none.wav', bpm: null },
        { path: '/m/mine.wav', bpm: 120 },
      ],
      [
        { path: '/m/a.wav', bpm: 160 },
        { path: '/m/b.wav', bpm: 140 },
        { path: '/m/café.wav', bpm: 170 },
        { path: '/m/none.wav', bpm: 128 },
        { path: '/m/theirs.wav', bpm: 100 },
        { path: '/m/unanalysed.wav', bpm: null },
      ]
    )
    expect(result.compared.map((c) => c.verdict)).toEqual(['two-thirds', 'same', 'half'])
    expect(result.counts).toMatchObject({ same: 1, 'two-thirds': 1, half: 1, other: 0 })
    expect(result.onlyMco).toBe(1)
    expect(result.onlyRekordbox).toBe(2)
  })
})
