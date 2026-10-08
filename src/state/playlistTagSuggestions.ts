// Tags and Subtags to suggest for a track from the names of the playlists
// it's in (docs/features/tags.md): a track in "2022-08-HOSPICE-DUBTECHNO-120"
// probably wants the "Dub Techno" Tag. Only names the user already has as
// a Tag or Subtag are suggested — nothing is made up from a playlist's
// name — and nothing is applied until asked.
import type { Genre, Subgenre } from '../types'

export interface PlaylistTagSuggestion {
  kind: 'tag' | 'subtag'
  id: number
  name: string
  // A Subtag's Tag, and whether adding the Subtag adds it too.
  parent?: { id: number; name: string; missing: boolean }
  // The playlists whose name has it.
  playlists: string[]
}

// Lower case, without accents, cut at anything that isn't a letter or a digit.
const words = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

// Whole words only, in a row, however they're joined: "UK Garage" is in
// "2023-UK-GARAGE" and in "ukgarage set", "Dub" isn't in "Dubstep".
function nameHas(playlistWords: string[], tag: string): boolean {
  if (tag.length < 2) return false
  for (let i = 0; i < playlistWords.length; i++) {
    let run = ''
    for (let j = i; j < playlistWords.length && run.length < tag.length; j++) {
      run += playlistWords[j]
      if (run === tag) return true
    }
  }
  return false
}

export function suggestTagsFromPlaylists(
  playlistNames: string[],
  genres: Genre[],
  subgenres: Subgenre[],
  current: { genreIds: number[]; subgenreIds: number[] }
): PlaylistTagSuggestion[] {
  if (playlistNames.length === 0) return []
  const playlists = playlistNames.map((name) => ({ name, words: words(name) }))
  const from = (name: string) => {
    const tag = words(name).join('')
    return playlists.filter((p) => nameHas(p.words, tag)).map((p) => p.name)
  }
  const out: PlaylistTagSuggestion[] = []
  const matchedGenres = new Set<number>()
  for (const genre of genres) {
    const found = from(genre.name)
    if (found.length === 0) continue
    matchedGenres.add(genre.id)
    if (!current.genreIds.includes(genre.id)) out.push({ kind: 'tag', id: genre.id, name: genre.name, playlists: found })
  }
  const genreById = new Map(genres.map((g) => [g.id, g]))
  const sameName = new Map<string, number>()
  for (const s of subgenres) sameName.set(words(s.name).join(''), (sameName.get(words(s.name).join('')) ?? 0) + 1)
  for (const subgenre of subgenres) {
    if (current.subgenreIds.includes(subgenre.id)) continue
    const genre = genreById.get(subgenre.genreId)
    if (!genre) continue
    const onTrack = current.genreIds.includes(genre.id)
    // "Deep" under two Tags: only the one whose Tag the track has, or the
    // playlists also name.
    if (!onTrack && !matchedGenres.has(genre.id) && sameName.get(words(subgenre.name).join('')) !== 1) continue
    const found = from(subgenre.name)
    if (found.length === 0) continue
    out.push({ kind: 'subtag', id: subgenre.id, name: subgenre.name, parent: { id: genre.id, name: genre.name, missing: !onTrack }, playlists: found })
  }
  return out
}
