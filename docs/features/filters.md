---
status: shipped
updated: 2026-09-26
adrs: [0030, 0032, 0027]
---
# Filters

## What it does
The **Filters** view in the sidebar narrows the track table to tracks that mix with the one playing,
that are (or aren't) analysed, that exist more than once, or that have no artist tag. Filters combine
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
- **Untagged** — tracks whose file has no artist tag, only the filename to go by; selecting one shows
  tags [suggested from its filename](id3-tags.md#suggestions-from-the-filename). Counts only tracks
  whose tags have been read; while the background read is running it says how many files are left.
- Active filters show as chips above the table (× clears one) and as a count on the Filters button,
  also in the collapsed sidebar.
- Opening Filters keeps the folder/tag selection underneath applied (that view stays mounted), and
  filters stay on when you go back to Folders or Tags
  ([ADR 0030](../adr/0030-filters-combine-with-sidebar-views.md)).
- Filters are session-only, like the search.

## How it works
- `src/components/FiltersPanel.tsx`; state `compatibleFilter`, `analysedFilter`, `duplicatesFilter`,
  `untaggedFilter` in `src/state/store.ts`; applied in `TrackTable.tsx`'s `visibleTracks`.
- Duplicates: `src/state/duplicates.ts` (over the whole collection).
- Untagged relies on `tagsRead` (the `tags_read_at` column, [ADR 0027](../adr/0027-read-file-tags-in-background.md)).

## Tests
- `src/state/duplicates.test.ts`, `harmonic.test.ts`.
- On the user's collection (2026-09-26): Duplicates found 5 groups / 10 tracks, all genuine; Untagged
  117 tracks; checked in the BETA build.

## Limits & open questions
- Duplicates don't use audio fingerprints: different masters of a song match, and different songs with
  the same name could.
- Energy isn't a filter yet (roadmap).
