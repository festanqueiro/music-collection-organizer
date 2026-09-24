# Library

## Collection folder

MCO works on one collection folder at a time. Pick it in **Settings →
General → Collection folder** (or on first launch).

The very first pick also moves the database and settings into a hidden
`.mco` folder inside the collection, and the app relaunches (you're warned
first). Picking a different folder later keeps the data where it is — see
[Settings & data](settings-and-data.md).

## Scanning ("Update Collection")

**Update Collection** in the toolbar walks the collection folder for audio
files (WAV, AIFF, FLAC, MP3) and compares them with the
database:

- new files are added as *pending* analysis;
- changed files (size or modified time) are reset to *pending*;
- files that disappeared are **hidden, never deleted**, so their tags
  survive a drive that isn't mounted yet or a temporary move. If the same
  path shows up again in a later scan the track comes back with its tags.

Scanning never starts analysis by itself. After picking a new folder the
app asks whether to analyse the unanalysed tracks.

Code: `electron/main/scan.ts`, `folderWalk.ts`, `scanDiff.ts`.

## Cloud-only files (Google Drive for Desktop)

Placeholder files that haven't been downloaded yet are shown with a cloud
badge and skipped by analysis. **Download** in the detail panel (or playing
the track) fetches the file, marks it local, and analyses it.

Code: `electron/main/cloudDetect.ts`, `cloudDownload.ts`.

## Analysis

Analysis reads each file's tags (title, artist, album, genre, year, cover
art) and computes duration, BPM, musical key, and waveform peaks. It runs
in a pool of 4 worker threads so the UI stays responsive.

Ways to start it:

- **Analyse collection** / **Analyse this folder** from the folder tree's
  right-click menu (pending and failed tracks only);
- **Analyse** from the batch bar for checked tracks, or **Analyse track** /
  **Re-analyse track** from a row's menu (always re-runs);
- automatically, in the background, for a track you play or queue.

A progress bar shows while any analysis is running (combined across
concurrent runs) and can be stopped. Stopped tracks go back to *pending*;
failed tracks show a red icon and are retried by the next collection-wide
run.

Code: `electron/main/analysis/` (`queue.ts`, `worker.ts`, `pipeline.ts`,
`bpmKey.ts`, `waveform.ts`, `metadata.ts`).

## Track table

- Columns: Title, Filename, Artist, Tags, BPM, Key, Format, Duration, Date
  added, Date modified.
- Drag column headers to reorder them; click a header to sort, click again
  to reverse. Order and sort are saved.
- Click a row to show its details (cover art, ID3 metadata, your tags) in
  the detail panel. Check rows for [batch tagging](tags.md#batch-tagging).
- Right-click a row: **Play track now**, **Add to queue**, **Add to top of
  the queue**, **Analyse/Re-analyse track**, **Show in File Explorer**
  (reveals it in Finder), **Show in Folder Tree View**.
- **Add all to queue** queues everything currently visible (see
  [Queue](queue.md)).

Code: `src/components/TrackTable.tsx`, `DetailPanel.tsx`.

## Search

The toolbar search matches title, artist, album, filename, and tag names.
The clear (×) button resets it. Clicking the artist in the player bar
searches for that artist.

## Folder tree

The **Folders** tab of the left panel shows the collection's folder
structure; clicking a folder filters the table to it. Its right-click menu
has **Analyse this folder** and **Add all to queue**.

Code: `src/components/FolderTree.tsx`, `src/state/folderTree.ts`.

## Drag-out

Drag one or more rows straight to Finder, a DAW, or any other app. It's a
normal file drag of the original files — nothing is copied or moved by MCO.

Code: `ipc.ts` (`tracks:startDrag`), `electron/main/dragIcon.ts`.
