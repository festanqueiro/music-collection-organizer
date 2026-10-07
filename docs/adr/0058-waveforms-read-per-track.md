---
status: accepted
date: 2026-10-07
---
# 0058. Read waveforms per track, not with the track list

## Context
`tracks:getAll` returned every track with its whole-track waveform: 800 peaks, ~15 kB of JSON
each. With the collection analysed that is 38 MB of peaks for 2,641 tracks, parsed on the main
thread and cloned to the renderer on every reload of the list — at startup, after every tag
create / rename / recolour / delete, after a download, on each tag-read progress event and every
300 ms during an analysis run. Measured on a copy of the database: ~100–140 ms of main thread plus
~250–300 ms of cloning per call, against ~20 ms without the peaks
([measurements](../research/performance.md)). Only the player (its waveform and the hot-cue grid's
fallback start) and the now-playing screens on the TV and second screen read them, and only for
the loaded track.

## Decision
The track list no longer carries waveforms. `Track.waveformPeaks` is gone; `tracks:getAll` and
`tracks:getMissing` select every `tracks` column except `waveform_peaks` (the list is built from
`PRAGMA table_info`, so new columns need nothing). `tracks:getWaveform(trackId)` returns one
track's peaks; the store keeps them in `trackWaveforms`, and the Player reads its track's when it
mounts and again when `Track.analyzedAt` (new, from `analyzed_at`) changes, so a waveform appears
when an analysis of the playing track finishes. The cast and second-screen queue messages take the
current track's peaks from `trackWaveforms` and are re-sent when it changes.

## Alternatives considered
- Round the stored peaks to 3 decimals: 26 MB and ~300 ms per reload — still paid on every reload,
  and it needs a migration of every row.
- Patch the store with only the changed tracks instead of reloading the list: a larger change to
  every caller of `loadAll` / `refreshTracks`, and startup would still load 38 MB.
- Keep the peaks in a separate table: the same result as not selecting the column, with a migration.

## Consequences
- A reload of the track list is ~2 MB instead of up to ~40 MB.
- The waveform arrives a moment after the player's first paint (one small IPC call).
- Anything new that needs a waveform must ask for it by track; it is not on `Track`.
