---
status: accepted
date: 2026-09-26
---
# 0033. Back up the collection to a folder on another disk, incrementally, never deleting

## Context
Daily backups ([ADR 0011](0011-daily-database-backups.md)) cover only the DB and settings, on the same
Mac. The user wanted the collection's files backed up too, to an external disk that can't be the
collection's own disk.

## Decision
**Settings → Backups & data → Backup to an external disk** (`electron/main/externalBackup.ts`):
- the destination must be on a different device (`st_dev`) from the collection folder, not inside it
  (nor containing it), and writable — the collection on Google Drive is on the internal disk, so any
  folder on the Mac is refused;
- a consistent DB + settings snapshot (last 10 kept) and every file in the collection folder go under
  `MCO Backup/`; hidden files and the `.mco` folder are skipped;
- incremental by size + mtime (2 s slack for exFAT/FAT), copied under a temporary name and renamed
  when complete; nothing is ever deleted from the backup; cloud-only placeholders are skipped and
  counted; free space is checked first; progress and **Stop** in the UI.

## Consequences
- Removed or renamed collection files stay in the backup (by design); pruning would be a separate
  opt-in.
- Not yet run against a real external disk (2026-09-26).
