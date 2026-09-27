---
status: accepted
date: 2026-09-27
---
# 0040. Update Collection removes missing tracks; background scans only hide them

## Context
[ADR 0004](0004-never-delete-track-rows.md) never deleted track rows, so tags survive unmounted
drives and temporary moves. In practice the Missing Tracks filter fills up with files that are
genuinely gone, with no way to clear them. The user wants a deliberate re-scan to clean them up.

## Decision
The toolbar's **Update Collection** (`scan:run` with `removeMissing`) deletes every missing track
under the collection folder, and its tags (cascade) — whether it went missing now or earlier.
Safeguards:
- only paths under the current collection folder; rows from a previous folder are left hidden;
- nothing is removed when the scan finds no audio files at all (unmounted/unsynced folder, where
  everything would look missing);
- the confirm dialog says missing tracks will be removed, with their tags, and how many are missing.

The folder watcher's background rescans and the scan after picking a new folder still only hide
missing files (ADR 0004).

## Alternatives considered
- A separate "Remove missing tracks" action in the Missing Tracks filter: more explicit, but the
  user asked for the re-scan to do it.
- Removing on every scan: a drive mounted late or a Drive sync in progress would wipe tags silently.

## Consequences
- A file moved *within* the collection loses its tags on the next Update Collection (it's a new
  path) — as it effectively did before, since the old row stayed hidden.
- A partially synced folder (some files present) can still lose the tags of the unsynced ones.
