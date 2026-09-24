import type { Track } from '../types'

// Finds likely duplicate tracks — the same recording saved twice, e.g. as
// WAV and MP3, or two downloads with different filenames. Two tracks are
// linked when their durations are within DURATION_TOLERANCE_S (or either
// is unknown) AND either:
//   - their normalized title + artist match, or
//   - their normalized filenames match (leading track numbers and the
//     extension ignored).
// Links are transitive (union-find), so A~B and B~C put all three in one
// group. Version suffixes like "(Dub Mix)" are deliberately kept in the
// comparison: different mixes are different tracks.

export const DURATION_TOLERANCE_S = 1

export function normalizeText(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// "03 - King Tubby - Dub Fi Gwan.mp3" → "king tubby dub fi gwan"
export function normalizeFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, '')
  return normalizeText(stem.replace(/^\s*\d{1,3}\s*[-_.)]?\s+/, ''))
}

function durationsMatch(a: Track, b: Track): boolean {
  if (a.duration == null || b.duration == null) return true
  return Math.abs(a.duration - b.duration) <= DURATION_TOLERANCE_S
}

export function findDuplicateGroups(tracks: Track[]): Track[][] {
  const parent = tracks.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  // Bucket by each key, then only compare durations within a bucket —
  // keeps this near-linear on a large collection.
  const buckets = new Map<string, number[]>()
  const addToBucket = (key: string, index: number) => {
    const list = buckets.get(key)
    if (list) list.push(index)
    else buckets.set(key, [index])
  }
  tracks.forEach((track, index) => {
    const title = normalizeText(track.title)
    if (title) addToBucket(`t:${title}|${normalizeText(track.artist)}`, index)
    const file = normalizeFilename(track.filename)
    if (file) addToBucket(`f:${file}`, index)
  })

  for (const indexes of buckets.values()) {
    if (indexes.length < 2) continue
    for (let i = 0; i < indexes.length; i++) {
      for (let j = i + 1; j < indexes.length; j++) {
        if (durationsMatch(tracks[indexes[i]], tracks[indexes[j]])) union(indexes[i], indexes[j])
      }
    }
  }

  const groups = new Map<number, Track[]>()
  tracks.forEach((track, index) => {
    const root = find(index)
    const group = groups.get(root)
    if (group) group.push(track)
    else groups.set(root, [track])
  })

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => [...group].sort((a, b) => b.size - a.size)) // biggest (usually best quality) first
    .sort((a, b) => displayName(a[0]).localeCompare(displayName(b[0])))
}

export function displayName(track: Track): string {
  const title = track.title ?? track.filename.replace(/\.[^.]+$/, '')
  return track.artist ? `${track.artist} — ${title}` : title
}
