import { describe, it, expect } from 'vitest'
import { foldText } from './text'

describe('foldText', () => {
  it('drops case and accents, composed or not', () => {
    expect(foldText('Café')).toBe('cafe')
    expect(foldText('CAFE\u0301')).toBe('cafe')
    expect(foldText('Živ – Ñandú')).toBe('ziv – nandu')
  })

  it('leaves everything else as it is', () => {
    expect(foldText('2026-UK-GARAGE (140)')).toBe('2026-uk-garage (140)')
    expect(foldText('')).toBe('')
  })
})
