---
status: shipped
updated: 2026-09-27
adrs: [0030, 0032, 0027]
---
# Filters

## What it does
The **Filters** view in the sidebar narrows the track table to tracks that mix with the one playing,
that are (or aren't) analysed, that exist more than once, that you haven't tagged in MCO yet, or whose
file is missing its artist or title. Filters combine
with the folder or tag selection and the search.

## Behaviour
- **Compatible** — tracks that mix with the playing track: same Camelot key, one step either way, or
  the relative major/minor; and a BPM within 6 % (or half/double time). Tracks with no BPM yet aren't
  ruled out. Needs an analysed track playing ([DJ tools](dj-tools.md#harmonic-mixing)).
- **Analysed** — All / Analysed / Not analysed (failed analyses count as not analysed). Shows how
  many aren't analysed.
- **Duplicates** — the same song more than once, in any folder or format: same artist and title, or
  the same filename when either tag is missing; case, accents and punctuation ignored. Copies are
  listed next to each other ([ADR 0032](../adr/0032-duplicates-by-normalised-names.md)).
- **MCO tags** — All / **No Tags** (no MCO Tags at all, so no Subtags either) / **No Subtags** (no
  Subtag, with or without Tags). Shows how many tracks each would list.
- **Missing ID3 Metadata** — tracks whose file has no artist **or** no title in its own tags, only the
  filename to go by; selecting one shows tags [suggested from its filename](id3-tags.md#suggestions-from-the-filename).
  Counts only tracks whose tags have been read; while the background read is running it says how many
  files are left. (Called *Untagged* and artist-only until 2026-09-27.)
- Active filters show as chips above the table (× clears one) and as a count on the Filters button,
  also in the collapsed sidebar.
- Opening Filters keeps the folder/tag selection underneath applied (that view stays mounted), and
  filters stay on when you go back to Folders or Tags
  ([ADR 0030](../adr/0030-filters-combine-with-sidebar-views.md)).
- Filters are session-only, like the search.

## How it works
- `src/components/FiltersPanel.tsx`; state `compatibleFilter`, `analysedFilter`, `duplicatesFilter`,
  `mcoTagsFilter`, `missingMetadataFilter` in `src/state/store.ts`; applied in `TrackTable.tsx`'s
  `visibleTracks`; rules in `src/state/trackFilters.ts` (`isMissingId3Metadata`, `matchesMcoTagsFilter`).
- Duplicates: `src/state/duplicates.ts` (over the whole collection).
- Missing ID3 Metadata relies on `tagsRead` (the `tags_read_at` column, [ADR 0027](../adr/0027-read-file-tags-in-background.md)).

## Tests
- `src/state/duplicates.test.ts`, `trackFilters.test.ts`, `harmonic.test.ts`.
- On the user's collection: Duplicates found 5 groups / 10 tracks, all genuine (2026-09-26); Missing ID3
  Metadata 42 tracks, No Tags 2,637, No Subtags 2,641 of 2,643 (2026-09-27).

## Limits & open questions
- Duplicates don't use audio fingerprints: different masters of a song match, and different songs with
  the same name could.
- Energy isn't a filter yet (roadmap).
