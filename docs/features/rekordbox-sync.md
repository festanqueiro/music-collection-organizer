---
status: in-progress
updated: 2026-10-01
adrs: [0052, 0051, 0050, 0028, 0026, 0008, 0004]
---
# Rekordbox sync (two-way, through XML)

## What it does
Keeps Rekordbox and MCO in step in both directions. You export your collection from Rekordbox
(**File → Export Collection in xml format**, to a file MCO remembers), press **Sync with
Rekordbox** in MCO, and a wizard lists every difference it found, grouped as **findings**:

- **Playlists**: in Rekordbox and not in MCO, in MCO and not in Rekordbox, or in both with
  different songs or order;
- **Music info**: title, artist, album, year, genre ↔ MCO Tags, comments, BPM, key;
- **Cue points**: hot cues (and later memory cues and loops) added, moved, recoloured or removed
  on either side;
- **Files**: songs one side has and the other doesn't, files that are missing, and files that
  moved.

Changes made on only one side since the last sync are carried over on their own (listed, and
reversible before applying). Where both sides changed the same thing differently, the wizard
asks — like a merge conflict — showing Rekordbox's value next to MCO's, with *Use Rekordbox's*,
*Keep MCO's*, *Merge* (playlists), *Decide later* and *Always ignore*, one by one or for a whole
group. Then MCO applies its side (database, and file tags when you chose so) and writes the
changes for Rekordbox into the XML file Rekordbox reads, with a short list of the steps left in
Rekordbox.

Rekordbox's own database is never opened or written: the XML export and import, and the files'
own tags, are the only channels
([ADR 0052](../adr/0052-two-way-rekordbox-sync-with-a-merge-wizard.md), building on
[ADR 0050](../adr/0050-playlists-in-mco-imported-from-rekordbox-xml.md) and
[ADR 0051](../adr/0051-update-rekordbox-through-xml-and-file-tags.md)). The user's own library
(2,777 tracks, 111 hot cues, 24 playlists, Genre on 6%, store text in Comments on 86%) is
described in [research](../research/rekordbox-collection.md); the examples below come from it.

## Behaviour (planned)

### The two files
- **From Rekordbox** — the collection XML Rekordbox exports. MCO remembers its path, watches it,
  and shows a dot on **Sync with Rekordbox** when it's newer than the last sync ("Rekordbox
  exported changes 5 min ago").
- **To Rekordbox** — the XML Rekordbox reads as its "rekordbox xml" library
  (`bridgeImportedLibraryFile` in `rekordbox3.settings`; on this Mac
  `~/Library/rekordbox/rekordbox/rekordbox.xml`). MCO suggests that path and reads only that key
  (the settings file also holds login tokens). Never the same file as the one from Rekordbox.
- First run: a short setup page with the two paths and the one-time step in Rekordbox (show the
  "rekordbox xml" tree: *View → rekordbox xml*, if hidden).

### How a difference becomes a finding (three-way)
Two sides alone can't tell who changed what: a title that differs may have been fixed in
Rekordbox or in MCO. So each sync stores a **snapshot** — the values both sides agreed on — and
the next sync compares three things per item: snapshot, Rekordbox now, MCO now.

| Rekordbox vs snapshot | MCO vs snapshot | Result |
|---|---|---|
| same | same | nothing |
| changed | same | **from Rekordbox** — taken into MCO (pre-ticked) |
| same | changed | **from MCO** — written for Rekordbox (pre-ticked) |
| changed | changed, same value | nothing (both did it) |
| changed | changed, differently | **conflict** — you choose |

- **First sync** (no snapshot): every difference is a conflict, but grouped so a few bulk choices
  settle most of it ("For all 2,611 songs with no genre in Rekordbox: use MCO's Tags").
- Items you mark *Always ignore* (a playlist, a song, or a field on a song) are remembered and
  skipped from then on; Settings lists them so they can be un-ignored.

### Matching songs
- By file path first (decoded `Location`, NFC, then case-insensitive — as the playlist import).
- Rekordbox's `TrackID` is kept in the snapshot, so a song whose path changed in Rekordbox (it
  relocated the file) is still recognised — if phase 0 shows `TrackID` is stable between exports.
- Not matched by path or id: by file name + size, then title + artist + duration (±1 s), offered
  as a **likely the same file** finding, never assumed.

### Findings, by group
**Playlists** (matched by their name path, e.g. `2026 / 2026-MYSTIC FYAH STARTERS`)
- *Only in Rekordbox* → **Bring into MCO** (under a **Rekordbox** folder or where it was, as the
  import does today) · *Ignore*. E.g. the user's 24.
