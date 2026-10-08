---
status: shipped
updated: 2026-10-08
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
- files that disappeared are **removed**, with their tags — the ones gone since the last scan and
  any already in Missing Tracks, but only inside the collection folder, and not at all if the scan
  finds no files (an unmounted drive). The dialog says so, with the current missing count
  ([ADR 0040](../adr/0040-update-collection-removes-missing-tracks.md)).
- the background rescans (folder watcher) and switching collection folder only **hide** missing
  files, so their tags survive a temporary move or a drive that isn't mounted yet; the same path
  found again brings the track back ([ADR 0004](../adr/0004-never-delete-track-rows.md)).

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
Placeholders that haven't been downloaded show a cloud badge and are skipped by the whole-collection
analysis, tag reading and backups ([ADR 0005](../adr/0005-cloud-only-detection.md)). They're fetched:
- when **played** — downloaded *before* going into the player (a "Downloading…" notice shows), then
  analysed in the background;
- when **queued** — the next three tracks in the queue are fetched ahead of time;
- when **analysed** from a track's or a selection's menu — downloaded, then analysed (the folder and
  whole-collection runs still skip them, so they never pull down a whole cloud library);
- with **Download** in the details panel.

Downloading streams the file through (so Drive materialises it) without blocking the app; it used to
analyse in the main process as well, which froze MCO for tens of seconds on a long AIFF. The
**Not Locally Available** filter lists what's still only in the cloud.

