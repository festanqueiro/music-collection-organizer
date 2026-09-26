---
status: shipped
updated: 2026-09-26
adrs: [0004, 0005, 0006, 0009, 0024, 0027, 0030, 0031]
---
# Library

## What it does
MCO works on one collection folder: it finds the audio files, reads their tags, analyses them, and
shows them in a fast table you can search, filter by folder, tag or [filter](filters.md), tag in
bulk, and drag out to other apps.

## Behaviour

### Collection folder
Pick it in **Settings → Library** (or on first launch); the toolbar shows it too, next to
**Update Collection**. The very first pick moves the database and settings into a hidden `.mco`
folder inside the collection and relaunches (you're warned first,
[ADR 0009](../adr/0009-data-folder-inside-collection.md)). See [Settings & data](settings-and-data.md).

### Scanning — Update Collection
The **Update Collection** icon (toolbar) asks first: *"We're going to scan for new files in
<folder>"*, with **Analyse all new files added to the collection** (on by default). The scan walks the
folder for audio files (WAV, AIFF, FLAC, MP3, M4A/AAC, OGG, Opus) and compares them with the database:
- new files are added as *pending* analysis;
- changed files (size or modified time) are reset to *pending* and their tags re-read;
- files that disappeared are **hidden, never deleted**, so their tags survive a drive that isn't
  mounted yet or a temporary move; the same path found again brings the track back
  ([ADR 0004](../adr/0004-never-delete-track-rows.md)).

### Watching the folder
MCO watches the collection folder, subfolders included. A few seconds after files are added, removed
or replaced it rescans in the background and a toast says what changed ("3 new tracks, 1 missing").
**Settings → Library**: *Watch for new and removed files* (on by default); *Analyse new tracks
automatically* (off by default). The `.mco` folder, Finder metadata and partial downloads are ignored.

### Reading tags
Every local file's own tags (title, artist, album, genre, year) are read in the background at startup
and after scans, and again when you select a track — not only when it's analysed
([ADR 0027](../adr/0027-read-file-tags-in-background.md)). The table shows the filename until a
title is known.

### Cloud-only files (Google Drive for Desktop)
Placeholders that haven't been downloaded show a cloud badge and are skipped by analysis, tag reading
and backups. **Download** in the details (or playing the track) fetches it, marks it local and
analyses it ([ADR 0005](../adr/0005-cloud-only-detection.md)).

### Analysis
Computes duration, bitrate, BPM, musical key, waveform peaks, loudness (EBU R128, LUFS) and a 1–10
energy rating, in a pool of 4 worker threads ([ADR 0006](../adr/0006-analysis-in-worker-threads.md)).
Start it from the folder tree's menu (**Analyse collection / this folder** — pending and failed only),
the selection toolbar or a row's menu (**Analyse / Re-analyse track** — always re-runs), the Update
Collection popup, or automatically for a track you play or queue. A progress bar (combined across
concurrent runs, moving as each track gets through its steps) can be stopped; stopped tracks go back
to *pending*, failed ones show a red icon.

A track's **play count** and **last played** go up once it has played 30 s (or half of a track under a
minute); seeking doesn't count.

### Sidebar
Four views: **Folders**, **Tags**, **Subtags** and [**Filters**](filters.md) — only the open one is
labelled; the others are icons. It **collapses** to a strip of icons, and **reopens where you left
it**: the same view, open folders and selected folder (a folder that's gone falls back to All
Tracks). The folder tree has **Collapse all** next to All Tracks while anything is open; its
right-click menu has **Analyse this folder** and **Add all to queue**.

### Chips above the table
Every active narrowing shows as a chip with an × to clear it: the **search** ("dub"), the
**folder** (full path on hover), the **Tags/Subtags** selection ("Dub or House", "Deep in House"),
and each [filter](filters.md) ([ADR 0030](../adr/0030-filters-combine-with-sidebar-views.md)).

