---
status: accepted
date: 2026-08-21
---
# 0010. Play AIFF through a cached lossless FLAC transcode

## Context
Most of the collection is AIFF (about 2,370 of 2,643 tracks, 2026-09-26), and Chromium's `<audio>` can't
decode AIFF.

## Decision
AIFF files are transcoded to FLAC with ffmpeg the first time they're played or analysed, cached in
`<userData>/media-cache/` keyed by path + mtime, and served over the `media://` protocol
(`electron/main/audioTranscode.ts`). The cache is capped at 10 GB, oldest files removed at startup.
Analysis reads the same cached file, so a track being played and analysed isn't read twice from a
still-syncing Google Drive file.

## Consequences
- First play of an AIFF waits for the transcode.
- Changing a file (including editing its tags) changes its mtime, so it's transcoded again next time.
- Cast devices get a 16-bit WAV instead (they can't seek in these FLACs) — see [casting](../features/casting.md).
