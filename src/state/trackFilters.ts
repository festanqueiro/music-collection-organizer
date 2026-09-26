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

// The "MCO tags" filter: no Tags at all (so no Subtags either), or no
// Subtag whether or not the track has Tags.
export function matchesMcoTagsFilter(tags: TrackTagIds | undefined, filter: McoTagsFilter): boolean {
  if (filter === 'all') return true
  return filter === 'no-tags' ? !tags?.genreIds.length : !tags?.subgenreIds.length
}
