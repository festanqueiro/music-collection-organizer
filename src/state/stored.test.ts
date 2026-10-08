import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readStored, readStoredFlag, writeStored } from './stored'

describe('stored', () => {
  afterEach(() => vi.unstubAllGlobals())

  describe('with storage', () => {
    beforeEach(() => {
      const data = new Map<string, string>()
      vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) })
    })

    it('reads back what was written', () => {
      writeStored('view', 'tags')
      expect(readStored('view')).toBe('tags')
      expect(readStored('nothing')).toBeNull()
    })

    it("reads a switch, with the fallback for anything that isn't one", () => {
      expect(readStoredFlag('grid', true)).toBe(true)
      expect(readStoredFlag('large', false)).toBe(false)
      writeStored('grid', 'false')
      expect(readStoredFlag('grid', true)).toBe(false)
      writeStored('large', 'true')
      expect(readStoredFlag('large', false)).toBe(true)
      writeStored('grid', 'yes')
      expect(readStoredFlag('grid', true)).toBe(true)
    })
  })

  it('is quiet when storage throws or is missing', () => {
    expect(readStored('view')).toBeNull()
    expect(() => writeStored('view', 'tags')).not.toThrow()
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readStoredFlag('grid', true)).toBe(true)
    expect(() => writeStored('view', 'tags')).not.toThrow()
  })
})
