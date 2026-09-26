---
status: accepted
date: 2026-09-26
---
# 0027. Read every file's tags in the background, not only during analysis

## Context
Title/artist/album/genre/year were only read during analysis, and 2,501 of 2,643 tracks weren't
analysed — so most tracks showed no artist even when the file had one. Worse, the tag editor (1.0.39)
built its form from those empty DB fields, so saving on an unanalysed track would have erased the
file's existing title and artist.

## Decision
A `tags_read_at` column (NULL until read, reset when a scan sees the file change, set by analysis
and by tag writes). `electron/main/tagReader.ts` parses tags only (no cover art, no duration) for
every local track with `tags_read_at IS NULL`, at startup and after scans, and pushes progress to the
renderer. Selecting a track re-reads its file, and the tag editor opens from the file's current tags.

## Consequences
- On the user's collection: ~3.7 min for 2,388 files over Google Drive; tracks with an artist went
  from 267 to 2,483.
- Makes the [Untagged filter](../features/filters.md) and [filename suggestions](../features/id3-tags.md)
  meaningful.
