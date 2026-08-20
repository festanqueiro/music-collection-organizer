# TODO

## Next up

All 22 tasks of the v1 plan are implemented and individually reviewed
(approved). The final whole-branch review found two Critical gaps and
several Important issues; **the two Critical ones are fixed** (commit
`71987b5`), and the app **has now actually been launched and visually
confirmed running** (commit `ed352a6` — see Status below). The Important
issues below are still open.

To resume: read `.superpowers/sdd/2026-08-20-v1-library-organizer/final-review-findings.md`
for exact fix guidance on the remaining items, fix what's needed, then
re-run the SDD final-review scoped re-review + adjudication, then finish
the branch via superpowers:finishing-a-development-branch.

### Fixed

1. ~~Analysis pipeline never runs~~ — `scan:run` (`electron/main/ipc.ts`)
   now runs `runAnalysisQueue` over newly-pending local tracks after a
   scan, streaming `scan:progress` events the renderer reloads on.
2. ~~No way to create Genre/Sub-Genre/Mood tags~~ — `DetailPanel.tsx` now
   has inline "+ New" inputs per tag type, backed by new
   `createGenre`/`createSubgenre`/`createMood` store actions.
3. ~~Couldn't verify the app actually runs~~ — swapped `better-sqlite3`
   for Node's built-in `node:sqlite` (see Status below). The app now
   launches; confirmed via screenshot (dark theme, three-pane layout,
   toolbar, scan prompt all rendering correctly).

### Important (still open)

4. Player can't load audio — CSP blocks `file://` URLs (needs a custom
   `media://` protocol handler, scoped to the collection folder).
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
(spec's own open risk #2, unvalidated — still worth checking against
`node:sqlite`'s synchronous-only API too, since long-running analysis now
shares the main thread with all DB access); `deleteGenre` is
implemented/tested but has no UI path; `TagTree`'s filter closure goes
stale after a tag edit; various Minor items (sort direction, missing
try/catch in folderWalk, Player edge cases, stale README).

Also worth a follow-up: `node:sqlite` is still flagged experimental in
Node 24 (a console warning only, not a functional issue as verified here)
— keep an eye on its stability as Electron/Node versions move forward.

- Spec: `docs/superpowers/specs/2026-08-20-v1-library-organizer-design.md`
- Plan: `docs/superpowers/plans/2026-08-20-v1-library-organizer.md` (22 tasks, all complete)
- Full SDD ledger (task-by-task history): `.superpowers/sdd/2026-08-20-v1-library-organizer/progress.md`
- Full final-review findings with exact fix guidance: `.superpowers/sdd/2026-08-20-v1-library-organizer/final-review-findings.md`

## Status

Implementation complete (22/22 tasks) plus the Critical fixes above, on
branch `worktree-v1-library-organizer`. `tsc --noEmit` clean, 38/38 tests
passing, `npm run build` succeeds. Important-severity items above are
still open — not blocking basic usability but worth fixing before
shipping.

Previously this sandbox couldn't launch the packaged Electron app at all:
`better-sqlite3`'s native binding needs rebuilding against Electron's
bundled Node ABI on every install (via `electron-rebuild`), and this
sandbox's Xcode Command Line Tools can't compile against Electron 43's
bundled V8 headers (a libc++ incompatibility, unrelated to app code).
Fixed by replacing `better-sqlite3` with Node's built-in `node:sqlite`
(commit `ed352a6`) — Electron 43 bundles Node v24.18.1, which ships
`node:sqlite` natively, so there's nothing left to compile. Confirmed by
actually launching the built app (`npx electron out/main/index.js`) and
screenshotting the running window: dark theme, "Music Collection
Organizer" title, three-pane layout, Jost font, toolbar, and the startup
scan prompt all render correctly. The full scan→analyze→tag flow with a
real collection folder has NOT been click-tested end-to-end yet — worth
doing that pass next.
