---
status: accepted
date: 2026-08-20
---
# 0008. MCO's tags live in the database; batch writes are additive; IPC returns post-write state

## Context
MCO's genre/sub-genre tags ("Tags" and "Subtags") are the core of organising a collection. Writing
them into files would risk the user's DJ files and fight other apps' tags.

## Decision
- Tags are stored only in the DB (`genres`, `subgenres`, `track_genres`, `track_subgenres`).
- Batch and import writes are additive only (`INSERT OR IGNORE`), never delete-and-insert.
- IPC handlers that change tags return the post-write state (`TrackTagIds`), and the store patches
  it in locally instead of reloading everything (`setTrackTags` in `src/state/store.ts`).

## Consequences
- Other DJ software doesn't see MCO's tags, except through the [Rekordbox export](../features/dj-tools.md)
  or by copying them into the file's Genre with [Use tags](../features/id3-tags.md).
- The file's own ID3 genre is shown separately and can be edited ([ADR 0026](0026-write-tags-byte-for-byte.md)).
