# v1: Local Library Organizer — Design Spec

Status: Approved for planning
Date: 2026-08-20

## Purpose

An Electron desktop app (macOS only for now) that scans a single
configurable folder containing a DJ's music collection, extracts
metadata and audio analysis per track, stores the results locally, and
lets the user browse/search/filter the collection through a dark-themed
UI. This is the foundation for later features (Rekordbox integration,
playlist export) which are explicitly out of scope for v1.

## Out of scope for v1

- Rekordbox read/write integration (see prior discussion — future work)
- Playlist creation/export of any kind
- Multiple collection folders
- Full DJ mixing/deck features (only a simple preview player)
- Google Drive API/OAuth integration (v1 relies entirely on Google
  Drive for Desktop's local filesystem mount — no direct API calls)

## Architecture

Electron app, two processes:

- **Main process**: owns the SQLite database (`better-sqlite3`), the
  folder scan, the background analysis worker queue, and all
  filesystem access. Talks to the renderer only via IPC.
- **Renderer process**: pure UI. `contextIsolation: true`,
  `nodeIntegration: false`, communicates with main through a typed
  preload bridge (`ipcRenderer.invoke` / `ipcMain.handle`, plus
  progress events pushed from main to renderer).

App configuration (collection folder path, window state) is stored
separately from the collection data — a small config store
(`electron-store` or equivalent), not the SQLite DB.

## Data model (SQLite)

```
tracks
  id            INTEGER PRIMARY KEY
  path          TEXT UNIQUE NOT NULL
  filename      TEXT NOT NULL
  folder        TEXT NOT NULL        -- parent dir, for folder tree view
  format        TEXT NOT NULL        -- wav / aiff / flac / mp3 / m4a
  size          INTEGER NOT NULL
  mtime         INTEGER NOT NULL
  duration      REAL
  title         TEXT
  artist        TEXT
  album         TEXT
  genre_tag     TEXT                 -- raw ID3 genre, distinct from tagging feature below
  year          INTEGER
  bpm           REAL
  musical_key   TEXT
  waveform_peaks TEXT                -- JSON array of numbers
  cloud_status  TEXT NOT NULL DEFAULT 'local'  -- 'local' | 'cloud_only'
  analysis_status TEXT NOT NULL DEFAULT 'pending' -- pending | analyzing | done | error
  analyzed_at   INTEGER

genres
  id            INTEGER PRIMARY KEY
  name          TEXT UNIQUE NOT NULL

subgenres
  id            INTEGER PRIMARY KEY
  name          TEXT NOT NULL
  genre_id      INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE

moods
  id            INTEGER PRIMARY KEY
  name          TEXT UNIQUE NOT NULL

track_genres     (track_id, genre_id)     PRIMARY KEY (track_id, genre_id)
track_subgenres  (track_id, subgenre_id)  PRIMARY KEY (track_id, subgenre_id)
track_moods      (track_id, mood_id)      PRIMARY KEY (track_id, mood_id)
```

Deleting a genre cascades to its subgenres and any `track_subgenres`
rows referencing them.

## Scan & sync flow

1. **App launch**: load the existing collection straight from SQLite
   and render immediately — no filesystem access required to open the
   app. A dismissible prompt appears: "Scan folder for changes?"
   (Yes/No).
2. **Scan trigger**: either accepting that prompt, or clicking the
   always-visible "Update Collection" toolbar button. Both call the
   same `scanAndAnalyze()` flow in main.
3. **Walk**: recursively walk the configured folder for audio files
   (wav, aiff, flac — the collection's current formats; extensible to
   mp3/m4a later).
4. **Diff against DB**: compare found files to existing `tracks` rows
   by path; new files are inserted (`analysis_status = 'pending'`),
   changed files (mtime/size differ) are marked `pending` again,
   missing files (in DB, not found on disk) are flagged/removed.
5. **Cloud-only detection**: for each file, compare `stat().size`
   (logical size) against `stat().blocks * 512` (actual disk usage).
   A placeholder file (Google Drive for Desktop "stream" mode,
   materialized on demand) allocates far fewer blocks than its
   reported size. Files detected this way get `cloud_status =
   'cloud_only'` and are **not** analyzed automatically — no forced
   downloads during a scan.
   **Technical risk**: this heuristic needs validating against actual
   Google Drive for Desktop behavior on macOS before being relied on;
   treat as a short spike at the start of implementation.
6. **Analysis queue**: locally-available pending/changed files enter a
   background worker-thread queue (bounded concurrency). Each worker:
   - reads tags via `music-metadata`
   - decodes the file to PCM via `ffmpeg-static`
   - runs BPM + musical key detection via `essentia.js` (WASM) on the
     decoded PCM
   - computes waveform peaks from the same PCM buffer
   - upserts the result into `tracks`, sets `analysis_status = 'done'`
7. **Progress**: main pushes progress events (`X of Y analyzed`) to the
   renderer over IPC; the track table updates incrementally as results
   land, not only when the whole scan finishes.

## Cloud file download (manual)

- Cloud-only tracks show a status badge/icon in the track table; BPM,
  key, and waveform columns stay empty until downloaded.
- A "Download" action (available per-track and on a multi-selection)
  reads the file's full bytes, which causes Google Drive for Desktop
  to materialize it locally (no Drive API calls needed — this is
  transparent OS-level behavior of the Drive for Desktop mount).
- After materializing, the track is re-queued into the normal
  analysis pipeline (step 6 above).
- No automatic bulk download exists in v1; the user always chooses
  which files to pull down.

## UI layout

Three-pane window, dark theme:

- **Left pane** — toggle between two views:
  - **Folders**: tree reflecting the on-disk subfolder structure of
    the collection folder.
  - **Tags**: tree with two root branches, **Genre** (expandable into
    its Sub-Genres) and **Mood** (flat list). Each node has a
    checkbox.
- **Center pane** — track table (sortable columns: title, artist, BPM,
  key, format, duration, path, cloud status) with a text search bar
  above it (filters by filename/title/artist/album — tag filtering
  happens only through the left-pane Tags tree, not duplicated here).
- **Right pane** — track detail panel, shown when a track row is
  selected: full tag fields, waveform display, simple preview player
  (play/pause/seek, native `<audio>`), and the Genre/Sub-Genre/Mood tag
  pickers for that track.

### Tag filtering behavior

- Checking a tree node adds it to the active filter.
- Checking a top-level Genre node includes that Genre **and** all of
  its Sub-Genres (OR'd together) in the filter.
- Checking a specific Sub-Genre narrows to just that Sub-Genre.
- Multiple checked nodes within the same branch (Genre or Mood) combine
  with OR; the Genre-branch selection and Mood-branch selection combine
  with AND. (e.g. `(House OR Techno) AND (Energetic)`)

### Tagging behavior

- Genre, Sub-Genre, and Mood values are fully user-defined — no preset
  taxonomy ships with the app. New tags can be created inline from the
  tag picker in the detail panel.
- A track can have multiple Genres, multiple Sub-Genres, multiple
  Moods.
- The Sub-Genre picker for a track is constrained to children of that
  track's currently-selected Genre(s).
- If a Genre is removed from a track, any Sub-Genre tags on that track
  which belonged only to the removed Genre are automatically removed
  too (keeps tag state always consistent — no orphaned Sub-Genre tags).

## Visual design

- Dark theme. Background/surface built from a near-black neutral base
  (e.g. `#12151a` background, `#1b1f26` elevated surfaces).
- Accent colors: a cool teal/cyan primary accent with a violet
  secondary accent for status/highlights — exact palette to be
  finalized during implementation.
- Typography: **Jost** (Google Fonts).
- Iconography: **Material Symbols** (Google).

## Testing approach

- Unit tests for pure logic: scan-diff (new/changed/missing file
  detection), cloud-only detection heuristic, tag metadata parsing,
  Genre/Sub-Genre cascade and orphan-cleanup logic, filter-combination
  logic (OR-within/AND-across).
- Integration tests for the analysis pipeline (ffmpeg decode → essentia
  BPM/key → waveform) against a small set of fixture audio files
  covering wav/aiff/flac.
- Light smoke coverage for IPC and UI; no heavy investment in
  end-to-end Electron UI testing for v1.

## Open technical risks to validate early

1. Cloud-only file detection heuristic (`stat().blocks` vs `size`) —
   needs confirming against real Google Drive for Desktop stream-mode
   behavior on macOS.
2. `essentia.js` WASM performance on a 10,000+ track lossless
   collection — confirm background worker throughput is acceptable
   even though it's understood to be slower than native analysis
   libraries.
