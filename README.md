# music-collection-organizer

An Electron desktop app (macOS only for now) that scans a DJ's local music
collection, extracts tags and audio analysis (BPM, musical key, waveform)
per track, stores everything locally, and lets you browse/search/filter
and tag the collection through a dark-themed UI.

Also understands Google Drive for Desktop "cloud-only" placeholder files —
they show a cloud badge and can be downloaded (materialized locally) and
analyzed on demand, one track at a time.

## Stack

Electron + `electron-vite` + React + TypeScript, `node:sqlite` (Node's
built-in synchronous SQLite — no native module to compile), `electron-store`,
`music-metadata`, `ffmpeg-static`, `essentia.js` (WASM, run in a
`worker_threads` pool so analysis doesn't block the UI), `zustand`,
Vitest.

## Getting started

```bash
npm install
npm run dev     # launch the app in dev mode
npm test        # run the test suite
npm run build   # production build (out/main, out/preload, out/renderer)
```

## Project layout

- `electron/main/` — main process: SQLite schema and data access, the
  folder scan/diff pipeline, cloud-only detection, the analysis pipeline
  (metadata/BPM/key/waveform) and its worker-thread pool, IPC handlers.
- `electron/preload/` — the typed `contextBridge` API exposed to the
  renderer (`window.api`). The renderer never touches Node/fs/DB directly.
- `src/` — the React renderer: the three-pane layout, zustand store, and
  components (track table, folder tree, tag tree, detail panel/player).
- `tests/fixtures/` — a synthetic WAV-tone generator shared by the audio
  pipeline's tests.

## Status

v1 is implemented and runs. See `TODO.md` for what's fixed, what's still
open, and the design docs it was built from
(`docs/superpowers/specs/`, `docs/superpowers/plans/`).
