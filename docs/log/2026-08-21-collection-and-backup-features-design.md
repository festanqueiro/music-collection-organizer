# Collection/Library Features + Backup Follow-ups Design

**Status:** Approved for planning.
**Builds on:** the merged v1 app + progress-indicator/settings-backup work (now on `main`). This work is on its own new branch/worktree, `collection-and-backup-features`.
**Source:** `FUTURE_TODO.md`'s "Backup/settings follow-ups" and "Collection/library features" sections (all 7 items).

## Goal

Seven independent, additive features:

1. Surface backup failures in the Settings UI (not just console logs).
2. Prune old backups (keep the most recent N).
3. Restore the collection from a backup.
4. Batch tag editing (apply a tag to multiple selected tracks at once).
5. Export/import the collection's tag data as a portable file.
6. Keyboard shortcuts (space to play/pause, arrow keys to move the track selection).
7. Undo for `deleteGenre` (replacing the current `window.confirm()`).

## Decisions from brainstorming

- Batch tag editing **adds** tags to each selected track's existing set — it never replaces/clears what a track already has.
- Restoring a backup shows a list (newest first) to pick from, not just "restore latest." After copying the chosen snapshot over the live DB/config files, the app calls `app.relaunch()` + `app.exit()` rather than trying to hot-swap the in-memory DB connection.
- Backup pruning keeps the **last 30** backups (count-based, not time-based), applied after every successful backup.
- Export/import is JSON, and — critically — keyed by **names and paths, not database ids**. Genre/subgenre/mood ids are per-database autoincrement values with no meaning on a different machine's database; track ids are the same. Export therefore stores tag data by human-readable name (subgenres additionally qualified by their parent genre's name, since `subgenres.name` has no uniqueness constraint in the schema — two different genres can have same-named subgenres) and tracks by their absolute path. Import find-or-creates genres/subgenres/moods by name and matches tracks by path; anything that doesn't match is skipped and counted, never guessed at.

## 1. Surface backup failures

`electron/main/config.ts` gains a `lastBackupError` field, parallel to the existing `lastBackupAt`:

- `getLastBackupError(): string | null`
- `setLastBackupError(message: string): void`
- `clearLastBackupError(): void`

`electron/main/index.ts`'s `performBackupCheck` sets the error on a caught exception and clears it on success, instead of only `console.error`-ing:

```ts
function performBackupCheck(db: AppDatabase): void {
  try {
    runBackupIfNeeded(db, getConfigFilePath(), getBackupFolder(app.getPath('userData')), new Date())
    clearLastBackupError()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('backup failed', err)
    setLastBackupError(message)
  }
}
```

`BackupInfo` (`src/types.ts`) gains `lastBackupError: string | null`. The `backup:getInfo` IPC handler includes it. `SettingsModal.tsx` shows it (e.g. "⚠ Last backup failed: `<message>`") instead of / alongside the last-backup timestamp when present.

## 2. Backup pruning

New `electron/main/backup.ts` function:

```ts
export function pruneOldBackups(backupFolder: string, keep: number): void
```

