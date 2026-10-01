---
status: shipped
updated: 2026-10-01
adrs: [0050]
---
# Playlists

## What it does
Named, ordered lists of songs, organised in folders, in a **Playlists** box at the bottom of the
sidebar, under the Folders / Tags / Subtags / Filters views and always visible whichever of them
is open. Click a playlist to see its songs in the table, in the playlist's order; right-click it to
**Play playlist** or **Delete playlist**. Playlists (and their folders) can be brought in from
Rekordbox on this computer, from the XML Rekordbox exports, and importing again refreshes them.

## Behaviour

### The box
- A second section in the left pane, below the current view's tree, with its own header
  **PLAYLISTS**, a **+** menu (*New playlist*, *New folder*, *Import from Rekordbox…*) and a
  collapse chevron. A drag handle between the tree and the box sets the split; the split and
  collapsed state are remembered (localStorage, like the sidebar's view).
- The tree: folders (📁, expand/collapse, remembered) and playlists (a list icon), each playlist
  with its song count dimmed on the right. Sorted as the user ordered them (drag to reorder or
  move into a folder); new ones go to the end of their folder. Rekordbox imports keep
  Rekordbox's order.
- Empty state: "No playlists yet" with *New playlist* and *Import from Rekordbox…* links.
- When the sidebar is collapsed to its icon strip, a playlist icon under the view icons
  reopens the sidebar with the box expanded.

### Viewing a playlist
- Clicking a playlist selects it: the table shows its songs **in playlist order** (a `#` column
  first), with a chip above the table (📃 *name* ×) like the folder chip. Selecting a playlist
  clears the folder/tag selection and vice versa; the search box and Filters still narrow it.
- Sorting by another column works as usual; clicking `#` returns to the playlist's order.
- Songs whose file is missing stay in the list, greyed as elsewhere
  ([ADR 0004](../adr/0004-never-delete-track-rows.md)), and are skipped when playing.

### Right-click menus
- **Playlist**: **Play playlist** (replaces the queue with the playlist from its first playable
  song and starts playing; if the queue has songs waiting, an *Undo* toast brings it back),
  **Add to queue**, **Rename**, **Delete playlist…** (a confirmation: "Delete *name*? Its N songs
  stay in your collection."). Deleting never touches files or tracks.
- **Folder**: **Play folder** (every playlist in it, in order), **New playlist here**, **New folder
  here**, **Rename**, **Delete folder…** (a confirmation naming how many playlists go with it).
- Rename is inline (F2 on the selected playlist, a double-click, or the menu); names don't have to be unique, but siblings with the same
  name get a warning when importing (see below).

### Adding and removing songs
- Drag rows (one or the checked batch) onto a playlist in the box; it lights up on hover. A
  toast says "Added N songs to *name*"; songs already in it are skipped and the toast says how
  many. A playlist holds each song once (see Limits).
- Row right-click → **Add to playlist…** (the three playlists last added to first, then every
  playlist, then *New playlist…*; the recent ones are remembered per computer in localStorage).
  The batch bar has the same **Add to playlist** button for the checked songs, in table order.
- While viewing a playlist: **Remove from playlist** in the row menu.
- **⌫ (Delete) removes** the selected song, or every checked one, from the playlist being viewed,
  with an *Undo* toast ("Removed N songs from *name*") that puts them back in the same places.
  Only in a playlist — elsewhere ⌫ does nothing (it never deletes files).
- **Songs whose file is missing** stay in the list, greyed, and can be removed like any other:
  their right-click menu shows just **Remove from playlist**, and ⌫ works on them.
- **Reorder** by dragging rows up and down while the table is in the playlist's order (not when
  sorted by a column — the *Playlist order* button brings it back — nor with the Duplicates
  filter on). A line shows where they land (top half of a row: before it; bottom half: after);
  dragging checked rows moves them together, keeping their order. Dragging rows out of the table
  still works as before (to Finder, a folder, another playlist): the rows' drag is the same
  native file drag, and a drop on a row is matched back to tracks by path. Songs whose file is
  missing can't be dragged (there's no file to drag), so they stay where they are.
- Deleting a song's file to the Trash removes it from every playlist.

### Moving playlists and folders
- Drag a playlist or folder in the box: onto a folder puts it inside, onto a row's top or bottom
  edge places it before or after, below the tree moves it to the top level. A folder can't go
  inside itself.

### Import from Rekordbox
- *Import from Rekordbox…* opens a file picker (several files at once, opening in the folder the
  last import came from) for any of Rekordbox's
  exports — MCO never reads or writes Rekordbox's own database
  ([ADR 0050](../adr/0050-playlists-in-mco-imported-from-rekordbox-xml.md)):
  - **m3u8** (right-click a playlist → *Export a playlist to a file* → m3u8): file paths, exact
    matches. The best choice for a few playlists.
  - **Text** (same menu → Text): UTF-16, tab-separated, only the columns shown in Rekordbox, no
    paths — songs are matched by title + artist, then title alone when unique, then file name.
  - **XML** (**File → Export Collection in xml format**): the whole tree, folders included.
  A playlist from an m3u8 or text file is named after the file.
