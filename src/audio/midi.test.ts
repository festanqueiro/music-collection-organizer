import { describe, it, expect } from 'vitest'
import { scaleMidiValueToOption } from './midi'

describe('scaleMidiValueToOption', () => {
  const options = ['off', 'slow', 'medium', 'fast'] as const

  it('CC 0 maps to the first option', () => {
    expect(scaleMidiValueToOption(options, 0)).toBe('off')
  })

  it('CC 127 maps to the last option (the top-band guard)', () => {
    expect(scaleMidiValueToOption(options, 127)).toBe('fast')
  })

  it('quantizes into even bands for a 4-option list', () => {
    // 128 values / 4 options = 32 per band: [0-31]=off [32-63]=slow [64-95]=medium [96-127]=fast
    expect(scaleMidiValueToOption(options, 31)).toBe('off')
    expect(scaleMidiValueToOption(options, 32)).toBe('slow')
    expect(scaleMidiValueToOption(options, 63)).toBe('slow')
    expect(scaleMidiValueToOption(options, 64)).toBe('medium')
    expect(scaleMidiValueToOption(options, 95)).toBe('medium')
    expect(scaleMidiValueToOption(options, 96)).toBe('fast')
  })
})
