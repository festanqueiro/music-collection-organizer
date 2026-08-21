# TODO

## Status

v1 is implemented and live-tested against a real ~2,481-track collection.
The analysis progress indicator, Settings modal with automatic backups,
and every item previously listed below as outstanding are all done.
`npx tsc -b --noEmit` (the correct project-references invocation — plain
`tsc --noEmit` is a silent no-op against this solution-style
`tsconfig.json`) is clean, 63/63 tests passing, `npm run build` succeeds.
PR: `v1-library-organizer` branch, #1.

For the full build history (what was fixed and why), see git log and the
SDD ledgers under `.superpowers/sdd/`.

## Outstanding

Nothing known-broken right now. Two explicit, spec-sanctioned tradeoffs
worth watching rather than fixing:

- `node:sqlite` is still flagged experimental in Node 24 (console
  warning only, not a functional issue observed) — watch its stability
  as Electron/Node versions move forward.
- `VACUUM INTO` runs synchronously on the main thread and the backups
  folder grows without bound (no pruning was requested) — not bugs, but
  worth revisiting if the collection or backup history gets large.

Longer-term ideas and performance follow-ups (none urgent) live in
`FUTURE_TODO.md`.

## Reference

- v1 spec/plan: `docs/superpowers/specs/2026-08-20-v1-library-organizer-design.md`, `docs/superpowers/plans/2026-08-20-v1-library-organizer.md`
- Progress indicator + backups spec/plan: `docs/superpowers/specs/2026-08-21-progress-indicator-and-settings-backup-design.md`, `docs/superpowers/plans/2026-08-21-progress-indicator-and-settings-backup.md`
