// src/state/tagFilter.test.ts
import { describe, it, expect } from 'vitest'
import { matchesTagFilter, type TagFilterState, type TrackTagIds } from './tagFilter'

const HOUSE = 1
const DEEP_HOUSE = 10
const TECHNO = 2

const subgenreIdsByGenreId = new Map([[HOUSE, [DEEP_HOUSE]]])

function track(overrides: Partial<TrackTagIds>): TrackTagIds {
  return { trackId: 1, genreIds: [], subgenreIds: [], ...overrides }
}

function emptyFilter(): TagFilterState {
  return { genreIds: new Set(), subgenreIds: new Set() }
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

  it('AND-mode requires every selected genre to be present', () => {
    const filter = { ...emptyFilter(), genreIds: new Set([HOUSE, TECHNO]) }
    expect(
      matchesTagFilter(track({ genreIds: [HOUSE, TECHNO] }), filter, subgenreIdsByGenreId, 'AND')
    ).toBe(true)
    expect(matchesTagFilter(track({ genreIds: [HOUSE] }), filter, subgenreIdsByGenreId, 'AND')).toBe(false)
  })

  it('AND-mode still counts a subgenre toward its parent genre', () => {
    const filter = { ...emptyFilter(), genreIds: new Set([HOUSE, TECHNO]) }
    expect(
      matchesTagFilter(track({ subgenreIds: [DEEP_HOUSE], genreIds: [TECHNO] }), filter, subgenreIdsByGenreId, 'AND')
    ).toBe(true)
  })

  it('AND-mode combines genre and subgenre selections', () => {
    const filter = { genreIds: new Set([TECHNO]), subgenreIds: new Set([DEEP_HOUSE]) }
    expect(
      matchesTagFilter(track({ genreIds: [TECHNO], subgenreIds: [DEEP_HOUSE] }), filter, subgenreIdsByGenreId, 'AND')
    ).toBe(true)
    expect(
      matchesTagFilter(track({ genreIds: [TECHNO] }), filter, subgenreIdsByGenreId, 'AND')
    ).toBe(false)
  })
})
