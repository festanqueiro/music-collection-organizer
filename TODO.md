# TODO

## Next up

All 22 tasks of the v1 plan are implemented and individually reviewed
(approved). The final whole-branch review found the app is **not yet
functionally complete** — two Critical gaps mean it doesn't do its two
headline jobs yet, plus several Important issues. Fix these before merging.

To resume: tell Claude to fix the items below (findings already written up
in detail at `.superpowers/sdd/2026-08-20-v1-library-organizer/final-review-findings.md`
in this worktree — read that file first, it has exact fix guidance per item),
then re-run the SDD final-review scoped re-review + adjudication, then
finish the branch via superpowers:finishing-a-development-branch.

### Critical (must fix before this is usable)

1. **Analysis pipeline never runs.** `runScan` (`electron/main/scan.ts`)
   never calls `runAnalysisQueue` — every track stays `pending` forever,
   so BPM/key/waveform/metadata never populate. Wire it into the
   `scan:run` IPC handler.
2. **No way to create Genre/Sub-Genre/Mood tags.** The CRUD functions and
   IPC exist, but no store action or UI calls them — tagging and tag
   filtering are fully built and tested underneath but unreachable.

### Important

3. Player can't load audio — CSP blocks `file://` URLs (needs a custom
   `media://` protocol handler, scoped to the collection folder).
4. Scan progress events are never emitted/consumed — no incremental
   table updates during a scan.
5. A scan against a temporarily-unavailable folder silently deletes the
   entire library + all tags (files missing from the walk get hard-deleted
   with cascading tag rows). Needs a guard against mass-deletion, or a
   soft-delete instead of hard `DELETE`.
6. IPC/preload boundary is untyped (`Promise<any>` everywhere) — `tsc
   --noEmit` passing doesn't actually catch main/renderer drift.
7. Cloud download button has no await/error handling/refresh.
8. Every tag edit reloads the entire collection (perf concern at scale).

### Also noted (lower priority, see findings doc for full list)

Analysis runs synchronously on the main thread and leaks WASM vectors
(spec's own open risk #2, unvalidated); `deleteGenre` is implemented/tested
but has no UI path; `TagTree`'s filter closure goes stale after a tag edit;
various Minor items (sort direction, missing try/catch in folderWalk,
Player edge cases, stale README).

- Spec: `docs/superpowers/specs/2026-08-20-v1-library-organizer-design.md`
- Plan: `docs/superpowers/plans/2026-08-20-v1-library-organizer.md` (22 tasks, all complete)
- Full SDD ledger (task-by-task history): `.superpowers/sdd/2026-08-20-v1-library-organizer/progress.md`
- Full final-review findings with exact fix guidance: `.superpowers/sdd/2026-08-20-v1-library-organizer/final-review-findings.md`

## Status

Implementation complete (22/22 tasks, individually reviewed/approved,
38/38 tests passing, `tsc --noEmit` clean) on branch
`worktree-v1-library-organizer`, but the final whole-branch review found
it's not functionally usable yet — see Critical items above. Fix wave was
paused before dispatch to conserve budget; nothing has been fixed yet.

Known sandbox-only limitation throughout: this environment can't fully
launch the packaged Electron app (native-module ABI mismatch between
better-sqlite3's build and Electron's bundled runtime) or run
`electron-rebuild` cleanly (broken Xcode CLT toolchain here), so nothing
in this branch has been visually verified in a real running window —
worth doing that pass in a normal dev machine before shipping.
