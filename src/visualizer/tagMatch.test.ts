import { describe, it, expect } from 'vitest'
import { trackTagNames, hasTagWord } from './tagMatch'
import type { TrackTagIds } from '../state/tagFilter'

describe('trackTagNames', () => {
  const genres = [
    { id: 1, name: 'Reggae', color: null },
    { id: 2, name: 'Techno', color: null },
  ]
  const subgenres = [
    { id: 10, name: 'Roots Dub', genreId: 1 },
    { id: 11, name: 'Minimal', genreId: 2 },
  ]
  const trackTags = new Map<number, TrackTagIds>([[5, { trackId: 5, genreIds: [1], subgenreIds: [10, 99] }]])

  it('resolves tag and subtag ids to names, dropping unknown ids', () => {
    expect(trackTagNames(5, trackTags, genres, subgenres)).toEqual(['Reggae', 'Roots Dub'])
  })

  it('is empty for an untagged track', () => {
    expect(trackTagNames(6, trackTags, genres, subgenres)).toEqual([])
  })
})

describe('hasTagWord', () => {
  it('matches the word anywhere in a name, case-insensitively', () => {
    expect(hasTagWord(['Dub'], 'dub')).toBe(true)
    expect(hasTagWord(['Reggae', 'roots dub'], 'dub')).toBe(true)
    expect(hasTagWord(['DUB TECHNO'], 'dub')).toBe(true)
  })

  it('does not match the word inside another word', () => {
    expect(hasTagWord(['Dubstep'], 'dub')).toBe(false)
    expect(hasTagWord([], 'dub')).toBe(false)
  })
})
