---
status: accepted
date: 2026-09-27
---
# 0039. Download cloud-only tracks before playing them, without blocking the main process

## Context
Playing a Google Drive placeholder put the track in the player first and downloaded it after; the
download (`cloudDownload.ts`) then analysed the track **in the main process** (`analyzeTrack`). On a
long AIFF that blocked the main process for 20 s or more — no input, no rendering, macOS's beach
ball — which the user reported as a crash. Analyse also skipped cloud-only tracks without a word, and
a track's cloud-only flag was only refreshed when its size or mtime changed, which downloading
doesn't do (so 42 downloaded tracks were still flagged).

## Decision
- `downloadTrack` only streams the file through (materialising it) and marks it local; analysis
  runs in the analysis worker like any other.
- Playing a cloud-only track downloads it **before** it enters the player (a "Downloading…" toast;
  on failure the player is left alone). The next three queued tracks are downloaded ahead of time.
  Downloads are de-duplicated per track.
- `analysis:run` with explicit track ids downloads cloud-only ones first. The folder and
  whole-collection runs still skip them, so they never pull down a whole cloud library.
- Every scan re-checks the cloud state of unchanged files, so the flag follows reality.

Refines [ADR 0005](0005-cloud-only-detection.md).

## Alternatives considered
- Keep in-process analysis but for short files only: still blocks, just less often.
- Prefetch the whole queue: queueing a big cloud folder would download all of it.

## Consequences
- The app stays responsive while a track downloads (checked: slowest renderer response 4 ms while
  a 185 MB AIFF was fetched, played and analysed; before, 20 s+ with no response).
- A cloud-only track takes a moment to start; the toast says why.
