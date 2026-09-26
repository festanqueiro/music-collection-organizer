---
status: accepted
date: 2026-09-26
---
# 0031. Deleting a track moves its file to the Trash and hides its row

## Context
Users wanted to delete files from the track details, with confirmation.

## Decision
**Delete** → confirmation (Cancel focused) → `shell.trashItem` (recoverable; in a synced folder the
cloud's trash too). The row is set `present = 0` like any missing file
([ADR 0004](0004-never-delete-track-rows.md)), not deleted, so restoring the file brings the track
back with its tags and play count. The track leaves the queue, the checked set and pre-listen.

## Consequences
- No permanent delete from MCO.
