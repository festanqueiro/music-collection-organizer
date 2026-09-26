---
status: accepted
date: 2026-08-21
---
# 0011. Back up the database and settings daily with `VACUUM INTO`

## Context
The DB holds months of tagging work. A consistent copy of a live SQLite file can't be made with a
plain file copy.

## Decision
Once a day (checked at launch and hourly) snapshot the DB with `VACUUM INTO` plus `config.json` into
`<userData>/backups/`, keeping the last 30. **Back up now** and **Restore** (replace and relaunch)
are in Settings. Failures are shown there, not silently dropped.

## Consequences
- Backups are small and consistent, but live on the same Mac — hence
  [ADR 0033](0033-external-backup-to-another-disk.md) for another disk.
- `VACUUM INTO` runs on the main thread; fine at current sizes (roadmap watch list).
