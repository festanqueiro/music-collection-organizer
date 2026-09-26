# Tags

MCO has its own two-level tag system, independent of the files' ID3 genre
tag: **genres** and, under each genre, **sub-genres**. Tags are stored in
the database only — files on disk are never modified.

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
- **Choose color…** (genres) — the colour is used for the tag's badges;
- **Delete** it — a toast offers **Undo** for 8 seconds, which recreates
  the tag and all its track assignments (for a genre, its sub-genres too).

## Filtering by tag

Check tags in the Tags or Subtags tab to filter the table. The **OR / AND**
switch picks between "tracks with any selected tag" and "tracks with all
selected tags". Switching left-panel tabs resets the filter.

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