### Track table
- Columns: Title, Filename, Artist, **Tags**, **Subtags**, BPM, Key, Format, Bitrate, Duration, Date
  added, Date modified. Drag headers to reorder, drag edges to resize, click to sort (again to
  reverse); order, widths and sort are saved. A column added in a newer version slots in after the
  column it belongs with.
- Lossy files (MP3, M4A/AAC, OGG, Opus) under 192 kbps are highlighted in Bitrate.
- The Key column shows colour-coded Camelot keys ([DJ tools](dj-tools.md#harmonic-mixing)).
- Click a row for its details; the play icon starts it (pause/resume on the playing track); the
  headphones icon pre-listens ([DJ tools](dj-tools.md#headphone-pre-listen-cue)).
- Only the rows on screen are drawn, at a fixed height, so it stays at ~120 fps with thousands of
  tracks ([ADR 0024](../adr/0024-virtualised-track-table.md)).
- Right-click a row: **Play track now**, **Add to queue**, **Add to top of the queue**, **Pre-listen
  in headphones**, **Analyse/Re-analyse track**, **Show in File Explorer** (Finder), **Show in Folder
  Tree View**.
- **Add all to queue** queues everything visible ([Queue](queue.md)).

### Selecting several tracks
Check rows (shift-click checks a range) for the selection toolbar: add tags, analyse, queue
([Tags](tags.md#batch-tagging)). Checked rows get the same highlight as the selected row. With more
than one checked, the details panel
steps aside, and right-clicking a checked row acts on the whole selection in table order — **Add all
to queue**, **Add all to top of the queue**, **Analyse all**, **Clear selection**.

### Track details
Cover art, analysis, your tags, **Full ID3 tags** (editable — [ID3 tags](id3-tags.md)), and at the
bottom the file's **full path** with **Copy path**, **Show in Finder** and **Delete** (moves the file to
the Trash after a confirmation; restoring it brings the track back with its tags —
[ADR 0031](../adr/0031-delete-moves-to-trash.md)).

### Search
Matches title, artist, album, filename and tag names; × or the chip clears it. Clicking the artist in
the player bar searches for that artist.

### Drag-out
Drag rows straight to Finder, a DAW or any app — a normal file drag of the original files.

## How it works
- Scan: `electron/main/scan.ts`, `folderWalk.ts`, `scanDiff.ts`; watcher: `folderWatcher.ts`.
- Tags read: `electron/main/tagReader.ts` (`tags_read_at` column).
- Cloud files: `cloudDetect.ts`, `cloudDownload.ts`.
- Analysis: `electron/main/analysis/` (`queue.ts`, `worker.ts`, `pipeline.ts`, `bpmKey.ts`,
  `energy.ts`, `waveform.ts`, `metadata.ts`); play counts `src/state/playCount.ts`.
- UI: `src/components/TrackTable.tsx`, `DetailPanel.tsx`, `FolderTree.tsx`, `Toolbar.tsx`,
  `src/App.tsx` (sidebar); `src/state/folderTree.ts`.
- Delete: `tracks:trash` in `electron/main/ipc.ts` (`shell.trashItem`, row `present = 0`).
- Drag-out: `tracks:startDrag`, `electron/main/dragIcon.ts`.

## Tests
- `scan.test.ts`, `scanDiff.test.ts`, `folderWalk.test.ts`, `folderWatcher.test.ts`,
  `analysis/*.test.ts`, `config.test.ts` (column order), `src/state/folderTree.test.ts`,
  `playCount.test.ts`.
- Table performance, chips, sidebar persistence and collapse, multi-select and the delete dialog were
  checked in the BETA build over DevTools ([performance](../research/performance.md)).

## Limits & open questions
- Tracks are keyed by absolute path (roadmap: portable library).
- "Show in File Explorer" should say "Show in Finder".
- Delete hasn't been exercised on a real file you meant to remove (only the dialog and Cancel).
