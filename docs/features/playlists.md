---
status: planned
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
- When the sidebar is collapsed to its icon strip, the box collapses to a playlist icon that
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
- Rename is inline (F2 or the menu); names don't have to be unique, but siblings with the same
  name get a warning when importing (see below).

### Adding and removing songs
- Drag rows (one or the checked batch) onto a playlist in the box; it lights up on hover. A
  toast says "Added N songs to *name*" (songs already in it are added again only if the user holds
  ⌥ — by default duplicates are skipped and the toast says how many).
- Row right-click → **Add to playlist ▸** (recent playlists first, then the tree, then *New
  playlist…*). The batch bar gets the same **Add to playlist** button.
- While viewing a playlist: **Remove from playlist** in the row menu and ⌫ (Delete) on the
  selected/checked rows (undo toast); drag rows to reorder (only when sorted by `#`).
- Deleting a song's file to the Trash removes it from every playlist.

### Import from Rekordbox
- *Import from Rekordbox…* explains the one step in Rekordbox (**File → Export Collection in xml
  format**) and opens a file picker (it remembers the last file's folder). MCO reads that XML
  ([ADR 0050](../adr/0050-playlists-in-mco-imported-from-rekordbox-xml.md)); it never reads or
  writes Rekordbox's own database.
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
  then case-insensitively. Unmatched songs are skipped, and counted per playlist in the summary.
- Intelligent (smart) playlists come in with the songs Rekordbox listed at export time, as normal
  playlists.

## How it works (planned)
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
- **Naming**: in the code `playlist` already means the **queue** (`store.playlist`,
  `src/state/playlist.ts`). The new feature uses `playlistNodes` / `PlaylistNode` /
  `savedPlaylist*`; renaming the queue's code to `queue` is a separate refactor.

## Phases
1. **Playlists in MCO** — DB, the box, create/rename/delete (with confirmation)/folders, viewing a
   playlist in order, Play playlist / Add to queue, add songs by drag and menu, remove. (M)
2. **Rekordbox import** — XML parser, match, summary dialog, refresh, Keep as my own. (M)
3. **Polish** — drag to reorder rows and nodes, ⌥ duplicates, playlists in MCO's Rekordbox export
   (today it exports tags as playlists), the collapsed-sidebar icon. (S–M)

## Tests (planned)
- `rekordboxXml.test.ts`: folders/playlists tree, both KeyTypes, URL-decoding of `Location`
  (spaces, `%20`, non-ASCII, NFD), empty folders, smart playlists.
- `playlists.test.ts` (against a temp DB): CRUD, positions after move/reorder/remove, cascade on
  track delete, refresh (matched replaced, new added, gone kept, MCO-made untouched, detached
  skipped), duplicates skipped.
- Store: selecting a playlist clears folder/tag selection; Play playlist replaces the queue and
  undo restores it.
- In BETA: import this Mac's Rekordbox 7.2.7 export (`DJ_COLLECTION_RECORDBOX`), check counts
  against Rekordbox.

## Limits & open questions
- Reading Rekordbox's `master.db` directly (no export step) is left out: it's SQLCipher-encrypted
  and `node:sqlite` can't open it — see the ADR.
- Absolute paths: a collection moved to another path breaks matches (roadmap Next #2), as it does
  for tags.
- Should *Play playlist* also be offered on the row menu when viewing a playlist ("Play from
  here")? Proposed for phase 3.
- Export MCO playlists back to Rekordbox (via the existing XML export) is phase 3; two-way sync is
  out of scope.
