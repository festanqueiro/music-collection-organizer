---
status: shipped
updated: 2026-09-26
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
- `src/state/tagFilter.test.ts`, `electron/main/tags.test.ts`, `tagExport.test.ts`.
