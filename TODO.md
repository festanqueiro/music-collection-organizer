# TODO

## Status

v1 is implemented (all 22 plan tasks) and has been live-tested by hand:
scanned a real folder of ~50 tracks, analysis ran, the app stayed
responsive throughout, and the UI renders correctly (dark theme,
three-pane layout, Jost font, sortable single-line track table).
`tsc --noEmit` clean, 38/38 tests passing, `npm run build` succeeds.

## Fixed during hands-on testing

- **Analysis pipeline never ran** — `scan:run` now runs `runAnalysisQueue`
  over newly-pending local tracks after a scan, streaming `scan:progress`
  events the renderer reloads on.
- **No way to create Genre/Sub-Genre/Mood tags** — `DetailPanel.tsx` has
  inline "+ New" inputs per tag type, backed by
  `createGenre`/`createSubgenre`/`createMood` store actions.
- **App couldn't run in some environments** — swapped `better-sqlite3`
  (a native module needing a rebuild against Electron's exact Node ABI
  on every install) for Node's built-in `node:sqlite` — Electron 43
  bundles Node v24.18.1, which ships it natively, so there's nothing to
  compile.
- **App froze during a real scan** — BPM/key analysis (`essentia.js`,
  WASM) is synchronous CPU-bound work; it was running on Electron's main
  thread and blocking the whole UI for the length of a scan. Moved into a
  `worker_threads` pool (`electron/main/analysis/worker.ts`), matching
  the spec's original "background worker thread queue" design. Also fixed
  a WASM vector memory leak (`essentia.arrayToVector()` result was never
  `.delete()`d).
- **Cloud download button had no feedback** — now awaits, shows a loading
  state, catches/surfaces errors, and the detail panel re-derives from
  the live store so it reflects the result without needing to reselect
  the track.
- Track table UI polish: rows no longer wrap to two lines (cells are
  `white-space: nowrap`, table scrolls horizontally instead); Duration
  column now shows `MM:SS` (`HH:MM:SS` once a track passes an hour).

## Still open (Important, not blocking basic use)

- Player can't load audio — CSP blocks `file://` URLs. Needs a custom
  `media://` protocol handler, scoped to the collection folder, plus
  `encodeURIComponent` on the path.
- A scan against a temporarily-unavailable folder silently deletes the
  entire library + all tags (files missing from the walk get
  hard-deleted with cascading tag rows). Needs a guard against
  mass-deletion, or a soft-delete instead of hard `DELETE`.
- IPC/preload boundary is untyped (`Promise<any>` everywhere) — `tsc
  --noEmit` passing doesn't actually catch main/renderer drift. Fix:
  annotate return types on every preload method and a proper `TrackRow`
  type for `rowToTrack`.
- Every tag edit reloads the entire collection (perf concern at scale —
  the spec targets 10,000+ track collections). The three `setTrack*`
  store actions should patch `trackTags` locally instead of a full
  `loadAll()`.

## Lower priority

`deleteGenre` is implemented/tested but has no UI path; `TagTree`'s
filter closure goes stale after a tag edit (doesn't re-apply when
`trackTags` changes); sort is ascending-only with no direction toggle;
missing try/catch in `folderWalk.ts` around a single unreadable
subdirectory; `node:sqlite` is still flagged experimental in Node 24 (a
console warning only, not a functional issue observed here) — keep an
eye on its stability as Electron/Node versions move forward.

## Reference

- Spec: `docs/superpowers/specs/2026-08-20-v1-library-organizer-design.md`
- Plan: `docs/superpowers/plans/2026-08-20-v1-library-organizer.md` (22 tasks, all complete)
- Full SDD ledger (task-by-task build history): `.superpowers/sdd/2026-08-20-v1-library-organizer/progress.md`
- Original final-review findings (most already fixed above, kept for context): `.superpowers/sdd/2026-08-20-v1-library-organizer/final-review-findings.md`
