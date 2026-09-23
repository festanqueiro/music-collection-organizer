import type { Genre, Subgenre } from '../types'
import type { TrackTagIds } from '../state/tagFilter'

// Names of every tag and subtag on a track, for themes gated on a tag
// (see VisualizerTheme.isAvailable).
export function trackTagNames(
  trackId: number,
  trackTags: Map<number, TrackTagIds>,
  genres: Genre[],
  subgenres: Subgenre[],
): string[] {
  const tags = trackTags.get(trackId)
  if (!tags) return []
  const genreNames = tags.genreIds.map((id) => genres.find((g) => g.id === id)?.name)
  const subgenreNames = tags.subgenreIds.map((id) => subgenres.find((s) => s.id === id)?.name)
  return [...genreNames, ...subgenreNames].filter((name): name is string => !!name)
}

// Whole-word, case-insensitive: "Dub", "Roots Dub", "dub techno" match
// "dub"; "Dubstep" doesn't.
export function hasTagWord(tagNames: string[], word: string): boolean {
  const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  return tagNames.some((name) => pattern.test(name))
}
