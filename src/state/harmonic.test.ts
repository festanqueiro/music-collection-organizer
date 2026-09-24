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
