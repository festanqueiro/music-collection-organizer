// src/state/tagFilter.test.ts
import { describe, it, expect } from 'vitest'
import { matchesTagFilter, type TagFilterState, type TrackTagIds } from './tagFilter'

const HOUSE = 1
const DEEP_HOUSE = 10
const TECHNO = 2
const ENERGETIC = 100

const subgenreIdsByGenreId = new Map([[HOUSE, [DEEP_HOUSE]]])

function track(overrides: Partial<TrackTagIds>): TrackTagIds {
  return { trackId: 1, genreIds: [], subgenreIds: [], moodIds: [], ...overrides }
}

function emptyFilter(): TagFilterState {
  return { genreIds: new Set(), subgenreIds: new Set(), moodIds: new Set() }
}

describe('matchesTagFilter', () => {
  it('matches everything when no filter is active', () => {
    expect(matchesTagFilter(track({}), emptyFilter(), subgenreIdsByGenreId)).toBe(true)
  })

  it('matches a track tagged with the selected genre', () => {
    const filter = { ...emptyFilter(), genreIds: new Set([HOUSE]) }
    expect(matchesTagFilter(track({ genreIds: [HOUSE] }), filter, subgenreIdsByGenreId)).toBe(true)
  })

  it('a genre selection also matches tracks tagged with its subgenres', () => {
    const filter = { ...emptyFilter(), genreIds: new Set([HOUSE]) }
    expect(matchesTagFilter(track({ subgenreIds: [DEEP_HOUSE] }), filter, subgenreIdsByGenreId)).toBe(true)
  })

  it('OR-combines multiple genre selections', () => {
    const filter = { ...emptyFilter(), genreIds: new Set([HOUSE, TECHNO]) }
    expect(matchesTagFilter(track({ genreIds: [TECHNO] }), filter, subgenreIdsByGenreId)).toBe(true)
  })

  it('excludes a track matching neither selected genre', () => {
    const filter = { ...emptyFilter(), genreIds: new Set([HOUSE]) }
    expect(matchesTagFilter(track({ genreIds: [TECHNO] }), filter, subgenreIdsByGenreId)).toBe(false)
  })

  it('AND-combines genre branch and mood branch', () => {
    const filter = { genreIds: new Set([HOUSE]), subgenreIds: new Set<number>(), moodIds: new Set([ENERGETIC]) }
    expect(matchesTagFilter(track({ genreIds: [HOUSE], moodIds: [] }), filter, subgenreIdsByGenreId)).toBe(false)
    expect(matchesTagFilter(track({ genreIds: [HOUSE], moodIds: [ENERGETIC] }), filter, subgenreIdsByGenreId)).toBe(
      true
    )
  })
})
