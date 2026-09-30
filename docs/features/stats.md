---
status: shipped
updated: 2026-10-01
adrs: []
---
# Stats

## What it does
The collection in numbers: how many songs, how long, how big, how good the
files are, their tempos, keys, genres and artists, when they were released
and when they arrived. Open it with the **Stats** icon (📈) in the toolbar,
between Update Collection and Settings; close it with **Esc** or ×. It shows
the whole collection or one folder (with its subfolders), picked at the top.

## Behaviour
- **Tiles**: songs; playtime (and how many have no length); size on disk;
  artists; albums; genres (MCO genre tags in use).
- **Quality**: a bar of lossless / lossy OK (192 kbps or more) / lossy low
  (under 192 kbps, as the Bitrate column flags) / not analysed (a lossy file
  whose bitrate isn't known yet); counts and shares below it; the formats.
- **Tempo**: songs per 5 BPM (empty bins shown), with the range and median;
  MCO's analysed BPM.
- **Keys**: songs per key round the Camelot wheel, in the notation picked in
  Settings; how many have no key.
- **Top 10 genres** (by songs tagged) and **artists** — the same name in any
  case or spacing counts once, shown as it's most often written.
- **Years of release** (every year from the first, and per decade) and
  **added per month** (the file's creation date on this drive — the Date
  Added column).
- **Analysed**, **tagged** (at least one genre tag), **file not found**
  (missing since the last scan) and **in iCloud only**.
- Hovering a bar shows its number.

## How it works
- `src/state/collectionStats.ts` — `computeStats(tracks, missingTracks,
  trackTags, genres, keyNotation)`, pure; `qualityVerdict`, and the
  `LOSSY_FORMATS`/`LOW_BITRATE_KBPS` the table's Bitrate column uses too.
- `src/components/StatsView.tsx` — the overlay (tiles, CSS bar charts, the
  folder picker); opened from `Toolbar.tsx`, rendered by `App.tsx`. Numbers
  are computed from the store on open and whenever the collection changes.

## Tests
- `src/state/collectionStats.test.ts`: tiles and no-length count, artists in
  any case, BPM bins/median, keys in each notation, genre ranking and tagged,
  empty years/months filled and decades, quality verdicts, formats, missing
  and cloud-only.

## Limits & open questions
- No labels, ratings or playlists — MCO doesn't store them.
- "Added" is the file's creation date, not when MCO first saw it.
