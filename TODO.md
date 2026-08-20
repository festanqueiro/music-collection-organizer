# TODO

## Next up

All 22 tasks of the v1 plan are implemented and individually reviewed
(approved). The final whole-branch review found two Critical gaps and
several Important issues; **the two Critical ones are now fixed**
(commit `71987b5`) so the app should actually do its two headline jobs —
scanning + analyzing tracks, and tagging them. The Important issues below
are still open.

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

### Important (still open)

3. Player can't load audio — CSP blocks `file://` URLs (needs a custom
   `media://` protocol handler, scoped to the collection folder).
4. A scan against a temporarily-unavailable folder silently deletes the
   entire library + all tags (files missing from the walk get hard-deleted
   with cascading tag rows). Needs a guard against mass-deletion, or a
   soft-delete instead of hard `DELETE`.
5. IPC/preload boundary is untyped (`Promise<any>` everywhere) — `tsc
   --noEmit` passing doesn't actually catch main/renderer drift.
6. Cloud download button has no await/error handling/refresh.
7. Every tag edit reloads the entire collection (perf concern at scale).

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

Implementation complete (22/22 tasks) plus the two Critical fixes above,
on branch `worktree-v1-library-organizer`. `tsc --noEmit` clean, 38/38
tests passing, `npm run build` succeeds (main/preload/renderer all bundle
cleanly). Important-severity items above are still open — not blocking
basic usability but worth fixing before shipping.

Known sandbox-only limitation throughout: this environment can't fully
launch the packaged Electron app or run `electron-rebuild` cleanly —
attempted it directly and hit a real toolchain incompatibility (this
sandbox's Xcode Command Line Tools ships a newer libc++ than Electron
43's bundled Node/V8 headers expect: a `std::is_convertible_v` template
specialization conflict in `v8-internal.h`, unrelated to this app's code).
So nothing in this branch has been visually verified in a real running
window — verification here relied on `tsc --noEmit`, the test suite, and
a full `electron-vite build` (which does succeed). Do a real `npm run dev`
visual pass on a normal dev machine before shipping.
