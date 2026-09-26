# Progress Indicator + Settings/Backup Design

**Status:** Approved for planning.
**Builds on:** `docs/superpowers/specs/2026-08-20-v1-library-organizer-design.md` (v1, currently on this same branch/worktree as an open, unmerged PR). This work continues on `v1-library-organizer` rather than branching from `main`, since `main` doesn't yet contain the app these features extend.
**Source:** `TODO.IDEAS.md` (repo root, on `main`) — "Analysis progress indicator" and "Settings modal."

## Goal

Two independent, additive features:

1. **Analysis progress indicator** — visible feedback (per-track + a global
   footer bar) while BPM/key/waveform analysis runs after a scan, using the
   `scan:progress` IPC event that already exists but is currently only used
   to trigger a full collection reload on every tick.
2. **Settings modal with automatic collection backups** — a modal exposing
   the existing "choose collection folder" action plus read-only backup
   status, backed by a new automatic daily/on-launch backup of the SQLite
   collection DB and the config store.

## Decisions from brainstorming

- Launch-triggered backups are deduped to at most once per calendar day;
  a long-running session gets an hourly check to still catch a day
  rollover without a restart.
- No manual "back up now" button — automatic only, modal is read-only
  status (backup folder path + last-backup timestamp).
- No backup pruning/retention limit — every backup is kept forever, matching
  "never overwrite/replace older backups" literally.
- The footer progress bar mounts only while analysis is actively running
  and unmounts when it finishes — not a permanent idle fixture.

## Part 1: Analysis progress indicator

### Problem with the current wiring

`App.tsx`'s `onScanProgress` handler calls the store's `loadAll()` — which
re-fetches tracks, genres, subgenres, moods, *and* all track-tag-ids — on
every single `scan:progress` tick. For a collection near the spec's
10,000+ track target, that's an expensive full refetch potentially
thousands of times over one scan.

### Design

**Store (`src/state/store.ts`):**
- New state field: `analysisProgress: { done: number; total: number } | null`.
- New action `setAnalysisProgress(progress: { done: number; total: number } | null)` — pure state update, no IPC.
- New action `refreshTracks(): Promise<void>` — calls `window.api.getTracks()`
  only (not genres/subgenres/moods/tagIds) and sets `tracks`. Lighter-weight
  sibling to `loadAll()` for use during a running scan.

**`App.tsx`'s `onScanProgress` handler:**
- On every event: `setAnalysisProgress({ done, total })`.
- Track-list refresh (to reflect newly-`analyzing`/`done`/`error` rows) is
  throttled: only fire `refreshTracks()` if at least 300ms elapsed since
  the last refresh, OR this event has `done === total` (always refresh on
  the final tick, so the UI is guaranteed to end in a correct state).
- When `done === total`: after the refresh, clear `analysisProgress` (set
  to `null`) so the footer bar unmounts.

**New component `src/components/AnalysisProgressBar.tsx`:**
- Props: `{ progress: { done: number; total: number } }`.
- Renders "Analyzing `{done}` of `{total}`…" and a simple horizontal bar
  (`width: {done/total * 100}%`), styled consistent with the existing dark
  theme (reuse `--color-accent`/`--color-surface` tokens already used
  elsewhere).
- No internal state — pure presentational component.

**`App.tsx` layout:**
- Add a `footer` grid row/area (`gridTemplateRows: 'auto 1fr auto'`,
  `gridTemplateAreas` gains `'footer footer footer'`), rendering
  `analysisProgress && <AnalysisProgressBar progress={analysisProgress} />`
  — the grid row collapses to its content's height (nothing) when the
  conditional renders null, so there's no persistent empty footer space.

**`TrackTable.tsx`:**
- New status column (next to the existing Cloud column): a spinning
  `material-symbols-outlined` "progress_activity" icon when
  `track.analysisStatus === 'analyzing'`, a small error-triangle icon when
  `'error'`, nothing otherwise. CSS spin animation added to the existing
  stylesheet the Cloud icon's styles live in.