- Before anything changes, a summary dialog: the folders and playlists found, how many songs
  matched songs in MCO, how many didn't (outside the collection folder, or not scanned yet), and
  which existing imported playlists will be **refreshed**. *Import* or *Cancel*.
- The Rekordbox tree lands under a top folder **Rekordbox** (created once), mirroring Rekordbox's
  folders and order. Empty folders are kept.
- **Refresh**: importing again matches playlists and folders that came from Rekordbox by their
  path in Rekordbox's tree (e.g. `Sets/2026/Bassin`), replaces a matched playlist's songs with
  Rekordbox's list, adds new ones, and **keeps** ones no longer in the XML (the summary lists
  them, marked "no longer in Rekordbox", so the user can delete them). Playlists made in MCO — and
  anything moved out of the Rekordbox folder — are never touched. A playlist renamed in Rekordbox
  arrives as a new one (the XML has no stable id).
- Edits made in MCO to an imported playlist are overwritten by the next refresh of that playlist;
  the summary says so, and the playlist's menu offers **Keep as my own** (detaches it from
  Rekordbox so refreshes skip it).
- Songs are matched by file path: the XML's `Location` (`file://localhost/…`, URL-encoded)
  decoded, compared to MCO's paths after Unicode NFC normalisation (macOS paths are often NFD),
  then case-insensitively, then paths confirmed in an earlier import (below). Unmatched songs are
  skipped, and counted per playlist in the summary.