Lists `collection-<timestamp>.db` files in the backup folder, sorts timestamps lexicographically (safe — they're `toISOString()`-derived, so lexicographic order is chronological order), and deletes both the `.db` and matching `config-<timestamp>.json` for every timestamp beyond the most recent `keep`. Missing/already-gone files are tolerated (best-effort delete).

Called from `runBackupIfNeeded` right after a successful backup, wrapped in its own try/catch so a pruning failure is logged but never marks an otherwise-successful backup as failed (i.e. never sets `lastBackupError`):

```ts
export function runBackupIfNeeded(db, configFilePath, backupFolder, now, keep = 30): void {
  if (!shouldBackupToday(getLastBackupAt(), now)) return
  runBackup(db, configFilePath, backupFolder, now)
  setLastBackupAt(now.toISOString())
  try {
    pruneOldBackups(backupFolder, keep)
  } catch (err) {
    console.error('pruneOldBackups failed', err)
  }
}
```

## 3. Restore from a backup

New `electron/main/backup.ts` additions:

```ts
export interface BackupEntry {
  timestamp: string
  dbPath: string
  configPath: string
}

export function listBackups(backupFolder: string): BackupEntry[]
export function restoreBackup(entry: BackupEntry, dbFilePath: string, configFilePath: string): void
```

`listBackups` returns entries newest-first (empty array if the folder doesn't exist yet — never throws for that case). `restoreBackup` just copies the two files over the live paths — no DB connection handling; that's the IPC handler's job (see below), since only `index.ts`/`ipc.ts` know about the live `AppDatabase` handle.

New IPC handlers in `ipc.ts` (which already imports `dialog`/`BrowserWindow` from `electron` — this adds `app` to that import, and `join` from `node:path`):

```ts
ipcMain.handle('backup:list', (): BackupEntry[] => listBackups(backupFolder))

ipcMain.handle('backup:restore', (_e, timestamp: string): void => {
  const entry = listBackups(backupFolder).find((e) => e.timestamp === timestamp)
  if (!entry) throw new Error(`No backup found for timestamp ${timestamp}`)
  db.close()
  const dbFilePath = join(app.getPath('userData'), 'collection.db')
  restoreBackup(entry, dbFilePath, getConfigFilePath())
  app.relaunch()
  app.exit()
})
```

`db.close()` runs before copying so the live SQLite connection isn't holding the file open when it's overwritten. If the copy throws after `close()`, the handler rethrows without relaunching — the app is left needing a manual restart in that narrow failure window. This is an accepted tradeoff for v1: restore is already a deliberate, rare, user-initiated action, and building a "reopen the DB and rewire every handler's closure" fallback is a lot of machinery for a failure mode (disk error mid-copy, right after a successful backup listing) that's unlikely in practice.

Preload:

```ts
listBackups: (): Promise<BackupEntry[]> => ipcRenderer.invoke('backup:list'),
restoreBackup: (timestamp: string): Promise<void> => ipcRenderer.invoke('backup:restore', timestamp),
```

`SettingsModal.tsx` gets a new "Restore" subsection: fetches the list on open (same pattern as `backupInfo`), renders each entry's timestamp formatted via `new Date(...).toLocaleString()` (parsed from the ISO-ish filename timestamp) with a "Restore" button. Confirm-guarded with `window.confirm()` since it's destructive and relaunches the app.

## 4. Batch tag editing

**Store (`src/state/store.ts`):** new state + actions.

```ts
checkedTrackIds: Set<number>
toggleTrackChecked: (trackId: number) => void
setTracksChecked: (trackIds: number[], checked: boolean) => void
clearCheckedTracks: () => void
addTagsToCheckedTracks: (tagIds: { genreIds: number[]; subgenreIds: number[]; moodIds: number[] }) => Promise<void>
```

`addTagsToCheckedTracks` calls a new IPC method with the checked track ids, applies the returned `TrackTagIds[]` to the `trackTags` map (same server-authoritative-response pattern as `setTrackGenres` etc. — no full `loadAll()`), and does **not** clear the selection (so the user can apply more than one tag category in sequence without re-checking rows).

**Backend (`electron/main/tags.ts`):** new functions using `INSERT OR IGNORE` so re-adding an already-present tag is a harmless no-op (not an error):

```ts
export function addGenresToTracks(db: AppDatabase, trackIds: number[], genreIds: number[]): void
export function addSubgenresToTracks(db: AppDatabase, trackIds: number[], subgenreIds: number[]): void
export function addMoodsToTracks(db: AppDatabase, trackIds: number[], moodIds: number[]): void
```

Each wraps its nested loop (`for trackId, for tagId: INSERT OR IGNORE ...`) in `runInTransaction`.

**IPC:**

```ts
ipcMain.handle(
  'tags:batchAddTags',
  (_e, trackIds: number[], tagIds: { genreIds: number[]; subgenreIds: number[]; moodIds: number[] }): TrackTagIds[] => {
    if (tagIds.genreIds.length) addGenresToTracks(db, trackIds, tagIds.genreIds)
    if (tagIds.subgenreIds.length) addSubgenresToTracks(db, trackIds, tagIds.subgenreIds)
    if (tagIds.moodIds.length) addMoodsToTracks(db, trackIds, tagIds.moodIds)
    return trackIds.map((trackId) => ({ trackId, ...getTrackTagIds(db, trackId) }))
  }
)
```

**UI:**

- `TrackTable.tsx` gets a leftmost checkbox column: a header checkbox (checked when every currently-visible track is checked, toggling all visible tracks) and a per-row checkbox (`onClick` stops propagation so it doesn't also trigger the existing row-click-selects-for-detail behavior).
- New `src/components/BatchTagBar.tsx`: renders nothing when `checkedTrackIds.size === 0`. Otherwise shows the count selected, three `<select>` dropdowns (genre / sub-genre / mood) that immediately call `addTagsToCheckedTracks` with the chosen single id on `onChange` (reset to the placeholder option after), and a "Clear selection" button. Rendered above `TrackTable` in `App.tsx`'s center pane.

## 5. Export/import tag data

New file `electron/main/tagExport.ts`:

```ts
export interface TagExportData {
  version: 1
  genres: { name: string }[]
  subgenres: { name: string; genreName: string }[]
  moods: { name: string }[]
  tracks: {
    path: string
    genres: string[]
    subgenres: { name: string; genreName: string }[]
    moods: string[]
  }[]
}

export interface ImportResult {
  matchedTracks: number
  skippedTracks: number
}

export function exportTagData(db: AppDatabase): TagExportData
export function importTagData(db: AppDatabase, data: TagExportData): ImportResult
```

`exportTagData` queries genres/subgenres/moods (name-only, subgenres joined to their parent genre's name) and the three `track_*` join tables separately (each joined to its name table) — not one big multi-join query, which would produce a cartesian product across the three independent one-to-many relations per track. Rows are assembled per-track in JS (a `Map<trackId, {...}>`), matching the existing `getTrackTagIds`/`tracks:getAllTagIds` pattern already used elsewhere in this codebase.

`importTagData` runs inside `runInTransaction`: builds name→id maps for existing genres/subgenres (keyed by `` `${genreName}::${name}` `` since subgenre names aren't globally unique)/moods, find-or-creates any from `data` that don't already exist, then for each track entry looks it up by `path`; a match calls the same `addGenresToTracks`/`addSubgenresToTracks`/`addMoodsToTracks` functions from item 4 (import is additive, same as batch tag editing — never clears existing tags); no match increments `skippedTracks`.

**IPC** (file dialogs handled entirely in the main process — no need to pass file contents through IPC as a return value round-trip beyond the final result):

```ts
ipcMain.handle('tags:exportData', async (): Promise<{ path: string } | null> => {
  const result = await dialog.showSaveDialog(getMainWindow(), {
    defaultPath: 'tag-export.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return null
  writeFileSync(result.filePath, JSON.stringify(exportTagData(db), null, 2))
  return { path: result.filePath }
})

ipcMain.handle('tags:importData', async (): Promise<ImportResult | null> => {
  const result = await dialog.showOpenDialog(getMainWindow(), {
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const data = JSON.parse(readFileSync(result.filePaths[0], 'utf-8')) as TagExportData
  return importTagData(db, data)
})
```

**UI:** `SettingsModal.tsx` gets a "Tag data" section with "Export…" / "Import…" buttons, showing the result inline ("Exported to `<path>`" / "Imported: N matched, M skipped").

## 6. Keyboard shortcuts

- **Space (play/pause):** handled inside `Player.tsx` itself — it's only ever mounted for the currently-selected track, so a `window`-scoped `keydown` listener there naturally means "space controls whatever's selected," with no need to lift player state up. Guarded against firing while an `<input>`/`<textarea>`/`<select>` has focus (so typing in search/tag-name fields isn't hijacked).
- **↑/↓ (move track selection):** handled inside `TrackTable.tsx`, which already computes `visibleTracks`. Needs a new `selectedTrackId: number | null` prop from `App.tsx` (it currently only receives `onSelect`, not the current selection) to know the current position. Same input-focus guard as above.

## 7. Undo for `deleteGenre`

`tags.ts` gains a snapshot-and-restore pair, replacing the plain `deleteGenre` call sequence used today:

```ts
export interface GenreDeletionSnapshot {
  genreName: string
  subgenres: { name: string }[]
  trackGenreAssociations: { trackId: number }[]
  trackSubgenreAssociationsByName: Record<string, number[]> // subgenre name -> track ids
}

export function captureGenreDeletionSnapshot(db: AppDatabase, genreId: number): GenreDeletionSnapshot
export function undoGenreDeletion(db: AppDatabase, snapshot: GenreDeletionSnapshot): void
```

`captureGenreDeletionSnapshot` reads the genre's name, its subgenres' names, every `track_genres` row referencing it, and every `track_subgenres` row referencing each of its subgenres — all *before* `deleteGenre`'s cascade delete runs. `undoGenreDeletion` recreates the genre and subgenres via `createGenre`/`createSubgenre` (getting **new** ids — SQLite ids aren't meaningfully restorable, and nothing else references the old ones) and re-inserts the captured track associations against those new ids, inside `runInTransaction`. If a genre with the same name already exists by the time undo runs (e.g. the user manually recreated it), `createGenre` throws (its `UNIQUE` constraint) — the renderer surfaces this as a plain error, no special handling.

**IPC:** `tags:deleteGenre`'s handler now captures the snapshot before deleting and returns it instead of `void`; a new `tags:undoDeleteGenre` handler applies it:

```ts
ipcMain.handle('tags:deleteGenre', (_e, genreId: number): GenreDeletionSnapshot => {
  const snapshot = captureGenreDeletionSnapshot(db, genreId)
  deleteGenre(db, genreId)
  return snapshot
})
ipcMain.handle('tags:undoDeleteGenre', (_e, snapshot: GenreDeletionSnapshot): void => undoGenreDeletion(db, snapshot))
```

**Store:** `deleteGenre` keeps the snapshot (plus an 8-second auto-dismiss timer) instead of the caller needing to manage it. `pendingGenreDeletion` holds at most one entry — deleting a second genre while the first's undo toast is still showing clears the first's timer and replaces it, silently losing that first undo option. This is a deliberate simplification (no undo stack); acceptable since it's an unlikely sequence (delete, then delete again, within 8 seconds, without using the first undo) and a stack would add real complexity for a rare case.

```ts
pendingGenreDeletion: { snapshot: GenreDeletionSnapshot; timeoutId: ReturnType<typeof setTimeout> } | null
deleteGenre: (genreId: number) => Promise<void>       // captures + clears/sets the 8s timer
undoGenreDeletion: () => Promise<void>                  // clears the timer, calls undo, reloads
dismissGenreDeletionUndo: () => void                     // clears the timer without undoing
```

**UI:** `TagTree.tsx`'s delete button drops the `window.confirm()` entirely — it just calls `deleteGenre(genre.id)` directly. New `src/components/UndoToast.tsx`, a small fixed-position bar at the bottom of the screen ("Deleted "`<name>`"" + Undo + dismiss ✕ buttons), rendered from `App.tsx` whenever `pendingGenreDeletion` is non-null.

## Testing

Consistent with this codebase's established split: pure/data-layer logic (`backup.ts`'s new functions, `tags.ts`'s new functions, `tagExport.ts`) gets Vitest unit/integration tests using real temp files/an in-memory or temp-file `AppDatabase`, matching the existing `backup.test.ts`/`tags.test.ts` patterns. IPC wiring, main-process file-dialog flows, and React component changes have no automated test harness in this repo (no `@testing-library/react`, and IPC/`app.relaunch()` flows aren't practically unit-testable) — verified via `tsc -b --noEmit`, the existing test suite staying green, and a manual `npm run dev`/built-app walkthrough, same as every prior UI/IPC task in this project's plans.

## Out of scope

- Restoring a backup without relaunching the app (hot-swapping the live DB connection) — not worth the complexity for a rare, deliberate action.
- Any conflict-resolution UI for import beyond "match by path, skip what doesn't" — no merge strategy beyond additive.
- Batch tag *removal* (only batch *add* was requested).
- Configurable pruning count/keyboard shortcut rebinding — both hardcoded (30 backups, space/arrows) per the brainstorm decisions.
