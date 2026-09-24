# TODO

## Status

v1 is implemented and live-tested against a real ~2,481-track collection.
Since then the play queue, FX panel + Dub Siren, MIDI mapping, visualizer,
backup restore/pruning, and most of the old UX list have shipped (see git
log). `npx tsc -b --noEmit` is clean and `npm test` passes (214 tests as of
v1.0.25).

## Known issues (from the 2026-09 code review)

- **Visualizer — SYSTEM MB model textures blocked by CSP.** `index.html`'s
  CSP (`default-src 'self'; img-src 'self' data:`) doesn't allow `blob:`,
  which is how `GLTFLoader` loads the GLB's two embedded PNG textures. The
  "Natural" finish (which uses the model's original materials) renders
  without them. Fix: add `blob:` to `img-src` and a `connect-src 'self'
  blob:`.
- **Analysis progress with concurrent runs.** Every `analysis:run` call
  sends its own `{done, total}` on the shared `scan:progress` channel. A
  single-track background analysis (loading/queueing an unanalysed track)
  finishing during a bulk "Analyse Collection" run sends `done === total`,
  which hides the bulk run's progress bar until its next tick, and the two
  runs' ticks overwrite each other.
- **Closed window on macOS.** `currentWindow` in `electron/main/index.ts`
  isn't cleared on `closed`, so an analysis still running after the user
  closes the window (app stays alive on macOS) calls
  `webContents.send` on a destroyed window and throws in the main process.
- **Concurrent AIFF transcodes.** `getPlayableFilePath` has no in-process
  dedup: every `media://` request (the initial load plus each Range/seek
  request) for a not-yet-cached AIFF spawns its own full ffmpeg transcode
  until the first one lands. The transcode cache is also never pruned.
- **`loadAll()` clears the checked-track selection.** Any tag create/
  rename/recolor/delete, import, or cloud download goes through `loadAll`,
  which resets `checkedTrackIds` — mid-batch-tagging selections get lost.
- **`npm run dev` + StrictMode.** StrictMode double-runs Player's mount
  effect, so `createMediaElementSource` is called twice on the same
  `<audio>` element (throws in dev only; packaged builds are unaffected).
- **Absolute track paths.** `tracks.path` is absolute, so the "`.mco`
  travels with the collection" design only preserves tags if the folder
  lands at the same path. Tag export/import has the same limitation.
- Minor: genre names are unique case-sensitively in SQLite but matched
  case-insensitively in the UI; undoing a genre deletion keys subgenre
  associations by name (collides if two subgenres share a name); the
  right-click item says "Show in File Explorer" on a macOS-only app.

## Watch list

- `node:sqlite` is still flagged experimental (console warning only) —
  watch its stability as Electron/Node versions move forward.
- `VACUUM INTO` (backups) and `runScan` run synchronously on the main
  thread — fine at current collection sizes, worth revisiting if they grow.

Longer-term ideas live in `TODO-FUTURE.md`; UX ideas in `TODO-UX.md`.

## Reference

- v1 spec/plan: `docs/superpowers/specs/2026-08-20-v1-library-organizer-design.md`, `docs/superpowers/plans/2026-08-20-v1-library-organizer.md`
- Progress indicator + backups spec/plan: `docs/superpowers/specs/2026-08-21-progress-indicator-and-settings-backup-design.md`, `docs/superpowers/plans/2026-08-21-progress-indicator-and-settings-backup.md`
