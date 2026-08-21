# TODO

## Status

v1 is implemented (all 22 plan tasks) and has been live-tested by hand:
scanned a real folder of ~50 tracks, analysis ran, the app stayed
responsive throughout, and the UI renders correctly (dark theme,
three-pane layout, Jost font, sortable single-line track table).
`npx tsc -b --noEmit` (the correct project-references invocation — plain
`tsc --noEmit` was silently a no-op against this solution-style
`tsconfig.json`) is clean, 61/61 tests passing, `npm run build` succeeds.

## New: analysis progress indicator + Settings/backups

Both items from the repo root's `TODO.IDEAS.md` are now implemented:

- **Analysis progress indicator** — a footer bar ("Analyzing N of M…")
  appears while a scan's background analysis is running and disappears
  when it finishes, plus a per-track spinner (`analyzing`) or error icon
  (`error`) in the track table's new Status column. `App.tsx`'s
  `onScanProgress` handler now throttles its track refresh (at most every
  300ms, always on the final tick) via a new lightweight
  `refreshTracks()` store action, instead of calling the expensive full
  `loadAll()` on every single progress tick.
- **Settings modal + automatic backups** — a gear icon in the toolbar
  opens a modal showing the collection folder (with the existing
  "Change…" action) and backup status (folder + last-backup time). A new
  `electron/main/backup.ts` module snapshots `collection.db` via SQLite's
  `VACUUM INTO` and copies the config store's JSON, both timestamped and
  never overwritten, deduped to once per calendar day — run once on app
  startup and hourly thereafter (covers both "on launch" and "daily" from
  the original request). No manual trigger, no pruning — both explicitly
  out of scope per the design spec.

Design/plan: `docs/superpowers/specs/2026-08-21-progress-indicator-and-settings-backup-design.md`, `docs/superpowers/plans/2026-08-21-progress-indicator-and-settings-backup.md`. Ledger: `.superpowers/sdd/2026-08-21-progress-indicator-and-settings-backup/progress.md`.

A final whole-branch review caught two Important issues (both fixed): a
fresh install's backup would throw on the config-file copy *after* the
DB snapshot was already written (electron-store creates its file lazily
on first write), leaving an orphan `.db` file on every launch/hourly
tick until a collection folder was chosen — `runBackup` now copies the
config file first, so a failure there leaves no orphan snapshot; and the
footer's final-tick refresh only cleared `analysisProgress` inside
`.then()`, so a rejected final refresh would strand the bar forever —
now uses `.finally()`.

Deferred (Minor, non-blocking, from the same final review): the hourly
backup-check `setInterval` captures the first `db` handle from
`createWindow()` with no cleanup, which matters if macOS's `activate`
event ever re-creates a window (pre-existing v1 lifecycle assumption,
not introduced here); `VACUUM INTO` runs synchronously on the main
thread and the backups folder grows without bound (both explicit,
spec-sanctioned tradeoffs — no pruning was requested); two concurrent
scans would interleave their progress events; a track that errors
mid-analysis can be left showing the "analyzing" spinner until the next
scan (pre-existing v1 behavior — the new Status column is now correctly
surfacing it rather than causing it); the Settings modal has no
Escape-to-close/focus trap and doesn't close itself after a successful
folder change (matches the rest of the app's current UI polish level).

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
- Suggested Genre tags: the raw ID3 genre tag captured during analysis
  now surfaces as a one-click "Suggested: X [+ Add]" chip in the tag
  picker instead of being invisible/unused.
- Waveform doubles as a seek bar: click anywhere on it to jump there;
  shows played/unplayed with a playhead line.
- Collection folder is now visible in the toolbar (with a "Change…"
  button) — previously there was no way to see it, or to change it once
  set.
- **Data loss on folder change / temporarily-missing drive** — a scan
  no longer deletes tracks it can't find; they're flagged `present = 0`
  (hidden from the table) and revived with all tags intact if found
  again at the same path later. Also fixed a real latent `node:sqlite`
  bug this surfaced: the "file changed on disk" update path would have
  thrown (node:sqlite rejects unused bound parameters; better-sqlite3
  silently ignored them), never previously exercised by a test.

## Fixed after a second pass (typed IPC boundary, playback, tag-edit perf)

- **Player couldn't load audio** — CSP blocked `file://` URLs. Added a
  privileged `media://` custom protocol (`electron/main/mediaProtocol.ts`,
  registered in `electron/main/index.ts`), scoped to the current
  collection folder. `Player.tsx` now sources `media://track/<encoded
  path>` instead of `file://`; `index.html`'s CSP grants `media-src
  media:`. Range requests are forwarded to `net.fetch` so seeking gets a
  206 response instead of re-downloading the whole file from byte 0.
- **IPC/preload boundary was untyped** (`Promise<any>` everywhere, so
  `tsc` couldn't catch main/renderer drift) — every `window.api` method
  in `electron/preload/index.ts` now has an explicit return type sourced
  from `src/types.ts`/`src/state/tagFilter.ts`, and `electron/main/ipc.ts`
  types its SQLite rows (`TrackRow`/`GenreRow`/`SubgenreRow`/`MoodRow`)
  instead of casting to `any`. This also surfaced (and fixed) that plain
  `tsc --noEmit` was a silent no-op against the solution-style
  `tsconfig.json` — the real check is `tsc -b --noEmit`, which now runs
  clean including a couple of small pre-existing type errors it caught
  (`scan.ts`/`queue.ts`/`decode.ts`).
- **Every tag edit reloaded the entire collection** — `setTrackGenres`/
  `setTrackSubgenres`/`setTrackMoods` in `src/state/store.ts` now apply
  the tag IPC call's returned (server-authoritative) `TrackTagIds`
  directly to the edited track's `trackTags` entry, instead of calling
  `loadAll()`. `electron/main/ipc.ts`'s `tags:setTrackGenres` etc. now
  return the post-write state (read back via `getTrackTagIds`) rather
  than `void`, so the store applies the DB's actual answer instead of
  reimplementing `tags.ts`'s subgenre-cascade rule against a client-side
  cache that a second rapid edit on the same track could race.

### Caught by an independent review pass on the above three fixes

- **`media://`'s containment check was symlink-blind** — it used
  `path.resolve` (lexical only), so a symlink placed inside the
  collection folder pointing outside it would pass. Now uses
  `fs.realpathSync` on both sides of the comparison before checking
  containment (tested: a symlink escaping the folder is rejected, one
  pointing to another in-folder file is allowed).
- `Player.tsx`'s `toggle()` called `audio.play()` without handling
  rejection, so a failed/blocked load left the button showing "pause"
  with nothing actually playing. Now only flips to playing once
  `play()` resolves, and an `onError` handler resets it too.
- `decodeToPcm` cast `ffmpegPath as string` past its real `string |
  null` type — a packaged build missing the bundled ffmpeg binary would
  throw an undiagnosable generic `TypeError` from `spawn(null, ...)`.
  Now throws a clear error instead.
- Switching the collection folder (`pickCollectionFolder`) never
  triggered a rescan, so the previous folder's tracks stayed listed and
  clicking one now 404s against the new folder's `media://` scope
  instead of silently doing nothing. Now runs a scan right after the
  folder changes.
- `Player.tsx` duplicated `media://track/<encoded path>` inline instead
  of using `mediaProtocol.ts`'s `trackPathToMediaUrl` (now shared via
  `src/media.ts`, importable from both main and renderer) — the two
  could have silently drifted apart.

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
