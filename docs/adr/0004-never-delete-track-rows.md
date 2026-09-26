---
status: accepted
date: 2026-08-20
---
# 0004. Never delete track rows on a scan; hide missing files instead

## Context
Deleting a `tracks` row cascades and destroys every tag assignment on it. A scan can miss files for
harmless reasons: a drive not mounted yet, a Google Drive sync in progress, a folder moved and moved
back, a different collection folder picked.

## Decision
A scan never deletes rows. Files it can't find are flagged `present = 0` and hidden from the
renderer; if the same path is found again, the row is revived with its tags, play counts and
analysis. The same applies to deleting a track from MCO ([ADR 0031](0031-delete-moves-to-trash.md)).

## Consequences
- Tags survive unmounted drives and temporary moves.
- Tracks are keyed by absolute path, so a collection moved to a *different* path looks new (see the
  roadmap's "portable library" idea).
- Rows for long-gone files accumulate; harmless at current sizes.