- *Only in MCO* → **Send to Rekordbox** (in the XML under **MCO Playlists**) · *Ignore* · or, if it
  had been synced before, **Delete in MCO too** (it was deleted in Rekordbox).
- *In both, different* → the song-level diff, side by side: songs added on each side, removed on
  each side, order changed. **Merge** takes every add, applies every removal, and keeps the order of
  the side that reordered (asks if both did). Or *Use Rekordbox's* / *Keep MCO's* whole.
- *Looks renamed*: a playlist gone on one side and a new one with ≥ 80% of the same songs on the
  same side → offered as a rename, not a delete + add.
- Songs a playlist lists that aren't in the collection (the user's KIOSK-DUB sets point at
  "Imported from Device") show inside the finding, with a link to the Files finding for them.

**Music info** (per song, per field)
- Title, Artist, Album, Year, Comments, BPM, Key; Rekordbox's Rating, Colour and PlayCount are
  shown but not synced (MCO doesn't keep them).
- A field change from Rekordbox goes into MCO's database and, for the file-tag fields, **into the
  file** when the finding says so (the wizard shows "writes the file" next to it; explicit, per
  [ADR 0028](../adr/0028-suggest-never-auto-write-file-tags.md) as refined by ADR 0052). Formats
  MCO can't write yet (FLAC, M4A, ID3v2.2) update the database only, and the finding says so.
- **Genre ↔ MCO Tags**: Rekordbox's Genre text is split on `,` `/` `;` into names and matched to
  MCO Tags/Subtags case-insensitively. Unknown names are offered as *Create tag "Junlge"* /
  *Map to an existing tag ("Jungle")* / *Ignore this name* — a mapping remembered for next time.
  Going the other way, Genre becomes the song's Tags then Subtags ("Dub, Steppers").
- **Comments**: MCO's Tags are appended to Rekordbox's comment ("Visit …bandcamp.com · Tags:
  Dub"), never replacing it; the appended part is recognised on the way back and not taken as a
  comment edit.
- BPM/key: differences under 0.05 BPM, or the same key in another notation (`Fm` = `4A`), are not
  differences.
- Bulk choices per field: "Titles: use Rekordbox's for all 12", "BPM: keep MCO's for all".

**Cue points** (per song)
- Compared as sets: same slot (A–H) at the same time (±10 ms) and colour is the same cue. Shown
  on both waveforms side by side (Rekordbox's in its colours), with the differing ones marked.
- *Only in Rekordbox* (the user's 111 hot cues on 76 songs, at first) → **Bring into MCO**.
  *Only in MCO* → **Send to Rekordbox**. *Same slot, different time or colour* → conflict.
  *Removed on one side since the snapshot* → removed on the other (pre-ticked).
- Colours stay in Rekordbox's hot-cue palette, so a cue keeps its colour both ways.
- MP3s (8 of the user's tracks): other decoders can place a time 20–50 ms differently; phase 0
  measures it and MCO corrects times both ways if needed.
- MCO needs somewhere to keep cues before the full Hot cues feature exists: the sync brings the
  `track_cues` table and shows cues as markers on the waveform; pads, keys and MIDI come with
  *Hot cues and loops*.

**Files**
- *In Rekordbox, not in MCO* — inside the collection folder → **Scan now**; outside it (the
  user's "Imported from Device", Downloads: ~190 songs) → **Copy into the collection** (into a
  chosen folder, then rescan and relink the playlists) · *Ignore*.
- *In MCO, not in Rekordbox* → **Send to Rekordbox** (in the XML's COLLECTION, so Rekordbox can
  import them) · *Ignore*.
- *Missing on disk* (either side lists a path that doesn't exist) with a **likely the same file**
  elsewhere → **Relink in MCO** (the track row keeps its tags, cues and playlists,
  [ADR 0004](../adr/0004-never-delete-track-rows.md)) and, for Rekordbox, the steps to relocate it
  there (right-click → *Relocate*), since an XML can't move a Rekordbox track.
- *Missing on disk, nothing similar* → listed, with *Remove from MCO's playlists* /
  *Keep* / *Ignore*.

### The wizard
```
┌ Sync with Rekordbox — exported today 21:04 ───────────────────────────────┐
│ Playlists 9 · Music info 214 · Cue points 76 · Files 190    [Apply 312 ▸]│
├───────────────┬───────────────────────────────────────────────────────────┤
│ ▸ Playlists 9 │ 2026 / 2026-MYSTIC FYAH STARTERS          conflict         │
│   Conflicts 2 │   Rekordbox            │  MCO                              │
│   From RB 5   │   + Keety Roots – Up…  │  + Dubkasm – Kings Music          │
│   From MCO 2  │   – O.B.F – Momentum   │                                   │
│ ▸ Music info  │   order changed        │  order unchanged                  │
│ ▸ Cue points  │ ( ) Use Rekordbox's  ( ) Keep MCO's  (•) Merge  ( ) Later  │
│ ▸ Files       │                                   [◂ Prev]  [Next ▸]       │
└───────────────┴───────────────────────────────────────────────────────────┘
```
- Left: groups and their counts (conflicts first). Right: one finding at a time, or a table for
  bulk choices (select rows → *Use Rekordbox's*). Keyboard: ↑↓ to move, R / M / G (merge) / L.
- Nothing is written until **Apply**. Before applying: a summary (MCO: N database changes, F
  files written, P playlists; Rekordbox: songs, playlists and cues in the XML) and *Back*.
- Apply: a database backup first (the daily-backup mechanism, on demand); MCO's changes in one
  transaction; file writes one by one with progress, a failure reported and skipped, not fatal;
  then the XML for Rekordbox; then the new snapshot (only for items actually applied — skipped
  and *Later* items keep the old snapshot so they come back next time).
- **Undo last sync** (Settings → Rekordbox) restores MCO's database from that backup and puts back
  the old file tags from a journal kept with it. Rekordbox-side changes can't be undone from MCO.
- After applying, the steps left in Rekordbox, as a checklist: refresh the "rekordbox xml" tree;
  import the listed songs (to update their info and cues) and playlists; delete the playlists
  listed as deleted in MCO (an XML can't delete); relocate the listed files.

### Rekordbox's side, honestly
What an XML import into Rekordbox does to things it already has decides how much of "to
Rekordbox" is automatic. Phase 0 measures it; until then the spec assumes:
- **New songs, playlists, cues on songs Rekordbox doesn't have** — arrive by importing.
- **Info and cues of songs Rekordbox already has** — updated by importing them again *if* phase 0
  shows Rekordbox overwrites; if not, file-tag fields go through the files + **Reload Tag**, and
  cue changes on existing songs become a checklist item.
- **A playlist that exists in both** — importing may create "name (2)" instead of updating; if so,
  MCO names its version "name (MCO)" and the checklist says to replace the old one.
- **Deletions** (playlists, songs, cues) — never possible through the XML; checklist items.

## How it works (planned)
- **Reading**: `electron/main/rekordboxXml.ts` grows a full reader — every `TRACK` attribute,
  `TEMPO` and `POSITION_MARK`s, and the playlist tree — streaming, since a collection XML is a few
  MB per thousand songs.
- **Diff engine** (pure, `src/state/rekordboxSync/`): `diffSync(snapshot, rekordbox, mco,
  ignores) → Finding[]`, each finding with its group, item, base/Rekordbox/MCO values, the
  automatic choice and the allowed ones; helpers for playlist diff/merge (adds, removals, order),
  cue set comparison, genre ↔ tags mapping, rename and likely-same-file detection. All tested
  without a database.
- **Snapshot** (DB): `rekordbox_sync(id, synced_at, from_file, to_file)`, `rekordbox_snapshot_tracks
  (track_id, rb_track_id, path, fields_json, cues_json)`, `rekordbox_snapshot_playlists
  (name_path, track_paths_json)`, `rekordbox_ignores(kind, key, field)`, `rekordbox_genre_map
  (name, genre_id | subgenre_id | ignored)`.
- **Cues**: `track_cues(track_id, kind 'hot'|'memory'|'loop', slot, start, end, color, name)` —
  the table *Hot cues and loops* builds on.
- **Applying**: MCO side in `electron/main/rekordboxSync.ts` (playlists via `playlists.ts`, file
  tags via `tagWriter.ts`, cues, relinks); Rekordbox side by `rekordboxExport.ts` writing only the
  songs/playlists the sync chose (plus everything else unchanged, so the file stays a whole
  collection), with Genre from Tags, Comments appended, cues.
- **Renderer**: `src/components/RekordboxSyncWizard.tsx`; IPC returns findings in pages (a first
  sync can have thousands) and applies a list of decisions.

## Phases
0. **Probe Rekordbox 7.2.7 (S)** — on a copy of the library: re-importing a song it has (changed
   title, genre, BPM, key, two hot cues: overwritten, skipped or asked?), re-importing a playlist
   with the same name, `TrackID` across two exports and after *Relocate*, Reload Tag on a file
   whose Genre MCO wrote, MP3 cue offsets. **Ready to run:** `npm run rekordbox:probe` makes the
   test XML from your export; the checklist and results table are in
   [research/rekordbox-xml-import.md](../research/rekordbox-xml-import.md). Adjusts everything
   below.
1. **Read-only report (M)** — the full reader, the matching, the diff engine, and the wizard
   showing findings without applying anything (first sync = everything as conflicts). Already
   useful: what differs, what's missing where.
   **Built (PR #99):** Settings → Import & export → **Compare with Rekordbox…** reads the export
   (`readRekordboxCollection` in `rekordboxXml.ts`), compares it with MCO
   (`electron/main/rekordboxCompare.ts`: `compareWithRekordbox`, `loadMcoSide`; IPC
   `rekordbox:compare`, the file remembered as `rekordboxCompareFile`) and shows the four groups in
   `src/components/RekordboxReportView.tsx`, read-only:
   - *Playlists*: different (songs only on each side, order), only in Rekordbox, only in MCO (and
     imported ones gone from Rekordbox), the same — matched by name path, imported ones by
     `source_path`; songs not in the collection counted.
   - *Music info*: per field, how many songs differ and the first 400 rows (Song / Rekordbox / MCO).
     Title falls back to the file name as Rekordbox does; Genre is compared with MCO's Tags then
     Subtags as a set of names (case, order and `,` `/` `;` ignored); BPM differs only beyond ±0.5,
     also at half/double time; keys compared as Camelot codes in any notation.
   - *Cue points*: songs whose cues differ — only in Rekordbox, only in MCO, or different (same
     slot, time within 10 ms and colour count as the same) — with both sides' cues; **Bring
     Rekordbox's cues into MCO** copies them for songs with none in MCO ([Hot cues](hot-cues.md)).
   - *Files*: outside the collection folder, in it but not scanned, gone from disk, only in MCO,
     missing in MCO.
   Still to do for phase 1: no snapshot yet (every difference is two-sided), and no paging past
   400 rows per group.
2. **Apply to MCO (M)** — playlists in and merged, music info into the DB and files, genre ↔ tags
   mapping, relinks, `track_cues` with cues on the waveform; backup, journal, Undo last sync; the
   snapshot.
3. **Apply to Rekordbox (M)** — the targeted XML for Rekordbox, the checklist, the watch on the
   exported file. Two-way from here.
4. **Polish (S–M)** — rename detection, likely-same-file, copy-into-collection for outside songs,
   MP3 cue correction, bulk-choice shortcuts.

The one-way items planned before (a remembered export file, Tags as Genre/Grouping, Comments
appended, a batch "write Tags to the files' Genre" for Reload Tag) fold into phases 2–3.

## Tests (planned)
- Diff engine: every row of the three-way table, first sync, ignores; playlist diff/merge (adds
  and removals on both sides, one or both reordered, rename detection); cues (same within 10 ms,
  moved, recoloured, removed since snapshot); genre splitting and mapping; BPM/key tolerance and
  notations; Comments with the appended Tags round-tripping.
- Reader: the user's real export shape (2,777 tracks, multiple `TEMPO`s, `POSITION_MARK`s) — a
  trimmed, anonymised fixture.
- Apply: transaction rollback on a DB error, a failing file write skipped and journalled, Undo last
  sync restoring DB and tags, the snapshot covering only applied items.
- In BETA: a first sync against the user's library (expected: ~2,600 genre findings as one bulk
  choice, 111 cues from Rekordbox, ~190 songs outside the collection, 8 thin playlists), then a
  change on each side and a second sync showing only those.

## Limits & open questions
- Everything about "to Rekordbox" on things Rekordbox already has depends on phase 0.
- My Tags, ratings, colours and Rekordbox's play history aren't synced (MCO doesn't keep them;
  My Tags aren't in the XML).
- Beat grids stay Rekordbox's: MCO reads them (for cue display) but never sends one.
- Absolute paths: songs are matched by path first, so moving the whole collection needs the
  likely-same-file pass until roadmap *Portable library*.
- Should a song's Subtags go into Genre too, or into Grouping (unused in the user's library)?
- Should *Copy into the collection* move or copy the "Imported from Device" files?
