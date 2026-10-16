import { describe, it, expect } from 'vitest'
import { isAllUppercase, toTitleCase } from './titleCase'

describe('isAllUppercase', () => {
  it('flags several words in capitals', () => {
    expect(isAllUppercase('BOOZOO BAJOU')).toBe(true)
    expect(isAllUppercase('SAMBA (ORIGINAL MIX)')).toBe(true)
  })

  it('flags one long word', () => {
    expect(isAllUppercase('DESAFINADO')).toBe(true)
  })

  it('leaves short names that are capitals on purpose', () => {
    expect(isAllUppercase('ABBA')).toBe(false)
    expect(isAllUppercase('AC/DC')).toBe(false)
  })

  it('leaves mixed or lower case, and text without letters', () => {
    expect(isAllUppercase('Boozoo Bajou')).toBe(false)
    expect(isAllUppercase('DJ Shadow')).toBe(false)
    expect(isAllUppercase('1999')).toBe(false)
    expect(isAllUppercase('')).toBe(false)
  })
})

describe('toTitleCase', () => {
  it('capitalises each word', () => {
    expect(toTitleCase('BOOZOO BAJOU')).toBe('Boozoo Bajou')
    expect(toTitleCase('SAMBA (ORIGINAL MIX)')).toBe('Samba (Original Mix)')
  })

  it('handles apostrophes, hyphens and accents', () => {
    expect(toTitleCase("DON'T STOP")).toBe("Don't Stop")
    expect(toTitleCase('JAY-Z')).toBe('Jay-Z')
    expect(toTitleCase('ÁGUAS DE MARÇO')).toBe('Águas De Março')
  })

  it('keeps abbreviations in capitals and joining words in lower case', () => {
    expect(toTitleCase('DJ KOZE FEAT. ROISIN MURPHY')).toBe('DJ Koze feat. Roisin Murphy')
    expect(toTitleCase('ROCKY II VIP')).toBe('Rocky II VIP')
    expect(toTitleCase('X MARKS THE SPOT')).toBe('X Marks The Spot')
  })
})
