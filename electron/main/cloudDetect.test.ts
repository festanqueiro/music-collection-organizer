import { describe, it, expect } from 'vitest'
import { isCloudOnly } from './cloudDetect'

describe('isCloudOnly', () => {
  it('returns false for a fully-allocated file', () => {
    // 100KB file, ~100KB allocated (196 blocks * 512 bytes ~= 100352)
    expect(isCloudOnly({ size: 100000, blocks: 196 })).toBe(false)
  })

  it('returns true for a placeholder file with near-zero allocation', () => {
    expect(isCloudOnly({ size: 5_000_000, blocks: 8 })).toBe(true)
  })

  it('returns false for an empty file', () => {
    expect(isCloudOnly({ size: 0, blocks: 0 })).toBe(false)
  })
})
