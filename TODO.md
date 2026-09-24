# TODO

Everything open in one place: known issues, UX improvements, and things
to watch. Bigger feature ideas live in `IDEAS.md`. Shipped work lives in
git log; features are documented under `docs/features/`.

`npx tsc -b --noEmit` is clean and `npm test` passes (223 tests as of
v1.0.26).

## Known issues

- **`npm run dev` + React StrictMode.** StrictMode double-runs Player's
  mount effect, so `createMediaElementSource` is called twice on the same
  `<audio>` element (throws in dev only; packaged builds are unaffected).
- **Absolute track paths.** `tracks.path` is absolute, so the "`.mco`
  travels with the collection" design only preserves tags if the folder
  lands at the same path. Tag export/import has the same limitation.
- Genre names are unique case-sensitively in SQLite but matched
  case-insensitively in the UI (`DetailPanel`'s suggested-genre flow).
- Undoing a genre deletion keys sub-genre associations by name, so two
  sub-genres with the same name under one genre get merged.
- The track context menu says "Show in File Explorer" on a macOS-only app
  ("Show in Finder" would be native).

## UX improvements

- **Discoverable context menus.** `FolderTree.tsx`, `TagTree.tsx`, and
  `TrackTable.tsx` hide meaningful functionality (rename/delete/recolor a
  tag, per-folder analyse/queue, per-track play-next/analyse/show-in-folder)
  behind right-click menus with no visual affordance. Add a small "⋮" icon
  button on hovered rows as a discoverable entry point into the same menu.
- **Column visibility.** Track-table columns can be reordered but never
  hidden. Add a "Columns" toggle next to "Add all to queue".
- **Undo countdown.** The genre/sub-genre deletion undo toast
  (`UndoToast.tsx`) auto-dismisses after a hardcoded 8 s with no visual
  countdown. Add a shrinking progress bar or countdown number.
- **Why did analysis fail?** A failed track only shows a red icon with a
  generic "Analysis failed" tooltip. `analyzeTrack`/the worker swallow the
  error, so this needs an error column persisted alongside
  `analysis_status`, then surfaced in the tooltip or DetailPanel.

## Watch list

- `node:sqlite` is still flagged experimental (console warning only) —
  watch its stability as Electron/Node versions move forward.
- `VACUUM INTO` (backups) and `runScan` run synchronously on the main
  thread — fine at current collection sizes, worth revisiting if they grow.

## Reference

Original design docs (historical — the code has moved on since):
`docs/superpowers/specs/`, `docs/superpowers/plans/`.
