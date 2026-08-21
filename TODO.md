# TODO

## Status

v1 is implemented and live-tested against a real ~2,481-track collection.
The analysis progress indicator and Settings modal with automatic backups
(the two items that were in the repo root's `TODO.IDEAS.md`) are also
implemented. `npx tsc -b --noEmit` (the correct project-references
invocation — plain `tsc --noEmit` is a silent no-op against this
solution-style `tsconfig.json`) is clean, 61/61 tests passing, `npm run
build` succeeds. PR: `v1-library-organizer` branch, #1.

For the full build history (what was fixed and why), see git log and the
SDD ledgers under `.superpowers/sdd/`.

## Outstanding

- `deleteGenre` is implemented/tested but has no UI path to trigger it.
- `TagTree`'s filter closure goes stale after a tag edit — doesn't
  re-apply when `trackTags` changes.
- Track table sort is ascending-only, no direction toggle.
- `folderWalk.ts` has no try/catch around a single unreadable
  subdirectory — one bad folder permission would abort the whole scan.
- The hourly backup-check `setInterval` (`electron/main/index.ts`)
  captures the first `db` handle from `createWindow()` with no cleanup —
  matters if macOS's `activate` event ever re-creates a window while the
  app is still running (pre-existing v1 lifecycle assumption, not
  introduced by the backup feature).
- Two concurrent scans would interleave their `scan:progress` events —
  nothing currently guards `scan:run` against a second trigger while one
  is in flight.
- A track that errors mid-analysis can be left showing the "analyzing"
  spinner in the track table until the next scan (pre-existing v1
  behavior; the Status column now correctly surfaces it rather than
  causing it).
- Settings modal has no Escape-to-close/focus trap, and doesn't close
  itself after a successful folder change.
- `node:sqlite` is still flagged experimental in Node 24 (console
  warning only, not a functional issue observed) — watch its stability
  as Electron/Node versions move forward.
- `VACUUM INTO` runs synchronously on the main thread and the backups
  folder grows without bound — both explicit, spec-sanctioned tradeoffs
  (no pruning was requested), not bugs, but worth revisiting if the
  collection or backup history gets large.

## Reference

- v1 spec/plan: `docs/superpowers/specs/2026-08-20-v1-library-organizer-design.md`, `docs/superpowers/plans/2026-08-20-v1-library-organizer.md`
- Progress indicator + backups spec/plan: `docs/superpowers/specs/2026-08-21-progress-indicator-and-settings-backup-design.md`, `docs/superpowers/plans/2026-08-21-progress-indicator-and-settings-backup.md`