- **Songs at a different path** — playlists from an old Rekordbox USB stick list the stick's
  paths (`/Volumes/…/Contents/Artist/Album/…`, file names often cut short), or a file moved since.
  For each song not found by path, MCO looks for the same song in the collection, in order:
  the **same file size** (from the XML's `Size`, or the file itself if the stick is plugged in),
  the **same title and artist** (the XML's, or an m3u8's `#EXTINF` "Artist - Title"), the **same
  file name** — or one Rekordbox shortened (a cut-off name of 12+ characters that starts the
  collection's). Durations must agree within 2 s when both are known; only a single fitting song
  counts, and songs whose file is missing are never suggested.
- These are never used silently: the summary's **Found at a different path** list shows each
  (old file name → collection song, and why), all ticked, with *All* / *None*. Ticked ones are
  imported as the collection's song and **remembered** (`playlist_path_aliases`), so importing
  the same export again matches them by path with no asking; unticked ones are left out and asked
  again next time. Files are never moved or renamed.
- Intelligent (smart) playlists come in with the songs Rekordbox listed at export time, as normal
  playlists.

## How it works
- **DB** (`electron/main/db.ts` migration):
  - `playlist_nodes(id, parent_id NULL, kind 'folder'|'playlist', name, position, source
    'mco'|'rekordbox', source_path NULL, created_at, updated_at)` — one tree for folders and
    playlists; `source_path` is the node's name path in Rekordbox, for refresh matching.
  - `playlist_tracks(playlist_id, position, track_id)` — primary key `(playlist_id, position)`,
    `track_id` references `tracks` (`ON DELETE CASCADE`, which only a Trash delete triggers).
  - Moves and reorders rewrite `position` for one parent in a transaction.
- **Main** (`electron/main/playlists.ts`): CRUD, add/remove/reorder, and `importRekordboxXml(path)`
  returning a plan (the summary) and applying it on confirm. The XML parser
  (`electron/main/rekordboxXml.ts`) reads `COLLECTION/TRACK` (`TrackID` → `Location`) and
  `PLAYLISTS/NODE` (`Type="0"` folder, `Type="1"` playlist; `KeyType="0"` = TrackID keys,
  `"1"` = Location keys). IPC handlers return the post-write tree / track list so the store patches
  locally (the repo's convention).
- **Renderer**: `src/components/PlaylistsBox.tsx` (tree, menus, drop targets, split handle), a
  `selectedPlaylistId` and `playlists` in the store, `TrackTable` taking an ordered id list when a
  playlist is selected.
- **Editing songs** (phase 3): reorder and undo compute the new order in the renderer
  (`src/state/savedPlaylist.ts`: `moveTracksInPlaylist`, `restoreRemovedTracks` — pure, tested)
  and write it whole with `setPlaylistTrackIds` (`playlists:setTracks`), which renumbers
  positions in a transaction and drops ids no longer in the collection. A reorder shows at once
  and rolls back if the write fails. Undo re-reads the playlist and puts the removed songs back at
  their old indexes, keeping anything added since (8 s, one undo toast at a time with the queue's).
- **Naming**: in the code `playlist` already means the **queue** (`store.playlist`,
  `src/state/playlist.ts`). The new feature uses `playlistNodes` / `PlaylistNode` /
  `savedPlaylist*`; renaming the queue's code to `queue` is a separate refactor.

### Export to Rekordbox
- Right-click a playlist → **Export for Rekordbox (m3u8)…**: a save dialog, then an .m3u8 with
  `#EXTINF` (length, "Artist - Title") and each song's file path, in playlist order; missing files
  are left out. Right-click a folder → one .m3u8 per playlist in a chosen folder, named by its path
  in the folder ("2026 - Bassin.m3u8"). In Rekordbox: **File → Import → Import Playlist**.
- MCO's **Rekordbox XML export** (Settings → Import & export, [DJ tools](dj-tools.md)) also
  carries the playlists, under an **MCO Playlists** folder next to the tags' **MCO** folder, in
  their folders and order, without missing or cloud-only songs. Playlists imported from Rekordbox
  are left out (Rekordbox has them) unless kept as one's own, and so are imported folders with
  nothing of MCO's left in them.

## Phases
1. **Playlists in MCO** — DB, the box, create/rename/delete (with confirmation)/folders, viewing a
   playlist in order, Play playlist / Add to queue, add songs by drag and menu, remove. (M)
2. **Rekordbox import** — XML parser, match, summary dialog, refresh, Keep as my own. (M)

Shipped in **1.0.53** (PR #99): phases 1–4, plus m3u8 and text imports, moving playlists/folders,
the m3u8 export and songs found at a different path.

3. **Editing a playlist's songs** — reorder rows by drag, ⌫ to remove with *Undo*, remove
   songs whose file is missing. Built in #99. (S–M)
4. **Polish** — recent playlists first and a batch-bar button for *Add to playlist*, F2 to
   rename, the collapsed-sidebar icon, the import dialog remembering its folder, playlists in
   MCO's Rekordbox XML export. Built in #99. ⌥ to add a duplicate was dropped (see Limits). (S–M)

## Tests
- `rekordboxExport.test.ts`: the MCO Playlists folder — nesting, order, empty folders, missing
  songs and Rekordbox imports left out.
- `rekordboxXml.test.ts`: folders/playlists tree, both KeyTypes, URL-decoding of `Location`
  (spaces, `%20`, non-ASCII, NFD), empty folders, smart playlists.
- `savedPlaylist.test.ts`: moving one or several songs up/down/to the ends, dropping on a moved
  song, unknown ids; undo restoring places, keeping songs added since, no duplicates.
- `playlists.test.ts`, songs at a different path: by size (from the export or the stick's file),
  by title and artist, by a shortened file name; never between two songs, across a duration
  mismatch or to a missing file; only confirmed ones used, and remembered for the next import.
- `rekordboxXml.test.ts`: the XML's per-song hints (Size, TotalTime, Name, Artist) and m3u8
  `#EXTINF` entries.
- `playlists.test.ts` (against a temp DB): rewriting the order (each song once, deleted tracks
  dropped, folders refused), CRUD, positions after move/reorder/remove, cascade on
  track delete, refresh (matched replaced, new added, gone kept, MCO-made untouched, detached
  skipped), duplicates skipped.
- Store: selecting a playlist clears folder/tag selection; Play playlist replaces the queue and
  undo restores it.
- The user's real Rekordbox 7.2.7 collection XML (2,777 tracks, 2026-10-01) through
  `parseRekordboxXml`: the same 24 playlists and the 2026 folder, in order, every song's path
  decoded. By path, 15 playlists are wholly inside the collection folder and 8 point mostly at
  songs outside it (copied from a USB stick) — those will import nearly empty
  ([research](../research/rekordbox-collection.md)).
- In BETA: import that export through the app and check the counts against Rekordbox.

## Limits & open questions
- Reading Rekordbox's `master.db` directly (no export step) is left out: it's SQLCipher-encrypted
  and `node:sqlite` can't open it — see the ADR.
- Absolute paths: a collection moved to another path breaks matches (roadmap Next #2), as it does
  for tags.
- **Each song once per playlist.** Reorder, ⌫ and Undo identify a playlist's songs by track id,
  so the planned ⌥-drag to add a song twice was dropped; it would need songs identified by
  position instead. Rekordbox playlists with a song twice come in with it once.
- Songs whose file is missing can't be dragged to reorder (the rows' drag is a file drag).
- Should *Play playlist* also be offered on the row menu when viewing a playlist ("Play from
  here")? Not built yet.
- Two-way sync with Rekordbox (playlists, music info, cue points, files) is planned separately:
  [Rekordbox sync](rekordbox-sync.md), [ADR 0052](../adr/0052-two-way-rekordbox-sync-with-a-merge-wizard.md).
  Until then playlists go there as m3u8 files or in the XML export.
