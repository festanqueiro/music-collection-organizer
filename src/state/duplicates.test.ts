import { describe, it, expect } from 'vitest'
import { duplicateKey, findDuplicates } from './duplicates'

const t = (id: number, filename: string, title: string | null = null, artist: string | null = null) => ({ id, filename, title, artist })

describe('duplicateKey', () => {
  it('matches by artist + title, ignoring case, accents and punctuation', () => {
    expect(duplicateKey(t(1, 'a.aiff', 'Café Del Mar', 'Energy 52'))).toBe(
      duplicateKey(t(2, 'b.wav', 'cafe del mar', 'ENERGY-52'))
    )
  })

  it('falls back to the filename without its extension', () => {
    expect(duplicateKey(t(1, 'Some Track.aiff'))).toBe(duplicateKey(t(2, 'some_track.mp3')))
  })
})

describe('findDuplicates', () => {
  it('returns only tracks that have a match', () => {
    const dupes = findDuplicates([
      t(1, 'x.aiff', 'Song', 'Artist'),
      t(2, 'y.wav', 'Song', 'Artist'),
      t(3, 'z.wav', 'Other', 'Artist'),
    ])
    expect([...dupes.keys()].sort()).toEqual([1, 2])
    expect(dupes.get(1)).toBe(dupes.get(2))
  })
})
