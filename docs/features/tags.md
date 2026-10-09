---
status: shipped
updated: 2026-10-08
adrs: [0008, 0030]
---
# Tags

MCO has its own two-level tag system, independent of the files' ID3 genre
tag: **genres** and, under each genre, **sub-genres**. Tags are stored in
the database only — files on disk are never modified by tagging. (The file's
own tags are separate and editable: see [ID3 tags](id3-tags.md); its **Use
tags** button copies your Tags and Subtags into the file's Genre.)

## Tagging a track

In the detail panel, add or remove genres and sub-genres for the selected
track. A sub-genre needs its parent genre, so removing a genre also
removes that genre's sub-genres from the track. New genres and sub-genres
can be created inline.

If the file has an ID3 genre that isn't one of your genres yet, the panel
offers it as a one-click suggestion.

**Names are the same whatever their capitals**: a Tag can't be called `house` while `House`
exists, and a Tag can't have two Subtags that differ only that way (two Tags can each have a
*Deep*). Creating or renaming to a taken name is refused with a message naming the one that's
there; changing only the capitals of a name is an ordinary rename. Checked in `tags.ts`
(`TagNameTakenError`) and kept by unique indexes (`COLLATE NOCASE`). A collection that already
holds two such names keeps both — nothing is merged — and goes without the index.

**Suggested from its playlists**: under the Tag and Subtag boxes, the panel suggests the Tags
and Subtags named in the playlists the track is in, and not on it yet — a track in
`2022-08-HOSPICE-DUBTECHNO-120` gets **+ Dub Techno**.
- Only Tags and Subtags you already have are suggested; no new Tag is made up from a playlist's
  name. Folder names aren't looked at.
- A name counts when the playlist's name has it as whole words, whatever the case, accents or
  separators: *UK Garage* is in `2023-UK-GARAGE` and in `ukgarage set`; *Dub* isn't in
  `Dubstep classics`. One-letter names never match.
- A Subtag shows with its Tag (`Dub › Steppers`); clicking it adds the Tag too when the track
  doesn't have it. When two Tags have a Subtag of the same name, only the one whose Tag the
  track has, or the playlists also name, is suggested.
- A click adds it — the same as choosing it in the box; nothing is added on its own. The
  tooltip names the playlists it comes from. The row is hidden when there's nothing to suggest,
  and follows changes to the track's playlists and tags at once.
- How: `suggestTagsFromPlaylists` (`src/state/playlistTagSuggestions.ts`, pure), fed by the same
  per-track read as the panel's Playlists section (`playlists:forTrack`, read once in
  `DetailPanel`); the row is `PlaylistTagSuggestions` in `src/components/detail/TrackPlaylists.tsx`.
  The `tags:*` handlers are in `electron/main/ipcTags.ts`.

## Managing tags

In the **Tags** (genres) and **Subtags** tabs of the left panel,
right-click a tag to:

- **Rename** it (shows how many tracks are affected);
- **Choose color…** — pick one of 12 colours, a **Custom…** one, or
  **No colour**. In the table, a tag's badge is filled with its colour
  and a subtag's is outlined in its own. New tags and subtags get a
  colour automatically: the palette colour fewest of them use, so they
  come out different;
- **Delete** it — a toast offers **Undo** for 8 seconds, which recreates
  the tag (with its colour) and all its track assignments (for a genre,
  its sub-genres too).

## Filtering by tag

In the Tags tab, each tag with subtags has a chevron to show or hide them, like the folder tree;
the open ones are remembered, they start collapsed, and **Collapse all** (in the header) closes them
all. A collapsed tag shows how many of its subtags are ticked.

Check tags in the Tags or Subtags tab to filter the table. The **OR / AND**
switch picks between "tracks with any selected tag" and "tracks with all
selected tags". The selection shows as a chip above the table ("Dub or
House", "Deep in House"); its × unticks everything. Switching between
Folders, Tags and Subtags resets the selection; opening Filters doesn't
([ADR 0030](../adr/0030-filters-combine-with-sidebar-views.md)).

The table has separate **Tags** and **Subtags** columns (Tags filled with
their colour, Subtags outlined), each sortable.

Code: `src/components/TagTree.tsx`, `SubtagTree.tsx`,
`src/state/tagFilter.ts`.

## Batch tagging

Check several tracks in the table (shift-click checks a range). The batch
bar then lets you add a genre or sub-genre to all of them at once, or
analyse them. Batch adds are additive only — they never remove existing
tags — and adding a sub-genre also adds its parent genre.

Code: `src/components/BatchTagBar.tsx`, `electron/main/tags.ts`.

## Export / import

**Settings → Import & export → Tag data** exports every genre, sub-genre and track
assignment to a JSON file, and imports one back. Import is additive: it
creates missing tags and adds assignments to tracks whose **path** matches
exactly; unmatched tracks are counted as skipped.

Code: `electron/main/tagExport.ts`.

## Tests
- `src/state/playlistTagSuggestions.test.ts`: whole words, case/accents/separators, what the
  track already has, a Subtag with its Tag, Subtags of the same name, the playlists listed.
- `src/state/tagFilter.test.ts`, `electron/main/tags.test.ts`, `tagExport.test.ts`.
