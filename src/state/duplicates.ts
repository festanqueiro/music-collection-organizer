// Duplicate detection for the Duplicates filter: tracks that are the same
// song, whatever folder or format they're in. Two tracks match when their
// artist + title match (from the file's tags), or — for a track missing
// either — their filenames match, ignoring case, punctuation, spacing and
// the extension.
import type { Track } from '../types'

function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

// The key two copies of the same song share, or null if there's nothing to
// compare by.
export function duplicateKey(track: Pick<Track, 'title' | 'artist' | 'filename'>): string | null {
  if (track.title && track.artist) {
    const key = `${normalise(track.artist)}|${normalise(track.title)}`
    if (key !== '|') return `tags:${key}`
  }
  const name = normalise(track.filename.replace(/\.[^.]+$/, ''))
  return name ? `file:${name}` : null
}

// Track id -> its duplicate group's key, for every track that has at
// least one duplicate.
export function findDuplicates(tracks: Pick<Track, 'id' | 'title' | 'artist' | 'filename'>[]): Map<number, string> {
  const groups = new Map<string, number[]>()
  for (const track of tracks) {
    const key = duplicateKey(track)
    if (!key) continue
    const group = groups.get(key)
    if (group) group.push(track.id)
    else groups.set(key, [track.id])
  }
  const result = new Map<number, string>()
  for (const [key, ids] of groups) {
    if (ids.length > 1) for (const id of ids) result.set(id, key)
  }
  return result
}
