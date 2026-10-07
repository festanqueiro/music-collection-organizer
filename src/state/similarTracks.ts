// Similar tracks for the detail panel (docs/features/dj-tools.md): tracks
// that mix harmonically with the selected one, or share its Tags/Subtags.
// One pass over the collection, no index kept.
import type { Track } from '../types'
import type { TrackTagIds } from './tagFilter'
import { areBpmsCompatible, toCamelot } from './harmonic'

type SimilarSource = Pick<Track, 'id' | 'musicalKey' | 'bpm' | 'title' | 'filename'>

export interface SimilarTrack<T extends SimilarSource = Track> {
  track: T
  score: number
  // 'same' key, or a 'compatible' one (a step round the wheel, or the
  // relative major/minor); null when the key doesn't count.
  key: 'same' | 'compatible' | null
  bpmMixes: boolean
  sharedGenreIds: number[]
  sharedSubgenreIds: number[]
}

export interface SimilarOptions {
  // Which likenesses count; a track needs at least one of them.
  byKey: boolean
  byTags: boolean
}

// A shared Subtag says more than a shared Tag; the same key more than a
// neighbouring one. A matching tempo only breaks ties between those.
const SUBTAG_POINTS = 3
const TAG_POINTS = 2
const SAME_KEY_POINTS = 3
const COMPATIBLE_KEY_POINTS = 2
const BPM_POINTS = 1

// How far apart two tempos are, half/double time counting as the same.
function bpmDistance(a: number | null, b: number | null): number {
  if (!a || !b) return Infinity
  return Math.min(...[b, b * 2, b / 2].map((target) => Math.abs(a - target) / target))
}

// The most similar first; ties go to the closer tempo, then the title.
export function findSimilarTracks<T extends SimilarSource>(
  track: SimilarSource,
  tracks: T[],
  trackTags: Map<number, TrackTagIds>,
  options: SimilarOptions = { byKey: true, byTags: true }
): SimilarTrack<T>[] {
  const key = options.byKey ? toCamelot(track.musicalKey) : null
  const tags = options.byTags ? trackTags.get(track.id) : undefined
  const genreIds = new Set(tags?.genreIds)
  const subgenreIds = new Set(tags?.subgenreIds)
  const useTags = genreIds.size > 0 || subgenreIds.size > 0
  if (!key && !useTags) return []

  const out: SimilarTrack<T>[] = []
  for (const other of tracks) {
    if (other.id === track.id) continue
    let keyMatch: SimilarTrack['key'] = null
    if (key) {
      const otherKey = toCamelot(other.musicalKey)
      if (otherKey) {
        const diff = Math.abs(otherKey.number - key.number)
        if (otherKey.number === key.number) keyMatch = otherKey.letter === key.letter ? 'same' : 'compatible'
        else if (otherKey.letter === key.letter && (diff === 1 || diff === 11)) keyMatch = 'compatible'
      }
    }
    const otherTags = useTags ? trackTags.get(other.id) : undefined
    const sharedGenreIds = otherTags ? otherTags.genreIds.filter((id) => genreIds.has(id)) : []
    const sharedSubgenreIds = otherTags ? otherTags.subgenreIds.filter((id) => subgenreIds.has(id)) : []
    if (!keyMatch && sharedGenreIds.length === 0 && sharedSubgenreIds.length === 0) continue
    const bpmMixes = areBpmsCompatible(other.bpm, track.bpm)
    out.push({
      track: other,
      key: keyMatch,
      bpmMixes,
      sharedGenreIds,
      sharedSubgenreIds,
      score:
        sharedSubgenreIds.length * SUBTAG_POINTS +
        sharedGenreIds.length * TAG_POINTS +
        (keyMatch === 'same' ? SAME_KEY_POINTS : keyMatch ? COMPATIBLE_KEY_POINTS : 0) +
        (bpmMixes ? BPM_POINTS : 0),
    })
  }
  const name = (t: SimilarSource) => (t.title ?? t.filename).toLowerCase()
  return out.sort(
    (a, b) =>
      b.score - a.score ||
      bpmDistance(a.track.bpm, track.bpm) - bpmDistance(b.track.bpm, track.bpm) ||
      (name(a.track) < name(b.track) ? -1 : name(a.track) > name(b.track) ? 1 : 0)
  )
}
