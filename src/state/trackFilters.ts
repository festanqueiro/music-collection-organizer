import type { Track } from '../types'
import type { TrackTagIds } from './tagFilter'
import type { McoTagsFilter } from './store'

// Rules for the sidebar's Filters view that aren't one-liners.

// The "Missing ID3 Metadata" filter: the file's own tags have been read and
// it has no artist or no title — only the filename to go by. Before its
// tags are read, a missing artist or title just means not known yet.
export function isMissingId3Metadata(track: Pick<Track, 'tagsRead' | 'artist' | 'title'>): boolean {
  return track.tagsRead && (!track.artist?.trim() || !track.title?.trim())
}

// The Energy filter: a 1–10 range, both ends included. Tracks without an
// energy rating yet (not analysed) don't match while it's on.
export type EnergyRange = [number, number]
export function matchesEnergy(energy: number | null, range: EnergyRange | null): boolean {
  if (!range) return true
  return energy !== null && energy >= range[0] && energy <= range[1]
}

// The "MCO tags" filter: no Tags at all (so no Subtags either), or no
// Subtag whether or not the track has Tags.
export function matchesMcoTagsFilter(tags: TrackTagIds | undefined, filter: McoTagsFilter): boolean {
  if (filter === 'all') return true
  return filter === 'no-tags' ? !tags?.genreIds.length : !tags?.subgenreIds.length
}

// Probably at half time (the Slow BPM filter): analysed slower than the
// slowest tempo the user mixes at. Not one whose BPM they set themselves —
// that one is as they want it.
export function isSlowBpm(track: { bpm: number | null; bpmEdited?: boolean }, slowestBpm: number): boolean {
  return slowestBpm > 0 && !!track.bpm && track.bpm < slowestBpm && !track.bpmEdited
}

