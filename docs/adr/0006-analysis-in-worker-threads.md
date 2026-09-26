---
status: accepted
date: 2026-08-20
amended-by: 0027
---
# 0006. Analyse audio with essentia.js (WASM) and ffmpeg in a pool of worker threads

## Context
Every track needs BPM, key, waveform peaks, loudness and energy. The analysis is CPU-bound and
synchronous (WASM); run on the main process it would freeze IPC and window painting for the whole
of a collection-wide run.

## Decision
Decode with `ffmpeg-static` (path resolved through `resolveFfmpegPath()` so it works inside
`app.asar`), analyse with `essentia.js` (BPM/key, EBU R128 loudness, onset rate → 1–10 energy), and
run it in a pool of 4 `worker_threads`. The DB is written only on the main thread. Workers report
progress after each step of a track, so the progress bar moves during long files.

## Alternatives considered
- Native analysis libraries (faster): need native builds, which [ADR 0003](0003-node-sqlite.md) avoids.

## Consequences
- The UI stays responsive during analysis.
- Analysis never starts on its own after a scan unless the user asks
  ([Update Collection](../features/library.md) offers it; a setting auto-analyses new tracks).
- Tag reading moved out of analysis into a background pass ([ADR 0027](0027-read-file-tags-in-background.md)).
