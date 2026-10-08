import { describe, it, expect } from 'vitest'
import { suggestTagsFromPlaylists } from './playlistTagSuggestions'

const genres = [
  { id: 1, name: 'Dub', color: null },
  { id: 2, name: 'Dubstep', color: null },
  { id: 3, name: 'UK Garage', color: null },
  { id: 4, name: 'Dub Techno', color: null },
  { id: 5, name: 'House', color: null },
  { id: 6, name: 'Café', color: null },
]
const subgenres = [
  { id: 10, name: 'Steppers', genreId: 1, color: null },
  { id: 11, name: 'Deep', genreId: 2, color: null },
  { id: 12, name: 'Deep', genreId: 5, color: null },
  { id: 13, name: '140 Dub', genreId: 2, color: null },
]
const none: { genreIds: number[]; subgenreIds: number[] } = { genreIds: [], subgenreIds: [] }
const names = (playlists: string[], current = none) =>
  suggestTagsFromPlaylists(playlists, genres, subgenres, current).map((s) => (s.parent ? `${s.parent.name} > ${s.name}` : s.name))

describe('suggestTagsFromPlaylists', () => {
  it('suggests nothing for a track in no playlist, or when no name has a tag', () => {
    expect(names([])).toEqual([])
    expect(names(['Sunday Session', 'Warm up'])).toEqual([])
  })

  it('finds a Tag written as a word of the name, whatever the case, accents or separators', () => {
    expect(names(['2023-03-WEDDING-UK-GARAGE----selected'])).toEqual(['UK Garage'])
    expect(names(['2022-08-HOSPICE-DUBTECHNO-120'])).toEqual(['Dub Techno'])
    expect(names(['cafe del mar'])).toEqual(['Café'])
  })

  it('wants whole words: Dub is not in Dubstep, nor House in Warehouse', () => {
    expect(names(['Dubstep classics'])).toEqual(['Dubstep'])
    expect(names(['Warehouse set'])).toEqual([])
    expect(names(['Dub classics'])).toEqual(['Dub'])
  })

  it('leaves out what the track already has', () => {
    expect(names(['Dubstep classics', 'Dub steppers'], { genreIds: [2], subgenreIds: [] })).toEqual(['Dub', 'Dub > Steppers'])
    expect(names(['Dub steppers'], { genreIds: [1], subgenreIds: [10] })).toEqual([])
  })

  it('suggests a Subtag with its Tag, saying whether the Tag comes with it', () => {
    const [steppers] = suggestTagsFromPlaylists(['Steppers night'], genres, subgenres, none)
    expect(steppers).toMatchObject({ kind: 'subtag', id: 10, parent: { id: 1, name: 'Dub', missing: true }, playlists: ['Steppers night'] })
    const [again] = suggestTagsFromPlaylists(['Steppers night'], genres, subgenres, { genreIds: [1], subgenreIds: [] })
    expect(again.parent?.missing).toBe(false)
  })

  it('picks between Subtags of the same name by the Tag the track has or the playlists name', () => {
    expect(names(['Deep cuts'])).toEqual([])
    expect(names(['Deep cuts'], { genreIds: [5], subgenreIds: [] })).toEqual(['House > Deep'])
    expect(names(['Deep dubstep'])).toEqual(['Dubstep', 'Dubstep > Deep'])
  })

  it('lists every playlist a suggestion comes from', () => {
    const [dub] = suggestTagsFromPlaylists(['Dub one', 'Other', 'DUB-two'], genres, subgenres, none)
    expect(dub.playlists).toEqual(['Dub one', 'DUB-two'])
  })

  it('matches a name with a number in it', () => {
    expect(names(['2024 140-dub selects'])).toEqual(['Dub', 'Dubstep > 140 Dub'])
  })
})
