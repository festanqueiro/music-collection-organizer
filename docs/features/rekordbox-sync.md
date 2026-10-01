---
status: planned
updated: 2026-10-01
adrs: [0051, 0050, 0028, 0026, 0008]
---
# Rekordbox sync (collection export)

## What it does
Brings what you changed in MCO into your Rekordbox collection without retyping it: file tag
edits (title, artist, album, year…), MCO's Tags as the songs' **Genre**, cue points (once MCO has
them, roadmap *Hot cues and loops*), BPM and key, and playlists. MCO writes a full Rekordbox
**collection XML** that Rekordbox reads as its "rekordbox xml" library, and can also write your
Tags into the files' own Genre, so Rekordbox's **Reload Tag** picks them up. Rekordbox's own
database is never opened or written
([ADR 0050](../adr/0050-playlists-in-mco-imported-from-rekordbox-xml.md),
[ADR 0051](../adr/0051-update-rekordbox-through-xml-and-file-tags.md)).

Today's **Export to Rekordbox** ([DJ tools](dj-tools.md#export-to-rekordbox)) is the start of
this: a one-way XML with every track, the file's genre, BPM, key, tags in Comments, tags as
playlists under **MCO** and playlists under **MCO Playlists**. This feature turns it
into a repeatable update.

## Behaviour (planned)

### Two ways in, for two kinds of data
Rekordbox takes changes from outside in two places, and each kind of data goes where Rekordbox
actually reads it:

| Data | Through | In Rekordbox |
|---|---|---|
| Title, Artist, Album, Year, Genre (file tags) | the audio file's tags, and the XML | right-click → **Reload Tag**, or import from the XML |
| MCO Tags as Genre (and Subtags as Grouping) | the file's Genre (optional) and the XML | as above |
| Cue points and loops | the XML only (Rekordbox keeps cues in its own database, not in file tags) | import the tracks from the "rekordbox xml" library |
| BPM, key | the XML (key also already in files MCO tagged) | import from the XML (Rekordbox may re-analyse — see phase 0) |
| Playlists | the XML | import the playlists from the "rekordbox xml" library |

Which of these Rekordbox **overwrites on tracks it already has** is the big unknown; phase 0
measures it before anything is built on top.

### Export to Rekordbox (reworked)
- **Settings → Import & export → Rekordbox** keeps **Export to Rekordbox…**, and gains:
  - **Export file**: chosen once and remembered. Rekordbox's *Preferences → Advanced → Database →
    rekordbox xml* points at that same file, so each export refreshes what Rekordbox shows (after
    its refresh button in the "rekordbox xml" tree) — no dialog after the first time.
  - **Update Rekordbox** (a button, and in the File menu): writes the XML to that file at once.
  - **What goes in**: *Everything* (default) or *Only songs changed since the last export* (with
    the date of that export). Changed = file tags written, MCO Tags/Subtags changed, analysis
    redone, cue points edited, or added to the collection. Playlists always go in whole.
  - **Genre in the XML**: *MCO Tags* (default when the song has any, else the file's genre) or
    *the file's genre* (today's behaviour). **Grouping**: *MCO Subtags* or nothing.
    **Comments**: MCO Tags (today), plus energy as "Energy 7" (Rekordbox has no energy field).
- After writing, a summary: N songs (M changed), P playlists, C cue points, and the steps to take
  in Rekordbox (refresh the xml tree, select the changed songs under *All Tracks*, **Import to
  Collection**).
- Songs that are missing or cloud-only are left out, as today. Songs are identified to Rekordbox
  by file path (`Location`); a moved file is a new song to Rekordbox
  (roadmap *Portable library*).

### Write Tags into the files' Genre
- Batch bar and row menu: **Write Tags to Genre (file)…**; Settings → Rekordbox: **Write Tags to
  every file's Genre…**. A confirmation first: how many files will change, an example
  ("*House, Deep House*"), which are skipped and why. Nothing is written without it
  ([ADR 0028](../adr/0028-suggest-never-auto-write-file-tags.md): one explicit action — here one
  for the batch, not one per file; see ADR 0051).
- The Genre becomes the song's Tags then Subtags, comma-separated — the same text as **Use tags**
  in [ID3 tags](id3-tags.md). Songs without MCO Tags are left alone (never cleared).
