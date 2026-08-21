# Future TODO

Longer-term ideas — improvements or features that could help the app
overall, not urgent bugs (see `TODO.md` for those) and not yet scoped for
active work. A grab-bag to draw from when picking the next thing to build,
not a commitment list.

## Explicitly deferred from the v1 spec

- **Rekordbox read/write integration** — noted in the v1 design spec as
  future work once the local-collection foundation is solid.
- **Playlist creation/export.**
- **Multiple collection folders** — v1 supports exactly one at a time.
- **Fuller DJ mixing/deck features** — v1's player is a simple preview
  player only (play/pause/seek), not a mixing surface.

## Backup/settings follow-ups

- **Restore from a backup.** The backup feature is currently write-only —
  there's no UI or IPC path to actually restore `collection.db`/the config
  store from one of the timestamped snapshots. Worth adding once there's
  been a real need to restore one.
- **Backup pruning/retention.** Currently backups accumulate forever by
  design (explicit v1 decision). If a `<userData>/backups/` folder ever
  gets unwieldy in practice, add an optional cap (e.g. keep the last N, or
  the last N days).
- **Surface backup failures in the UI.** Right now a failed backup only
  logs to the console (`console.error`) — the Settings modal can't
  currently distinguish "never backed up" from "backup is broken."

## Collection/library features

- **Batch tag editing** — select multiple tracks in the table and apply a
  genre/sub-genre/mood to all of them at once, instead of one at a time via
  the detail panel.
- **Export/import the collection's tag data** (genres, sub-genres, moods,
  and their track assignments) as a portable file — useful for migrating
  between machines, or as a lighter-weight alternative to a full DB backup
  for just the tagging work.
- **Keyboard shortcuts** — space to play/pause the selected track, arrow
  keys to move through the track table, etc.
- **Undo for destructive tag operations** — `deleteGenre` cascades to
  sub-genres and every track's tag assignment with only a confirm() dialog
  as a safety net; an undo (even a short-lived one) would be friendlier.

## Platform/infra

- **Windows/Linux support.** v1 is explicitly macOS-only (the cloud-only
  detection heuristic, in particular, is tuned to APFS/Google Drive for
  Desktop's macOS behavior and would need revisiting).
- **React component test coverage.** No `@testing-library/react` (or
  similar) is set up — all UI component correctness is currently verified
  by manual `npm run dev` walkthroughs. Worth adding if UI regressions
  start slipping through.
- **`node:sqlite` stability watch** — still flagged experimental in the
  Node versions this app currently targets; keep an eye on it as
  Electron/Node versions move forward (already noted in `TODO.md`).
