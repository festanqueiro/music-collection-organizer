import { describe, it, expect } from 'vitest'
import {
  parseKey,
  toCamelot,
  shortKeyName,
  formatKey,
  keySortValue,
  areKeysCompatible,
  areBpmsCompatible,
} from './harmonic'

describe('parseKey', () => {
  it('parses the analysis pipeline format', () => {
    expect(parseKey('A minor')).toEqual({ pitchClass: 9, mode: 'minor' })
    expect(parseKey('F# major')).toEqual({ pitchClass: 6, mode: 'major' })
    expect(parseKey('Bb minor')).toEqual({ pitchClass: 10, mode: 'minor' })
  })

  it('parses short forms', () => {
    expect(parseKey('Am')).toEqual({ pitchClass: 9, mode: 'minor' })
    expect(parseKey('C')).toEqual({ pitchClass: 0, mode: 'major' })
    expect(parseKey('Ebmaj')).toEqual({ pitchClass: 3, mode: 'major' })
  })

  it('returns null for junk', () => {
    expect(parseKey(null)).toBeNull()
    expect(parseKey('')).toBeNull()
    expect(parseKey('H minor')).toBeNull()
    expect(parseKey('8A')).toBeNull()
  })
})

describe('toCamelot', () => {
  it.each([
    ['A minor', '8A'],
    ['C major', '8B'],
    ['E minor', '9A'],
    ['G major', '9B'],
    ['G# minor', '1A'],
    ['Ab minor', '1A'],
    ['B major', '1B'],
    ['C# minor', '12A'],
    ['E major', '12B'],
    ['F minor', '4A'],
    ['Eb major', '5B'],
    ['F# major', '2B'],
  ])('%s is %s', (key, code) => {
    expect(toCamelot(key)?.code).toBe(code)
  })
})

describe('shortKeyName / formatKey', () => {
  it('uses conventional spellings', () => {
    expect(shortKeyName('A minor')).toBe('Am')
    expect(shortKeyName('A# minor')).toBe('Bbm')
    expect(shortKeyName('C# major')).toBe('Db')
  })

  it('formats per notation', () => {
    expect(formatKey('A minor', 'camelot')).toBe('8A')
    expect(formatKey('A minor', 'musical')).toBe('Am')
    expect(formatKey('A minor', 'both')).toBe('8A · Am')
    expect(formatKey(null, 'both')).toBeNull()
    expect(formatKey('weird', 'camelot')).toBe('weird')
  })
})

describe('keySortValue', () => {
  it('orders round the wheel, minor before major, unknown last', () => {
    const keys = ['C major', 'unknown', 'A minor', 'G# minor', 'E minor']
    const sorted = [...keys].sort((a, b) => keySortValue(a) - keySortValue(b))
    expect(sorted).toEqual(['G# minor', 'A minor', 'C major', 'E minor', 'unknown'])
  })
})

describe('areKeysCompatible', () => {
  it('accepts same key, ±1 on the wheel, and relative major/minor', () => {
    expect(areKeysCompatible('A minor', 'A minor')).toBe(true) // 8A-8A
    expect(areKeysCompatible('A minor', 'E minor')).toBe(true) // 8A-9A
    expect(areKeysCompatible('A minor', 'D minor')).toBe(true) // 8A-7A
    expect(areKeysCompatible('A minor', 'C major')).toBe(true) // 8A-8B
  })

  it('wraps 12 round to 1', () => {
    expect(areKeysCompatible('C# minor', 'G# minor')).toBe(true) // 12A-1A
  })

  it('rejects everything else', () => {
    expect(areKeysCompatible('A minor', 'B minor')).toBe(false) // 8A-10A
    expect(areKeysCompatible('A minor', 'G major')).toBe(false) // 8A-9B
    expect(areKeysCompatible('A minor', null)).toBe(false)
  })
})

describe('areBpmsCompatible', () => {
  it('accepts within 6%', () => {
    expect(areBpmsCompatible(124, 128)).toBe(true)
    expect(areBpmsCompatible(118, 128)).toBe(false)
  })

  it('accepts half and double time', () => {
    expect(areBpmsCompatible(70, 140)).toBe(true)
    expect(areBpmsCompatible(174, 87)).toBe(true)
  })

  it('rejects missing BPMs', () => {
    expect(areBpmsCompatible(null, 120)).toBe(false)
  })
})

// Mixed In Key's official Camelot wheel
// (mixedinkey.com/wp-content/uploads/2024/09/CamelotWheel-Official.webp),
// position by position, in the names the analysis stores.
const CAMELOT_WHEEL: Record<string, string> = {
  '1A': 'G# minor', '1B': 'B major',
  '2A': 'Eb minor', '2B': 'F# major',
  '3A': 'Bb minor', '3B': 'C# major',
  '4A': 'F minor', '4B': 'Ab major',
  '5A': 'C minor', '5B': 'Eb major',
  '6A': 'G minor', '6B': 'Bb major',
  '7A': 'D minor', '7B': 'F major',
  '8A': 'A minor', '8B': 'C major',
  '9A': 'E minor', '9B': 'G major',
  '10A': 'B minor', '10B': 'D major',
  '11A': 'F# minor', '11B': 'A major',
  '12A': 'C# minor', '12B': 'E major',
}

describe('the official Camelot wheel', () => {
  it('puts every key where Mixed In Key does', () => {
    for (const [code, key] of Object.entries(CAMELOT_WHEEL)) expect(toCamelot(key)?.code, key).toBe(code)
  })

  it('also places the flat/sharp spellings on the wheel (Db minor is 12A, Gb major is 2B)', () => {
    expect(toCamelot('Db minor')?.code).toBe('12A')
    expect(toCamelot('Ab minor')?.code).toBe('1A')
    expect(toCamelot('Gb major')?.code).toBe('2B')
    expect(toCamelot('Db major')?.code).toBe('3B')
  })

  it('treats exactly the wheel neighbours as compatible: same, ±1 round the wheel, or the inner/outer ring', () => {
    const codes = Object.keys(CAMELOT_WHEEL)
    for (const from of codes) {
      const number = Number(from.slice(0, -1))
      const letter = from.slice(-1)
      const around = (n: number) => ((n + 11) % 12) + 1 // 1..12, wrapping
      const expected = new Set([
        from,
        `${around(number - 1)}${letter}`,
        `${around(number + 1)}${letter}`,
        `${number}${letter === 'A' ? 'B' : 'A'}`,
      ])
      const compatible = codes.filter((to) => areKeysCompatible(CAMELOT_WHEEL[from], CAMELOT_WHEEL[to]))
      expect(new Set(compatible), from).toEqual(expected)
    }
  })
})
