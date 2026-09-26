import { describe, it, expect } from 'vitest'
import { isMissingId3Metadata, matchesMcoTagsFilter } from './trackFilters'

describe('isMissingId3Metadata', () => {
  it('is true when the file has no artist or no title', () => {
    expect(isMissingId3Metadata({ tagsRead: true, artist: null, title: 'Song' })).toBe(true)
    expect(isMissingId3Metadata({ tagsRead: true, artist: 'Artist', title: '  ' })).toBe(true)
  })

  it('is false when both are there, or the tags haven’t been read yet', () => {
    expect(isMissingId3Metadata({ tagsRead: true, artist: 'Artist', title: 'Song' })).toBe(false)
    expect(isMissingId3Metadata({ tagsRead: false, artist: null, title: null })).toBe(false)
  })
})

describe('matchesMcoTagsFilter', () => {
  const none = undefined
  const tagOnly = { trackId: 1, genreIds: [1], subgenreIds: [] }
  const both = { trackId: 1, genreIds: [1], subgenreIds: [2] }

  it('No Tags: only tracks with no Tags at all', () => {
    expect([none, tagOnly, both].map((t) => matchesMcoTagsFilter(t, 'no-tags'))).toEqual([true, false, false])
  })

  it('No Subtags: tracks without a Subtag, with or without Tags', () => {
    expect([none, tagOnly, both].map((t) => matchesMcoTagsFilter(t, 'no-subtags'))).toEqual([true, true, false])
  })

  it('All lets everything through', () => {
    expect(matchesMcoTagsFilter(both, 'all')).toBe(true)
  })
})