### Data flow

```
scan:run (main) → runAnalysisQueue → worker completes one track
  → writeAnalysisResult (DB write) → onProgress({done, total})
  → mainWindow.webContents.send('scan:progress', {done, total})
  → renderer's onScanProgress → setAnalysisProgress + throttled refreshTracks()
  → AnalysisProgressBar / TrackTable re-render from updated store state
```

### Error handling

- A track that fails analysis is already written as `analysis_status =
  'error'` by `queue.ts` (existing behavior, unchanged) — the new status
  column surfaces this instead of it being invisible.
- If `refreshTracks()`'s IPC call rejects (e.g. main process briefly busy),
  the throttle simply tries again on the next tick or the guaranteed final
  tick — no special handling needed beyond what already exists for other
  store actions.

### Testing

- `AnalysisProgressBar` is a pure presentational component — no unit test
  framework for React components exists yet in this repo (Vitest is
  configured for `node` environment only, no `@testing-library/react`);
  adding one is out of scope for this feature. Verified instead via a
  manual `npm run dev` walkthrough during a real scan.
- The throttle logic (component-independent) is small enough to inline in
  `App.tsx` without its own pure module; covered by the manual walkthrough,
  not a unit test — this mirrors how `App.tsx`'s existing effect wiring is
  untested today.

## Part 2: Settings modal + automatic backups

### Backup content and mechanism

