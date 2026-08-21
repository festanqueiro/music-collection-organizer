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

> **While this is still on the `v1-library-organizer` branch/worktree
> (not yet merged to `main`):** the app's `package.json` and all its code
> live at `.claude/worktrees/v1-library-organizer/`, not the repo root —
> `cd` there before running any of the commands below. Once this merges
> to `main`, everything moves to the repo root and this note goes away.

```bash
npm install
npm run dev     # launch the app in dev mode (hot reload)
npm test        # run the test suite
```

### Build and run right now

```bash
npm run build              # production build → out/main, out/preload, out/renderer
npx electron out/main/index.js   # launch the built app
```

`npm run dev` is the normal day-to-day way to run it (hot reload, DevTools
open). Use the build-and-run steps above when you want to launch exactly
what a production build produces — e.g. to sanity-check a release, or on
a machine where `npm run dev`'s dev server isn't available.

The app's data lives outside the repo, under Electron's per-app userData
directory (on macOS: `~/Library/Application Support/<app name>/`) —
`collection.db` (the SQLite database) and the config store (collection
folder path, window state). Deleting that directory resets the app to a
clean state.

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
