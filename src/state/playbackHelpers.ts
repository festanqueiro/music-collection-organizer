// src/state/playbackHelpers.ts
//
// What the store's playing and queueing actions share: analysing a track in
// the background when it's played or queued, downloading a cloud-only one
// first, and fetching the next few of the queue ahead of time.
import type { StoreApi } from 'zustand'
import type { Track } from '../types'
import type { CollectionState } from './store'

// Kicks off analysis for one track in the background if it needs it —
// shared by the playing actions (the track becoming current) and the queueing
// actions below (a track landing in the queue at all, even before it's
// current, per the same "explicit user action" reasoning: adding it to
// the queue is itself deliberate). A cloud-only track has no local file
// yet — analysis:run's own query already excludes those, but checking
// here too avoids a pointless IPC round-trip for one that obviously can't
// run.
export function triggerBackgroundAnalysis(get: StoreApi<CollectionState>['getState'], trackId: number): void {
  triggerBackgroundAnalysisForMany(get, [trackId])
}

// Batches every track that actually needs it into a single analysis:run
// call — used for "Add all to queue" so queueing a whole folder doesn't
// fire off one IPC round-trip per track.
// Local tracks that haven't been (successfully) analysed yet. Cloud-only
// tracks are skipped — they're analysed once downloaded, which happens
// before they're played or when they're next up (see downloadBeforePlaying).
export function tracksNeedingAnalysis(tracks: Track[], trackIds: number[]): number[] {
  const byId = new Map(tracks.map((t) => [t.id, t]))
  return trackIds.filter((id) => {
    const track = byId.get(id)
    return track && track.cloudStatus === 'local' && (track.analysisStatus === 'pending' || track.analysisStatus === 'error')
  })
}
// Also re-analyses tracks analysed before loudness/energy (or the first
// beat, for suggested hot cues) existed, so they
// fill in as they're played or queued rather than all at once. Deliberately
// not part of tracksNeedingAnalysis, which the queue dialog counts as
// "unanalysed".
export function tracksMissingEnergy(tracks: Track[], trackIds: number[]): number[] {
  const byId = new Map(tracks.map((t) => [t.id, t]))
  return trackIds.filter((id) => {
    const track = byId.get(id)
    return track && track.cloudStatus === 'local' && track.analysisStatus === 'done' && (track.energy === null || track.firstBeat == null)
  })
}
export function triggerBackgroundAnalysisForMany(get: StoreApi<CollectionState>['getState'], trackIds: number[]): void {
  const tracks = get().tracks
  const ids = [...tracksNeedingAnalysis(tracks, trackIds), ...tracksMissingEnergy(tracks, trackIds)]
  if (ids.length === 0) return
  get()
    .runAnalysis(ids)
    .catch((err) => console.error('background analysis of queued track(s) failed', err))
}

// A cloud-only track has no local audio to stream yet: it's downloaded
// before it goes into the player (the player reading a file that's still
// only in the cloud stalled playback). Returns false if the download
// failed, so the caller can leave the player alone.
export async function downloadBeforePlaying(get: StoreApi<CollectionState>['getState'], trackId: number): Promise<boolean> {
  const track = get().tracks.find((t) => t.id === trackId)
  if (!track) return false
  if (track.cloudStatus !== 'cloud_only') return true
  const name = track.title ?? track.filename
  get().showToast(`Downloading ${name}…`)
  try {
    await downloadTrack(get, trackId)
    return true
  } catch (err) {
    console.error('failed to download track before playing it', err)
    get().showToast(`Couldn't download ${name}`)
    return false
  }
}

// One download per track at a time, shared by playing and prefetching.
const downloadsInFlight = new Map<number, Promise<void>>()
export function downloadTrack(get: StoreApi<CollectionState>['getState'], trackId: number): Promise<void> {
  const inFlight = downloadsInFlight.get(trackId)
  if (inFlight) return inFlight
  const download = window.api
    .downloadTrack(trackId)
    .then(() => get().loadAll())
    .finally(() => downloadsInFlight.delete(trackId))
  downloadsInFlight.set(trackId, download)
  return download
}

// How many upcoming queued tracks are fetched from the cloud ahead of time,
// so they're local by the time they play — only a few, so queueing a big
// cloud folder doesn't download all of it.
const PREFETCH_UPCOMING = 3
export function prefetchUpcoming(get: StoreApi<CollectionState>['getState']): void {
  const upcoming = get().playlist.slice(0, PREFETCH_UPCOMING + 1)
  const tracks = get().tracks
  for (const id of upcoming) {
    if (tracks.find((t) => t.id === id)?.cloudStatus !== 'cloud_only') continue
    downloadTrack(get, id)
      .then(() => triggerBackgroundAnalysis(get, id))
      .catch((err) => console.error('prefetching a queued cloud track failed', err))
  }
}