- Written byte-for-byte like single edits ([ADR 0026](../adr/0026-write-tags-byte-for-byte.md)):
  only the text frames change, birth time kept, no re-analysis. MP3, WAV, AIFF today; FLAC, M4A
  and ID3v2.2 MP3s are skipped and counted until tag writing covers them (roadmap *Tag writing for
  FLAC and ID3v2.2*).
- Progress in the analysis bar style, cancellable; a summary at the end (written, unchanged,
  skipped, failed with reasons). Afterwards, in Rekordbox: select the songs → **Reload Tag**.
- Optionally (a checkbox in the confirmation): also write the other fields MCO knows into empty
  file fields only — never over what's there.

### Cue points (after Hot cues and loops)
- Each MCO cue goes in the XML as a `POSITION_MARK`: hot cues `Num` 0–7 (A–H) with their colour
  (`Red`/`Green`/`Blue`) and name; memory cues `Num="-1"`; loops `Type="4"` with `End`. Times in
  seconds, 3 decimals.
- MP3s: other decoders can place a time 20–50 ms differently (encoder delay / LAME header
  handling). Phase 0 measures Rekordbox against MCO on real MP3s; if they differ, MCO corrects the
  times on export.
- No beat grid (`TEMPO`) is written: Rekordbox analyses its own, and a cue doesn't need one.

## How it works (planned)
- `electron/main/rekordboxExport.ts` grows options (`genreFrom`, `grouping`, `onlyChangedSince`,
  energy in comments, cues) and stays a pure DB → XML function with tests.
- Change tracking: a `tracks.changed_at` column, set by every write that matters to Rekordbox
  (`tracks:writeTags`, tag add/remove/rename for the songs affected, analysis done, cue edits,
  scan adding a song). Config remembers `rekordboxExportFile` and `rekordboxExportedAt`.
- Bulk Genre write: a main-process loop over `tagWriter.ts` (one file at a time, cancellable,
  progress over IPC), returning the post-write tags so the store patches locally (the repo's
  convention).
- Cues come from the Hot cues feature's `track_cues` table.

## Phases
0. **Probe Rekordbox 7.2.7 (S)** — on a copy of the library: import an XML where a track already
   in the collection has a changed title, genre, BPM, key and two hot cues; record what Rekordbox
   overwrites, skips or asks about (and whether a preference changes it); check **Reload Tag** on
   a file whose Genre MCO wrote; measure MP3 cue offsets. Write it up in
   `docs/research/rekordbox-xml-import.md`. The rest of this spec is adjusted to what it finds.
1. **Repeatable export (M)** — export file remembered, *Update Rekordbox*, Genre/Grouping/Comments
   options, changed-only export with `changed_at`, the summary with the Rekordbox steps.
2. **Tags into the files' Genre (M)** — the batch write with confirmation, progress, summary.
   Wider format support comes with roadmap *Tag writing for FLAC and ID3v2.2*.
3. **Cue points (S, after Hot cues and loops)** — `POSITION_MARK`s, MP3 offset correction if phase
   0 needs it.

## Tests (planned)
- `rekordboxExport.test.ts`: Genre from Tags / from the file, Grouping, Energy in Comments,
  changed-only (unchanged songs out, playlists whole), `POSITION_MARK` for hot cues, memory cues
  and loops (colours, numbering, decimals).
- Change tracking: each write that matters sets `changed_at`; ones that don't (play count,
  selection) leave it.
- Bulk Genre write: Genre text from Tags/Subtags, songs without Tags untouched, skipped formats
  counted, cancel stops between files, a failing file restored and reported (on synthetic files,
  like `tagWriter.test.ts`).
- In Rekordbox (BETA): phase 0's checks again on the built feature.

## Limits & open questions
- Depends on phase 0: if Rekordbox doesn't update tracks it already has from the XML, metadata goes
  through file tags + Reload Tag, and cues may only arrive for songs not yet in Rekordbox (or after
  removing and re-importing them, which loses Rekordbox's own cues and play history — not
  something MCO should suggest lightly).
- One-way: changes made in Rekordbox (its cues, ratings, colours, comments) don't come back to
  MCO; playlists do, through the import ([Playlists](playlists.md)).
- Absolute paths: songs are matched by path, so a moved collection loses the link (roadmap
  *Portable library*).
- Genre text: comma-separated like *Use tags*. Should Subtags go in Genre too, or only in
  Grouping when that option is on?
- Ratings, colours and labels: MCO doesn't keep them, so the XML leaves them out and Rekordbox's
  stay as they are (if phase 0 shows an import doesn't blank them).
