---
status: accepted
date: 2026-08-22
---
# 0009. Move the database and settings into a `.mco` folder inside the collection

## Context
The collection lives on a synced/external drive and may be used from another Mac. Its tags should
travel with the music, not stay in one Mac's Application Support folder.

## Decision
The first time a collection folder is picked, `collection.db` and `config.json` move into a hidden
`.mco` folder inside it, and the app relaunches (the user is warned first). **Settings → Backups &
data → Change…** can move them anywhere. A move copies, never deletes, and adopts an existing
`collection.db` at the destination instead of overwriting it. The location is kept in a tiny
bootstrap store (`electron/main/bootstrap.ts`).

## Consequences
- Music and tags stay together.
- Tracks are keyed by absolute path, so the collection must land at the same path on another Mac to
  keep its tags (roadmap: portable library).
- The `.mco` folder is skipped by scans, the watcher and [external backups](0033-external-backup-to-another-disk.md)
  (the DB is backed up from a consistent snapshot instead).
