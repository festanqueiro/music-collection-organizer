---
status: accepted
date: 2026-08-20
---
# 0007. Keep settings in `electron-store`, separate from the collection database

## Context
Some state is about the app, not the collection: collection folder, FX and MIDI settings, column
order, audio devices, theme, update preferences.

## Decision
`config.json` via `electron-store` (`electron/main/config.ts`) holds app settings. Stored values are
reconciled on read (e.g. a stored column order missing a newer column gets it inserted after the
column it follows by default). Small per-window view preferences (sidebar state, column widths,
visualizer options) live in the renderer's `localStorage`.

## Consequences
- Settings and database move and back up together ([ADR 0009](0009-data-folder-inside-collection.md), [0011](0011-daily-database-backups.md)).
- `localStorage` preferences are per-install and not backed up — acceptable for view state only.