Two files get backed up, both under `app.getPath('userData')`:
- **`collection.db`** (the SQLite DB) — snapshotted via SQLite's `VACUUM
  INTO '<path>'`, run through the existing `AppDatabase`'s `.exec()`. This
  produces an atomically consistent copy regardless of any in-flight
  writes, unlike a raw `fs.copyFileSync` of the live DB file.
- **The config store's JSON file** (`electron-store`'s backing file,
  currently just `collectionFolder` — soon also `lastBackupAt`, see below)
  — copied with a plain `fs.copyFileSync`, since electron-store already
  writes it atomically (`write-file-atomic`) and it's never open for
  writes at backup time from this process's perspective.

Both land in `<userData>/backups/`, one timestamped pair per backup run:
`collection-<ISO-timestamp-with-colons-replaced>.db` and
`config-<same-timestamp>.json`. Never overwritten, never pruned.

### New module: `electron/main/backup.ts`

- `shouldBackupToday(lastBackupAt: string | null, now: Date): boolean` —
  pure function: `true` if `lastBackupAt` is `null` or its calendar date
  (local time) differs from `now`'s. Unit tested directly (no I/O).
- `runBackup(db: AppDatabase, configFilePath: string, backupFolder: string, now: Date): { dbBackupPath: string; configBackupPath: string }`
  — creates `backupFolder` if missing, runs the `VACUUM INTO` and the
  config copy, returns the two paths written. Integration tested against a
  real temp directory and a real (non-`:memory:`) `openDatabase()` file,
  since `VACUUM INTO` needs an actual file to target.
- `runBackupIfNeeded(db, configFilePath, backupFolder, now): void` — reads
  `getLastBackupAt()` (see config.ts change below), calls
  `shouldBackupToday`; if true, calls `runBackup` and then
  `setLastBackupAt(now.toISOString())`. This is the function `index.ts`
  actually calls; also integration tested (once with a fresh config
  showing a backup happens, once immediately after showing a second call
  same-day is a no-op).

### `electron/main/config.ts` changes

- Add `lastBackupAt?: string` to `ConfigSchema`.
- Add `getLastBackupAt(): string | null` / `setLastBackupAt(iso: string): void`,
  following the existing `getCollectionFolder`/`setCollectionFolder` pattern.
- Add `getConfigFilePath(): string` — returns `getStore().path` (an
  `electron-store`/`conf` built-in getter for the backing file's absolute
  path), for `backup.ts`'s config-file copy step.

### `electron/main/index.ts` wiring

- After `openDatabase(...)` in `createWindow()`: call
  `runBackupIfNeeded(db, getConfigFilePath(), getBackupFolder(), new Date())`.
  Wrapped in try/catch with a `console.error` on failure — a failed backup
  must never block app startup or crash the app.
- `app.whenReady().then(...)`: also start
  `setInterval(() => { try { runBackupIfNeeded(...) } catch (err) { console.error(...) } }, 60 * 60 * 1000)`
  (hourly) so a session left open across midnight still gets a same-day
  backup without a restart. `getBackupFolder()` lives in `backup.ts`:
  `join(app.getPath('userData'), 'backups')`.

### IPC + renderer

- New handler `ipcMain.handle('backup:getInfo', (): BackupInfo => ({ backupFolder: getBackupFolder(), lastBackupAt: getLastBackupAt() }))`
  in `ipc.ts`. `BackupInfo` type added to `src/types.ts`.
- Preload: `getBackupInfo(): Promise<BackupInfo>`.
- Store: `settingsOpen: boolean` is *not* global store state — it's local
  `useState` in `App.tsx` (pure ephemeral UI state, no reason to route it
  through zustand), passed to `Toolbar` as an `onOpenSettings` callback and
  to the new modal as `open`/`onClose`.

### New component `src/components/SettingsModal.tsx`

- Props: `{ open: boolean; onClose: () => void }`.
- On open, fetches `window.api.getBackupInfo()` once (simple `useEffect`
  keyed on `open`).
- Renders (only when `open`): a simple overlay + centered panel (no new
  dependency — plain fixed-position `div`s styled with the existing CSS
  custom properties, matching the app's existing hand-rolled component
  style rather than pulling in a modal library).
  - "Collection folder" section: current `collectionFolder` from the
    store, "Change…" button reusing the existing `pickCollectionFolder`
    store action (already triggers a rescan, per the earlier fix).
  - "Backups" section: backup folder path, and last backup time formatted
    with `toLocaleString()` (or "Never yet" if `null`).
  - Close button / overlay click closes.

### `Toolbar.tsx` change

- Add a small gear icon button (`material-symbols-outlined` "settings")
  next to "Update Collection", calling the new `onOpenSettings` prop passed
  down from `App.tsx`. The existing inline "collection folder + Change…"
  display in the toolbar is left as-is (not removed) — the modal
  surfaces the same action in a second place, per the brainstorm decision
  not to remove existing functionality.

### Error handling

- `runBackup`/`runBackupIfNeeded` failures are caught and logged in
  `index.ts`, never thrown up into app startup — a broken backup should
  degrade to "no backup happened" (visible in the modal as a stale
  `lastBackupAt`), not break the app.
- `getBackupInfo`'s IPC call has no special error handling beyond what
  every other read-only IPC call in this codebase has (i.e., none — a
  rejected promise would surface as an unhandled rejection in the
  renderer console, consistent with existing calls like `getGenres()`).

### Testing

- `shouldBackupToday`: pure unit tests (null case, same-day case,
  different-day case, timezone-adjacent boundary using local `Date`
  construction consistent with how `now` is always passed in, never
  relying on `Date.now()` internally so tests are deterministic).
- `runBackup`/`runBackupIfNeeded`: integration tests using `mkdtempSync`
  for both the DB file location and the backup folder, a real
  `openDatabase()` (not `:memory:`, since `VACUUM INTO` needs a real
  source and destination), and asserting the two output files exist and
  are valid (DB backup: `openDatabase()` on the backup path and query it;
  config backup: read and `JSON.parse()` it).
- `SettingsModal`/`Toolbar` changes: manual `npm run dev` walkthrough,
  consistent with the rest of this repo's untested-React-component
  pattern (see Part 1's testing note).

## Out of scope

- Manual "back up now" trigger (explicitly declined in brainstorming).
- Backup pruning/retention limits (explicitly declined).
- Restoring from a backup (not requested — this is a write-only safety
  net for now).
- Any settings beyond collection folder + backup status (TODO.IDEAS.md
  says "for now, two things").