### Analysis
Computes duration, bitrate, BPM, musical key, waveform peaks, loudness (EBU R128, LUFS) and a 1–10
energy rating, in a pool of 4 worker threads ([ADR 0006](../adr/0006-analysis-in-worker-threads.md)).
The **BPM** is the beat tracker's, then sharpened over the whole track to 0.01 BPM (a whole number
when it's within 0.03 of one) — the tracker alone can be a few BPM off on fast music, which made
bars drift ([ADR 0062](../adr/0062-tempo-measured-over-the-whole-track.md),
[measurements](../research/bpm-accuracy.md)). Tracks analysed before 2026-10-08 keep their old BPM
until re-analysed. On broken beats the tracker can report two thirds of the tempo (108 for 162): the
analysis also tries the tempo 1.5 times faster and takes it when the track is clearly stronger
there ([ADR 0064](../adr/0064-bpm-two-thirds-and-set-by-hand.md)). A BPM set by hand (*Refine BPM*,
[DJ tools](dj-tools.md#refine-bpm)) or taken from Rekordbox is kept by later analyses.
Start it from the folder tree's menu (**Analyse collection / this folder** — pending and failed only),
the selection toolbar or a row's menu (**Analyse / Re-analyse track** — always re-runs), the Update
Collection popup, or automatically for a track you play or queue. A progress bar (combined across
concurrent runs, moving as each track gets through its steps) can be stopped; stopped tracks go back
to *pending*, failed ones show a red icon.

**Why it failed** is kept (`tracks.analysis_error`, in plain words by
`electron/main/analysis/errorMessage.ts`: the file is gone, can't be read, is damaged or not audio, or
— for cloud files — not fully downloaded; otherwise the last line of ffmpeg's log). It shows in the red
icon's tooltip and as a note in the track's details with **Try again**; a later successful analysis
clears it. Failures from before this was kept say no reason was recorded.

A track's **play count** and **last played** go up once it has played 30 s (or half of a track under a
minute); seeking doesn't count.

### Sidebar
Four views: **Folders**, **Tags**, **Subtags** and [**Filters**](filters.md) — only the open one is
labelled; the others are icons. It **collapses** to a strip of icons, and **reopens where you left
it**: the same view, open folders and selected folder (a folder that's gone falls back to All
Tracks). The folder tree has **Collapse all** next to All Tracks while anything is open; its
right-click menu has **Analyse this folder** and **Add all to queue**. Each folder name stays on
one line, cut with "…" when it's too long for the sidebar; hover it for the full name.

**Moving tracks to another folder:** drag rows from the table onto a folder in the Folders view (it
highlights). If any of them are in another folder, MCO asks *"Do you want to move this song to this
folder?"* (or *these N songs*); on **Move**, the files move on disk and their rows keep everything
(same track: tags, play count, queue position). Tracks already in that folder are left alone; a file
whose name is already taken there isn't moved (said in the message and a toast); the playing and
pre-listened tracks aren't moved. Only folders inside the collection accept drops. The database is
updated before each file is renamed (and put back if the rename fails), so the folder watcher's rescan
finds nothing new or missing (`electron/main/moveTracks.ts`, `tracks:moveToFolder`).

### Chips above the table
Every active narrowing shows as a chip with an × to clear it: the **search** ("dub"), the
**folder** (full path on hover), the **Tags/Subtags** selection ("Dub or House", "Deep in House"),
and each [filter](filters.md) ([ADR 0030](../adr/0030-filters-combine-with-sidebar-views.md)).

### Track table
- Columns: Title, Filename, Artist, Album, **Tags**, **Subtags**, BPM, Key, **Energy**, **LUFS**,
  **Volume Score**, Format, Bitrate, Duration, Date added, Date modified.
  - **Energy**: the 1–10 rating as a number and a small cool-to-hot bar.
  - **LUFS**: integrated loudness (EBU R128) from analysis, e.g. −8.4; closer to 0 is louder.
  - **Volume Score**: the gain that would bring the track to the **collection's median loudness**
    (`src/state/loudness.ts`), e.g. *+2.5 dB* (turn it up) or *−1.8 dB* (down) — for matching levels
    between tracks. 3 dB or more off is coloured. The header's tooltip names the median; it moves as
    tracks are added. Unanalysed tracks show —.
  The three are in the details panel too. Header tooltips explain them. Drag headers to reorder, drag edges to resize, click to sort (again to
  reverse); order, widths and sort are saved. A column added in a newer version slots in after the
  column it belongs with.
- **Choose columns**: the columns icon at the top of the play column, or right-click any column
  header, opens a checklist to show or hide each column (Title always stays). Saved in the config
  (`hiddenColumns`; `config:getHiddenColumns`/`setHiddenColumns`); hidden columns keep their place
  in the order.
- Lossy files (MP3, M4A/AAC, OGG, Opus) under 192 kbps are highlighted in Bitrate.
- The Key column shows colour-coded Camelot keys ([DJ tools](dj-tools.md#harmonic-mixing)).
- Click a row for its details; the play icon starts it (pause/resume on the playing track); the
  queue icon adds it to the end of the queue (lit, as a tick, while it's waiting there — a click
  adds it again); the headphones icon pre-listens ([DJ tools](dj-tools.md#headphone-pre-listen-cue)).
  All three sit in a fixed column of their own, right after the checkbox, whatever the column order.
- Only the rows on screen are drawn, at a fixed height, so it stays at ~120 fps with thousands of
  tracks ([ADR 0024](../adr/0024-virtualised-track-table.md)).
- Right-click a row: **Play track now**, **Add to queue**, **Add to top of the queue**, **Pre-listen
  in headphones**, **Analyse/Re-analyse track**, **Refine BPM…** ([DJ tools](dj-tools.md#refine-bpm)), **Convert to…** ([Convert](convert.md)), **Show in Finder** (*Show in File Explorer* on Windows), **Show in Folder
  Tree View**.
- **Add all to queue** queues everything visible ([Queue](queue.md)).

### Selecting several tracks
Check rows (shift-click checks a range) for the selection toolbar: add tags, analyse, queue
([Tags](tags.md#batch-tagging)). Checked rows get the same highlight as the selected row. With more
than one checked, the details panel
steps aside, and right-clicking a checked row acts on the whole selection in table order — **Add all
to queue**, **Add all to top of the queue**, **Analyse all**, **Clear selection**.

### Track details
The panel's **width** can be changed by dragging its left edge: 280 to 720 px, and never more
than 60 % of the window; a double-click on the edge goes back to 320 px. Remembered per computer
(`localStorage`, `detailPanelWidth`). The **sidebar** (the Folders / Tags / Subtags / Filters views
and the Playlists box) resizes the same way at its right edge: 200 to 560 px, at most 40 % of the
window, 260 px on a double-click (`sidebarWidth`); not while it's collapsed to its icon strip.

Six sections, each with a header that opens and closes it (click anywhere on the header); which
ones are closed is remembered between sessions (per section, in `localStorage` under
`detailSection.<id>`; all start open):

1. **Cover** — the cover embedded in the file.
2. **ID3 tags** — the file's tags (editable — [ID3 tags](id3-tags.md)).
3. **Tags** — your Tags and Subtags ([Tags](tags.md)); the header shows how many the track has.
4. **Playlists** — the playlists the track is in ([Playlists](playlists.md)).
5. **Similar tracks** — [DJ tools](dj-tools.md#similar-tracks); not ranked while closed.
6. **File** — the file's **full path** with **Copy path**, **Show in Finder** (*Show in File Explorer* on
Windows, as in the row menu and after a recording) and **Delete** (moves the file to
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
- UI: `src/components/TrackTable.tsx`, `DetailPanel.tsx` (its sections in `detail/`: `DetailSection`,
  `CoverSection`, `FileTagsSection`, `TagPicker`, `TrackPlaylists`, `SimilarTracksSection`,
  `FilePathSection`), `FolderTree.tsx`, `Toolbar.tsx`,
  `src/App.tsx` (sidebar); `src/state/folderTree.ts`.
- Delete: `tracks:trash` in `electron/main/ipc.ts` (`shell.trashItem`, row `present = 0`).
- Drag-out: `tracks:startDrag`, `electron/main/dragIcon.ts`.

- Analysis interrupted by quitting: tracks still marked `analyzing` at startup go back to
  `pending` (`resetInterruptedAnalysis`, `analysis/queue.ts`), so they lose their spinner and the
  next *Analyse Collection* includes them.

## Tests
- `scan.test.ts`, `scanDiff.test.ts`, `folderWalk.test.ts`, `folderWatcher.test.ts`,
  `analysis/*.test.ts`, `config.test.ts` (column order), `src/state/folderTree.test.ts`,
  `playCount.test.ts`.
- Table performance, chips, sidebar persistence and collapse, multi-select and the delete dialog were
  checked in the BETA build over DevTools ([performance](../research/performance.md)).

## Limits & open questions
- Tracks are keyed by absolute path (roadmap: portable library).
- Delete hasn't been exercised on a real file you meant to remove (only the dialog and Cancel).
