// Tracks by id, for the places that look many of them up at once (the
// queue's rows, a menu over checked rows): `tracks.find` there is a scan of
// the whole collection per lookup. One map per track list — the store
// replaces the array when the list changes, so the array is the cache key
// and every component asking shares the same map.
import type { Track } from '../types'

const cache = new WeakMap<readonly Track[], Map<number, Track>>()

export function tracksById(tracks: readonly Track[]): Map<number, Track> {
  let map = cache.get(tracks)
  if (!map) {
    map = new Map(tracks.map((t) => [t.id, t]))
    cache.set(tracks, map)
  }
  return map
}
