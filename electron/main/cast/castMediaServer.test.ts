import { describe, it, expect } from 'vitest'
import { parseMediaPath } from './castMediaServer'

describe('parseMediaPath', () => {
  const token = 'abc123'

  it('accepts a track or artwork path for this session', () => {
    expect(parseMediaPath('/abc123/track/42', token)).toEqual({ kind: 'track', trackId: 42 })
    expect(parseMediaPath('/abc123/art/7', token)).toEqual({ kind: 'art', trackId: 7 })
  })

  it('rejects another session’s token, unknown kinds and non-numeric ids', () => {
    expect(parseMediaPath('/other/track/42', token)).toBeNull()
    expect(parseMediaPath('/abc123/file/42', token)).toBeNull()
    expect(parseMediaPath('/abc123/track/..%2F..%2Fetc', token)).toBeNull()
    expect(parseMediaPath('/abc123/track/4.2', token)).toBeNull()
    expect(parseMediaPath('/abc123/track/42/extra', token)).toBeNull()
  })
})
