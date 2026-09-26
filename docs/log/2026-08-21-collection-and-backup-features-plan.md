# Collection/Library + Backup Follow-up Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 7 items from `FUTURE_TODO.md`'s "Backup/settings follow-ups" and "Collection/library features" sections: surfacing backup failures, backup pruning, restore-from-backup, batch tag editing, tag data export/import, keyboard shortcuts, and undo for `deleteGenre`.

**Architecture:** Backend additions follow the existing pattern exactly — pure/testable functions in `electron/main/*.ts`, thin `ipcMain.handle` wiring in `ipc.ts`, typed `window.api` methods in preload, zustand store actions that apply server-authoritative responses (never re-deriving business logic client-side). UI additions are plain React components matching the existing hand-rolled inline-style convention (no new dependencies).

**Tech Stack:** Same as the existing app — Electron + `electron-vite` + React + TypeScript, `node:sqlite`, `electron-store`, `zustand`, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-21-collection-and-backup-features-design.md`

## Global Constraints

- TypeScript strict mode across main, preload, and renderer code.
- Type-check with `npx tsc -b --noEmit` (NOT plain `tsc --noEmit`, a silent no-op against this repo's solution-style `tsconfig.json`).
- Test runner: Vitest, run via `npm test`.
- Every `window.api` method must have an explicit return type.
- Renderer never touches Node/fs/DB directly — all access goes through the preload `contextBridge` API.
- Batch tag editing and tag-data import are both **additive only** — never clear/replace a track's existing tags.
- Backup pruning keeps the last 30 backups (count-based). No manual "back up now" trigger (unrelated to this plan — an earlier, still-standing decision).
- Commit after every task's final passing-test (or, for untested UI/IPC-wiring tasks, final `tsc -b --noEmit` clean) step.

---

## File Structure

```
electron/main/
  config.ts              -- MODIFY: lastBackupError get/set/clear (Task 1)
  config.test.ts           -- MODIFY (Task 1)
  index.ts                   -- MODIFY: performBackupCheck sets/clears lastBackupError (Task 2)
  backup.ts                    -- MODIFY: pruneOldBackups (Task 3), listBackups/restoreBackup (Task 4)
  backup.test.ts                 -- MODIFY (Tasks 3, 4)
  tags.ts                          -- MODIFY: addGenresToTracks/addSubgenresToTracks/addMoodsToTracks (Task 6), captureGenreDeletionSnapshot/undoGenreDeletion (Task 12)
  tags.test.ts                      -- MODIFY (Tasks 6, 12)
  tagExport.ts                        -- CREATE: exportTagData (Task 8), importTagData (Task 9)
  tagExport.test.ts                     -- CREATE (Tasks 8, 9)
  ipc.ts                                  -- MODIFY: backup:getInfo (Task 2), backup:list/restore (Task 5), tags:batchAddTags (Task 7), tags:exportData/importData (Task 10), tags:deleteGenre/undoDeleteGenre (Task 13)
electron/preload/
  index.ts                                  -- MODIFY: matching preload methods (Tasks 2, 5, 7, 10, 13)
src/
  types.ts                                    -- MODIFY: BackupInfo.lastBackupError (Task 2), BackupEntry (Task 5), GenreDeletionSnapshot/ImportResult (Tasks 10, 13)
  state/
    store.ts                                    -- MODIFY: checkedTrackIds+actions (Task 7), export/import actions (Task 10), pendingGenreDeletion+actions (Task 13)
  components/
    SettingsModal.tsx                             -- MODIFY: backup-error display (Task 2), restore section (Task 5), export/import section (Task 10)
    TrackTable.tsx                                  -- MODIFY: checkbox column (Task 7), arrow-key navigation (Task 11)
    BatchTagBar.tsx                                   -- CREATE (Task 7)
    Player.tsx                                          -- MODIFY: space-bar shortcut (Task 11)
    App.tsx                                               -- MODIFY: selectedTrackId prop (Task 11), UndoToast render (Task 13)
    TagTree.tsx                                             -- MODIFY: drop confirm(), call deleteGenre directly (Task 13)
    UndoToast.tsx                                             -- CREATE (Task 13)
```

---

## Task 1: config.ts — lastBackupError tracking

**Files:**
- Modify: `electron/main/config.ts`, `electron/main/config.test.ts`

**Interfaces:**
- Produces: `getLastBackupError(): string | null`, `setLastBackupError(message: string): void`, `clearLastBackupError(): void`. Consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Add to `electron/main/config.test.ts`, inside the existing `describe('config store', ...)` block (after the `it('exposes the config file path', ...)` test):

```ts
  it('returns null lastBackupError when unset', () => {
    expect(getLastBackupError()).toBeNull()
  })

  it('persists a set lastBackupError', () => {
    setLastBackupError('ENOSPC: no space left on device')
    expect(getLastBackupError()).toBe('ENOSPC: no space left on device')
  })

  it('clears lastBackupError', () => {
    setLastBackupError('some error')
    clearLastBackupError()
    expect(getLastBackupError()).toBeNull()
  })
```

Update the import line at the top of the file:

```ts
import {
  getCollectionFolder,
  setCollectionFolder,
  getLastBackupAt,
  setLastBackupAt,
  getConfigFilePath,
  getLastBackupError,
  setLastBackupError,
  clearLastBackupError,
  __setStoreForTests,
} from './config'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- config.test.ts`
Expected: FAIL — `getLastBackupError`/`setLastBackupError`/`clearLastBackupError` not defined.

- [ ] **Step 3: Implement**

In `electron/main/config.ts`, change the schema:

```ts
interface ConfigSchema {
  collectionFolder?: string
  lastBackupAt?: string
  lastBackupError?: string
}
```

Add these three functions after the existing `getConfigFilePath`:

```ts
export function getLastBackupError(): string | null {
  return getStore().get('lastBackupError') ?? null
}

export function setLastBackupError(message: string): void {
  getStore().set('lastBackupError', message)
}

export function clearLastBackupError(): void {
  getStore().delete('lastBackupError')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- config.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add electron/main/config.ts electron/main/config.test.ts
git commit -m "feat: add lastBackupError tracking to config store"
```

---

## Task 2: Surface backup failures in the Settings modal

**Files:**
- Modify: `electron/main/index.ts`, `electron/main/ipc.ts`, `electron/preload/index.ts`, `src/types.ts`, `src/components/SettingsModal.tsx`
- Test: none (main-process wiring + UI — see prior plans' precedent; verified via `tsc -b --noEmit` and this task's Step 6 manual walkthrough)

**Interfaces:**
- Consumes: `getLastBackupError`, `setLastBackupError`, `clearLastBackupError` (Task 1).
- Produces: `BackupInfo.lastBackupError: string | null` flowing through IPC/preload to the UI. No later task depends on this directly.

- [ ] **Step 1: Update `BackupInfo`**

In `src/types.ts`, change:

```ts
export interface BackupInfo {
  backupFolder: string
  lastBackupAt: string | null
}
```

to:

```ts
export interface BackupInfo {
  backupFolder: string
  lastBackupAt: string | null
  lastBackupError: string | null
}
```

- [ ] **Step 2: Update `performBackupCheck` in `index.ts`**

Change the import line:

```ts
import { getCollectionFolder, getConfigFilePath } from './config'
```

to:

```ts
import { getCollectionFolder, getConfigFilePath, setLastBackupError, clearLastBackupError } from './config'
```

Change `performBackupCheck`:

```ts
function performBackupCheck(db: ReturnType<typeof openDatabase>): void {
  try {
    runBackupIfNeeded(db, getConfigFilePath(), getBackupFolder(app.getPath('userData')), new Date())
    clearLastBackupError()
  } catch (err) {
    console.error('backup failed', err)
    setLastBackupError(err instanceof Error ? err.message : String(err))
  }
}
```

- [ ] **Step 3: Update the `backup:getInfo` IPC handler**

In `electron/main/ipc.ts`, change the import line:

```ts
import { getCollectionFolder, setCollectionFolder, getLastBackupAt } from './config'
```

to:

```ts
import { getCollectionFolder, setCollectionFolder, getLastBackupAt, getLastBackupError } from './config'
```

Change the handler:

```ts
  ipcMain.handle('backup:getInfo', (): BackupInfo => ({
    backupFolder,
    lastBackupAt: getLastBackupAt(),
    lastBackupError: getLastBackupError(),
  }))
```

- [ ] **Step 4: Preload — no change needed**

`getBackupInfo: (): Promise<BackupInfo> => ipcRenderer.invoke('backup:getInfo')` already returns the full (now-extended) `BackupInfo` type — nothing to edit in `electron/preload/index.ts` for this task.

- [ ] **Step 5: Show the error in `SettingsModal.tsx`**

Change:

```tsx
        <section>
          <h3 style={{ color: 'var(--color-text-dim)', margin: '0 0 8px' }}>Backups</h3>
          {backupInfo ? (
            <>
              <p style={{ margin: '0 0 4px', wordBreak: 'break-all' }}>{backupInfo.backupFolder}</p>
              <p style={{ margin: 0, color: 'var(--color-text-dim)', fontSize: '12px' }}>
                Last backup:{' '}
                {backupInfo.lastBackupAt ? new Date(backupInfo.lastBackupAt).toLocaleString() : 'Never yet'}
              </p>
            </>
          ) : (
            <p style={{ margin: 0, color: 'var(--color-text-dim)' }}>Loading…</p>
          )}
        </section>
```

to:

```tsx
        <section>
          <h3 style={{ color: 'var(--color-text-dim)', margin: '0 0 8px' }}>Backups</h3>
          {backupInfo ? (
            <>
              <p style={{ margin: '0 0 4px', wordBreak: 'break-all' }}>{backupInfo.backupFolder}</p>
              <p style={{ margin: 0, color: 'var(--color-text-dim)', fontSize: '12px' }}>
                Last backup:{' '}
                {backupInfo.lastBackupAt ? new Date(backupInfo.lastBackupAt).toLocaleString() : 'Never yet'}
              </p>
              {backupInfo.lastBackupError && (
                <p style={{ margin: '4px 0 0', color: 'var(--color-secondary)', fontSize: '12px' }}>
                  ⚠ Last backup failed: {backupInfo.lastBackupError}
                </p>
              )}
            </>
          ) : (
            <p style={{ margin: 0, color: 'var(--color-text-dim)' }}>Loading…</p>
          )}
        </section>
```

- [ ] **Step 6: Type-check and manual walkthrough**

Run: `npx tsc -b --noEmit`
Expected: no errors.

Run: `npm run dev`, open DevTools console, run `await window.api.getBackupInfo()`.
Expected: resolves to an object with a `lastBackupError` key (`null` if the last backup succeeded).

- [ ] **Step 7: Commit**

```bash
git add electron/main/index.ts electron/main/ipc.ts src/types.ts src/components/SettingsModal.tsx
git commit -m "feat: surface backup failures in the Settings modal"
```

---

## Task 3: Backup pruning

**Files:**
- Modify: `electron/main/backup.ts`, `electron/main/backup.test.ts`

**Interfaces:**
- Produces: `pruneOldBackups(backupFolder: string, keep: number): void`. Consumed internally by `runBackupIfNeeded` (modified signature: `runBackupIfNeeded(db, configFilePath, backupFolder, now, keep = 30)`).

- [ ] **Step 1: Write the failing tests**

Add to `electron/main/backup.test.ts`, as a new top-level `describe` block (after the existing `describe('runBackup / runBackupIfNeeded', ...)` block):

```ts
describe('pruneOldBackups', () => {
  let dir: string
  let backupFolder: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prune-test-'))
    backupFolder = join(dir, 'backups')
    mkdirSync(backupFolder, { recursive: true })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function writeBackupPair(timestamp: string) {
    writeFileSync(join(backupFolder, `collection-${timestamp}.db`), 'x')
    writeFileSync(join(backupFolder, `config-${timestamp}.json`), '{}')
  }

  it('deletes both files of the oldest pairs beyond the keep count', () => {
    const timestamps = ['2026-08-18T00-00-00-000Z', '2026-08-19T00-00-00-000Z', '2026-08-20T00-00-00-000Z']
    for (const ts of timestamps) writeBackupPair(ts)

    pruneOldBackups(backupFolder, 2)

    const remaining = readdirSync(backupFolder).sort()
    expect(remaining).toEqual([
      'collection-2026-08-19T00-00-00-000Z.db',
      'collection-2026-08-20T00-00-00-000Z.db',
      'config-2026-08-19T00-00-00-000Z.json',
      'config-2026-08-20T00-00-00-000Z.json',
    ])
  })

  it('is a no-op when the count is within the keep limit', () => {
    writeBackupPair('2026-08-20T00-00-00-000Z')
    pruneOldBackups(backupFolder, 30)
    expect(readdirSync(backupFolder)).toHaveLength(2)
  })

  it('does not throw when the backup folder does not exist', () => {
    rmSync(backupFolder, { recursive: true, force: true })
    expect(() => pruneOldBackups(backupFolder, 30)).not.toThrow()
  })
})
```

Update the import line at the top of the file:

```ts
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
```

to:

```ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
```

And update the `backup.ts` import line:

```ts
import { shouldBackupToday, runBackup, runBackupIfNeeded, getBackupFolder } from './backup'
```

to:

```ts
import { shouldBackupToday, runBackup, runBackupIfNeeded, getBackupFolder, pruneOldBackups } from './backup'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- backup.test.ts`
Expected: FAIL — `pruneOldBackups` not defined.

- [ ] **Step 3: Implement**

In `electron/main/backup.ts`, add to the imports:

```ts
import { mkdirSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs'
```

(replacing the existing `import { mkdirSync, copyFileSync } from 'node:fs'` line).

Add this function after `runBackup`:

```ts
export function pruneOldBackups(backupFolder: string, keep: number): void {
  let files: string[]
  try {
    files = readdirSync(backupFolder)
  } catch {
    return // backup folder doesn't exist yet — nothing to prune
  }

  const timestamps = new Set<string>()
  for (const file of files) {
    const match = file.match(/^collection-(.+)\.db$/)
    if (match) timestamps.add(match[1])
  }

  // ISO-derived timestamps (with : and . replaced by -) sort chronologically
  // as plain strings, so lexicographic sort is correct here.
  const sorted = [...timestamps].sort()
  const toDelete = sorted.slice(0, Math.max(0, sorted.length - keep))

  for (const timestamp of toDelete) {
    for (const [prefix, ext] of [
      ['collection', 'db'],
      ['config', 'json'],
    ] as const) {
      try {
        unlinkSync(join(backupFolder, `${prefix}-${timestamp}.${ext}`))
      } catch {
        // best effort — already gone is fine
      }
    }
  }
}
```

Change `runBackupIfNeeded`:

```ts
export function runBackupIfNeeded(
  db: AppDatabase,
  configFilePath: string,
  backupFolder: string,
  now: Date,
  keep = 30
): void {
  if (!shouldBackupToday(getLastBackupAt(), now)) return
  runBackup(db, configFilePath, backupFolder, now)
  setLastBackupAt(now.toISOString())
  try {
    pruneOldBackups(backupFolder, keep)
  } catch (err) {
    // A pruning failure must never mark an otherwise-successful backup as
    // failed (index.ts's performBackupCheck would set lastBackupError from
    // any exception this function throws).
    console.error('pruneOldBackups failed', err)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- backup.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add electron/main/backup.ts electron/main/backup.test.ts
git commit -m "feat: prune backups beyond the most recent 30"
```

---

## Task 4: backup.ts — listBackups / restoreBackup

**Files:**
- Modify: `electron/main/backup.ts`, `electron/main/backup.test.ts`

**Interfaces:**
- Produces: `BackupEntry { timestamp: string; dbPath: string; configPath: string }`, `listBackups(backupFolder: string): BackupEntry[]`, `restoreBackup(entry: BackupEntry, dbFilePath: string, configFilePath: string): void`. Consumed by Task 5 (`ipc.ts`).

- [ ] **Step 1: Write the failing tests**

Add to `electron/main/backup.test.ts`, as a new top-level `describe` block:

```ts
describe('listBackups / restoreBackup', () => {
  let dir: string
  let backupFolder: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'restore-test-'))
    backupFolder = join(dir, 'backups')
    mkdirSync(backupFolder, { recursive: true })
    writeFileSync(join(backupFolder, 'collection-2026-08-19T00-00-00-000Z.db'), 'old-db')
    writeFileSync(join(backupFolder, 'config-2026-08-19T00-00-00-000Z.json'), '{"old":true}')
    writeFileSync(join(backupFolder, 'collection-2026-08-20T00-00-00-000Z.db'), 'new-db')
    writeFileSync(join(backupFolder, 'config-2026-08-20T00-00-00-000Z.json'), '{"new":true}')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('lists backups newest first', () => {
    const entries = listBackups(backupFolder)
    expect(entries.map((e) => e.timestamp)).toEqual([
      '2026-08-20T00-00-00-000Z',
      '2026-08-19T00-00-00-000Z',
    ])
    expect(entries[0].dbPath).toBe(join(backupFolder, 'collection-2026-08-20T00-00-00-000Z.db'))
    expect(entries[0].configPath).toBe(join(backupFolder, 'config-2026-08-20T00-00-00-000Z.json'))
  })

  it('returns an empty list when the backup folder does not exist', () => {
    rmSync(backupFolder, { recursive: true, force: true })
    expect(listBackups(backupFolder)).toEqual([])
  })

  it('restoreBackup copies the chosen snapshot over the live file paths', () => {
    const entries = listBackups(backupFolder)
    const oldEntry = entries.find((e) => e.timestamp === '2026-08-19T00-00-00-000Z')!

    const liveDbPath = join(dir, 'collection.db')
    const liveConfigPath = join(dir, 'config.json')
    writeFileSync(liveDbPath, 'current-db')
    writeFileSync(liveConfigPath, '{"current":true}')

    restoreBackup(oldEntry, liveDbPath, liveConfigPath)

    expect(readFileSync(liveDbPath, 'utf-8')).toBe('old-db')
    expect(readFileSync(liveConfigPath, 'utf-8')).toBe('{"old":true}')
  })
})
```

Update the `backup.ts` import line to add `listBackups` and `restoreBackup`:

```ts
import { shouldBackupToday, runBackup, runBackupIfNeeded, getBackupFolder, pruneOldBackups, listBackups, restoreBackup } from './backup'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- backup.test.ts`
Expected: FAIL — `listBackups`/`restoreBackup` not defined.

- [ ] **Step 3: Implement**

Add to `electron/main/backup.ts`'s imports:

```ts
import { mkdirSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs'
```

(unchanged from Task 3 — no new import needed here, `copyFileSync`/`readdirSync` are already imported).

Add after `pruneOldBackups`:

```ts
export interface BackupEntry {
  timestamp: string
  dbPath: string
  configPath: string
}

export function listBackups(backupFolder: string): BackupEntry[] {
  let files: string[]
  try {
    files = readdirSync(backupFolder)
  } catch {
    return []
  }

  const timestamps = new Set<string>()
  for (const file of files) {
    const match = file.match(/^collection-(.+)\.db$/)
    if (match) timestamps.add(match[1])
  }

  return [...timestamps]
    .sort()
    .reverse()
    .map((timestamp) => ({
      timestamp,
      dbPath: join(backupFolder, `collection-${timestamp}.db`),
      configPath: join(backupFolder, `config-${timestamp}.json`),
    }))
}

export function restoreBackup(entry: BackupEntry, dbFilePath: string, configFilePath: string): void {
  copyFileSync(entry.dbPath, dbFilePath)
  copyFileSync(entry.configPath, configFilePath)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- backup.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add electron/main/backup.ts electron/main/backup.test.ts
git commit -m "feat: add listBackups and restoreBackup to backup.ts"
```

---

## Task 5: Restore-from-backup IPC + UI

**Files:**
- Modify: `electron/main/ipc.ts`, `electron/preload/index.ts`, `src/types.ts`, `src/components/SettingsModal.tsx`
- Test: none (IPC wiring + UI — verified via `tsc -b --noEmit` and manual walkthrough)

**Interfaces:**
- Consumes: `listBackups`, `restoreBackup`, `BackupEntry` (Task 4).
- Produces: `window.api.listBackups(): Promise<BackupEntry[]>`, `window.api.restoreBackup(timestamp: string): Promise<void>`. No later task depends on this.

- [ ] **Step 1: Add `BackupEntry` to `src/types.ts`**

Add at the end of the file:

```ts
export interface BackupEntry {
  timestamp: string
  dbPath: string
  configPath: string
}
```

- [ ] **Step 2: Add the IPC handlers**

In `electron/main/ipc.ts`, change the top import line:

```ts
import { ipcMain, dialog, BrowserWindow } from 'electron'
```

to:

```ts
import { app, ipcMain, dialog, BrowserWindow } from 'electron'
import { join } from 'node:path'
```

Add a new import line for `backup.ts`:

```ts
import { listBackups, restoreBackup } from './backup'
```

And extend the existing `./config` import line:

```ts
import { getCollectionFolder, setCollectionFolder, getLastBackupAt, getLastBackupError } from './config'
```

to:

```ts
import { getCollectionFolder, setCollectionFolder, getLastBackupAt, getLastBackupError, getConfigFilePath } from './config'
```

Add `BackupEntry` to the existing `../../src/types` import line.

Add these two handlers inside `registerIpcHandlers`, alongside the other `backup:*` handler:

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

- [ ] **Step 3: Add the preload methods**

In `electron/preload/index.ts`, add `BackupEntry` to the existing `../../src/types` import line.

Add these two methods to the `api` object, alongside `getBackupInfo`:

```ts
  listBackups: (): Promise<BackupEntry[]> => ipcRenderer.invoke('backup:list'),
  restoreBackup: (timestamp: string): Promise<void> => ipcRenderer.invoke('backup:restore', timestamp),
```

- [ ] **Step 4: Add the restore section to `SettingsModal.tsx`**

Add this new `useState` alongside the existing `backupInfo` one:

```tsx
  const [backups, setBackups] = useState<BackupEntry[]>([])
```

Add `BackupEntry` to the `../types` import line.

Change the `useEffect` that fetches `backupInfo` on open:

```tsx
  useEffect(() => {
    if (open) {
      window.api.getBackupInfo().then(setBackupInfo)
    }
  }, [open])
```

to also fetch the backup list:

```tsx
  useEffect(() => {
    if (open) {
      window.api.getBackupInfo().then(setBackupInfo)
      window.api.listBackups().then(setBackups)
    }
  }, [open])
```

Add this helper function above the `SettingsModal` component:

```tsx
// Backup filenames use `now.toISOString().replace(/[:.]/g, '-')` (see
// electron/main/backup.ts) — undo that by re-inserting the standard ISO
// separators positionally rather than trying to regex-guess which dashes
// were colons. Format: YYYY-MM-DDTHH-MM-SS-mmmZ (24 chars incl. Z).
function parseBackupTimestamp(timestamp: string): Date {
  const iso = `${timestamp.slice(0, 13)}:${timestamp.slice(14, 16)}:${timestamp.slice(17, 19)}.${timestamp.slice(20, 23)}Z`
  return new Date(iso)
}
```

Add this new `<section>` after the existing "Backups" section (right before the closing `</div>` of the modal panel), using `parseBackupTimestamp` to render each entry's timestamp:

```tsx
        <section style={{ marginTop: '20px' }}>
          <h3 style={{ color: 'var(--color-text-dim)', margin: '0 0 8px' }}>Restore</h3>
          {backups.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--color-text-dim)', fontSize: '12px' }}>No backups yet.</p>
          ) : (
            <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
              {backups.map((entry) => (
                <div
                  key={entry.timestamp}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}
                >
                  <span style={{ fontSize: '12px' }}>{parseBackupTimestamp(entry.timestamp).toLocaleString()}</span>
                  <button
                    onClick={async () => {
                      if (
                        window.confirm(
                          'Restore this backup? This overwrites the current collection and config, then relaunches the app.'
                        )
                      ) {
                        await window.api.restoreBackup(entry.timestamp)
                      }
                    }}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual walkthrough**

Run: `npm run dev`, open Settings, confirm the Restore section lists any existing backups with readable dates (or "No backups yet." if none exist). Do not actually click Restore in this walkthrough unless you want the app to relaunch.

- [ ] **Step 7: Commit**

```bash
git add electron/main/ipc.ts electron/preload/index.ts src/types.ts src/components/SettingsModal.tsx
git commit -m "feat: add restore-from-backup IPC and Settings modal UI"
```

---

## Task 6: tags.ts — batch-add functions

**Files:**
- Modify: `electron/main/tags.ts`, `electron/main/tags.test.ts`

**Interfaces:**
- Produces: `addGenresToTracks(db, trackIds: number[], genreIds: number[]): void`, `addSubgenresToTracks(db, trackIds: number[], subgenreIds: number[]): void`, `addMoodsToTracks(db, trackIds: number[], moodIds: number[]): void`. Consumed by Task 7 (batch UI) and Task 9 (import).

- [ ] **Step 1: Write the failing tests**

Add to `electron/main/tags.test.ts`, inside the existing `describe('tags', ...)` block (after the last existing `it`):

```ts
  it('addGenresToTracks adds a genre to multiple tracks without touching their other tags', () => {
    const houseId = createGenre(db, 'House')
    const technoId = createGenre(db, 'Techno')
    const track2Id = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/b.wav','b.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number

    setTrackGenres(db, trackId, [technoId]) // pre-existing tag that should survive

    addGenresToTracks(db, [trackId, track2Id], [houseId])

    expect(getTrackTagIds(db, trackId).genreIds.sort()).toEqual([houseId, technoId].sort())
    expect(getTrackTagIds(db, track2Id).genreIds).toEqual([houseId])
  })

  it('addGenresToTracks is a harmless no-op when the track already has the genre', () => {
    const houseId = createGenre(db, 'House')
    setTrackGenres(db, trackId, [houseId])

    expect(() => addGenresToTracks(db, [trackId], [houseId])).not.toThrow()
    expect(getTrackTagIds(db, trackId).genreIds).toEqual([houseId])
  })

  it('addSubgenresToTracks adds a sub-genre to multiple tracks', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    const track2Id = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/c.wav','c.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number

    addSubgenresToTracks(db, [trackId, track2Id], [deepHouseId])

    expect(getTrackTagIds(db, trackId).subgenreIds).toEqual([deepHouseId])
    expect(getTrackTagIds(db, track2Id).subgenreIds).toEqual([deepHouseId])
  })

  it('addMoodsToTracks adds a mood to multiple tracks', () => {
    const energeticId = createMood(db, 'Energetic')
    const track2Id = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/d.wav','d.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number

    addMoodsToTracks(db, [trackId, track2Id], [energeticId])

    expect(getTrackTagIds(db, trackId).moodIds).toEqual([energeticId])
    expect(getTrackTagIds(db, track2Id).moodIds).toEqual([energeticId])
  })
```

Update the import line at the top of the file:

```ts
import {
  createGenre,
  createSubgenre,
  createMood,
  deleteGenre,
  setTrackGenres,
  setTrackSubgenres,
  setTrackMoods,
  getTrackTagIds,
  addGenresToTracks,
  addSubgenresToTracks,
  addMoodsToTracks,
} from './tags'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tags.test.ts`
Expected: FAIL — `addGenresToTracks`/`addSubgenresToTracks`/`addMoodsToTracks` not defined.

- [ ] **Step 3: Implement**

Add to `electron/main/tags.ts`, after `getTrackTagIds`:

```ts
export function addGenresToTracks(db: AppDatabase, trackIds: number[], genreIds: number[]): void {
  runInTransaction(db, () => {
    for (const trackId of trackIds) {
      for (const genreId of genreIds) {
        db.prepare('INSERT OR IGNORE INTO track_genres (track_id, genre_id) VALUES (?, ?)').run(trackId, genreId)
      }
    }
  })
}

export function addSubgenresToTracks(db: AppDatabase, trackIds: number[], subgenreIds: number[]): void {
  runInTransaction(db, () => {
    for (const trackId of trackIds) {
      for (const subgenreId of subgenreIds) {
        db.prepare('INSERT OR IGNORE INTO track_subgenres (track_id, subgenre_id) VALUES (?, ?)').run(
          trackId,
          subgenreId
        )
      }
    }
  })
}

export function addMoodsToTracks(db: AppDatabase, trackIds: number[], moodIds: number[]): void {
  runInTransaction(db, () => {
    for (const trackId of trackIds) {
      for (const moodId of moodIds) {
        db.prepare('INSERT OR IGNORE INTO track_moods (track_id, mood_id) VALUES (?, ?)').run(trackId, moodId)
      }
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tags.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add electron/main/tags.ts electron/main/tags.test.ts
git commit -m "feat: add batch add-tag functions to tags.ts"
```

---

## Task 7: Batch tag editing UI

**Files:**
- Modify: `electron/main/ipc.ts`, `electron/preload/index.ts`, `src/state/store.ts`, `src/components/TrackTable.tsx`
- Create: `src/components/BatchTagBar.tsx`
- Modify: `src/App.tsx`
- Test: none (IPC wiring + store + UI — verified via `tsc -b --noEmit` and manual walkthrough)

**Interfaces:**
- Consumes: `addGenresToTracks`, `addSubgenresToTracks`, `addMoodsToTracks` (Task 6), `TrackTagIds` (existing, `src/state/tagFilter.ts`).
- Produces: `window.api.batchAddTags(trackIds, tagIds): Promise<TrackTagIds[]>`, store's `checkedTrackIds`/`toggleTrackChecked`/`setTracksChecked`/`clearCheckedTracks`/`addTagsToCheckedTracks`. No later task depends on this.

- [ ] **Step 1: Add the IPC handler**

In `electron/main/ipc.ts`, change the `./tags` import line:

```ts
import {
  createGenre,
  createSubgenre,
  createMood,
  deleteGenre,
  setTrackGenres,
  setTrackSubgenres,
  setTrackMoods,
  getTrackTagIds,
} from './tags'
```

to:

```ts
import {
  createGenre,
  createSubgenre,
  createMood,
  deleteGenre,
  setTrackGenres,
  setTrackSubgenres,
  setTrackMoods,
  getTrackTagIds,
  addGenresToTracks,
  addSubgenresToTracks,
  addMoodsToTracks,
} from './tags'
```

Add this handler inside `registerIpcHandlers`, alongside the other `tags:*` handlers:

```ts
  ipcMain.handle(
    'tags:batchAddTags',
    (
      _e,
      trackIds: number[],
      tagIds: { genreIds: number[]; subgenreIds: number[]; moodIds: number[] }
    ): TrackTagIds[] => {
      if (tagIds.genreIds.length) addGenresToTracks(db, trackIds, tagIds.genreIds)
      if (tagIds.subgenreIds.length) addSubgenresToTracks(db, trackIds, tagIds.subgenreIds)
      if (tagIds.moodIds.length) addMoodsToTracks(db, trackIds, tagIds.moodIds)
      return trackIds.map((trackId) => ({ trackId, ...getTrackTagIds(db, trackId) }))
    }
  )
```

- [ ] **Step 2: Add the preload method**

In `electron/preload/index.ts`, add to the `api` object, alongside the other `tags:*` methods:

```ts
  batchAddTags: (
    trackIds: number[],
    tagIds: { genreIds: number[]; subgenreIds: number[]; moodIds: number[] }
  ): Promise<TrackTagIds[]> => ipcRenderer.invoke('tags:batchAddTags', trackIds, tagIds),
```

- [ ] **Step 3: Add store state and actions**

In `src/state/store.ts`, add to the `CollectionState` interface (after `trackTags: Map<number, TrackTagIds>`):

```ts
  checkedTrackIds: Set<number>
```

And to the action list (after `deleteGenre: (genreId: number) => Promise<void>`):

```ts
  toggleTrackChecked: (trackId: number) => void
  setTracksChecked: (trackIds: number[], checked: boolean) => void
  clearCheckedTracks: () => void
  addTagsToCheckedTracks: (tagIds: { genreIds: number[]; subgenreIds: number[]; moodIds: number[] }) => Promise<void>
```

Add the initial state (after `trackTags: new Map(),`):

```ts
  checkedTrackIds: new Set(),
```

Add these actions after the existing `deleteGenre` action:

```ts
  toggleTrackChecked: (trackId) => {
    const next = new Set(get().checkedTrackIds)
    if (next.has(trackId)) next.delete(trackId)
    else next.add(trackId)
    set({ checkedTrackIds: next })
  },

  setTracksChecked: (trackIds, checked) => {
    const next = new Set(get().checkedTrackIds)
    for (const id of trackIds) {
      if (checked) next.add(id)
      else next.delete(id)
    }
    set({ checkedTrackIds: next })
  },

  clearCheckedTracks: () => set({ checkedTrackIds: new Set() }),

  addTagsToCheckedTracks: async (tagIds) => {
    const trackIds = Array.from(get().checkedTrackIds)
    if (trackIds.length === 0) return
    const updated = await window.api.batchAddTags(trackIds, tagIds)
    const trackTags = new Map(get().trackTags)
    for (const u of updated) trackTags.set(u.trackId, u)
    set({ trackTags })
  },
```

- [ ] **Step 4: Add checkboxes to `TrackTable.tsx`**

Add these two store reads near the existing ones:

```tsx
  const checkedTrackIds = useCollectionStore((s) => s.checkedTrackIds)
  const toggleTrackChecked = useCollectionStore((s) => s.toggleTrackChecked)
  const setTracksChecked = useCollectionStore((s) => s.setTracksChecked)
```

Change the header row:

```tsx
          <tr>
            {columns.map((col) => (
```

to:

```tsx
          <tr>
            <th style={cellStyle}>
              <input
                type="checkbox"
                checked={visibleTracks.length > 0 && visibleTracks.every((t) => checkedTrackIds.has(t.id))}
                onChange={(e) => setTracksChecked(visibleTracks.map((t) => t.id), e.target.checked)}
              />
            </th>
            {columns.map((col) => (
```

Change the row rendering:

```tsx
            <tr key={track.id} onClick={() => onSelect(track)} style={{ cursor: 'pointer' }}>
              <td style={cellStyle}>{track.title ?? track.filename}</td>
```

to:

```tsx
            <tr key={track.id} onClick={() => onSelect(track)} style={{ cursor: 'pointer' }}>
              <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={checkedTrackIds.has(track.id)}
                  onChange={() => toggleTrackChecked(track.id)}
                />
              </td>
              <td style={cellStyle}>{track.title ?? track.filename}</td>
```

- [ ] **Step 5: Create `BatchTagBar.tsx`**

```tsx
// src/components/BatchTagBar.tsx
import { useCollectionStore } from '../state/store'

export function BatchTagBar() {
  const checkedTrackIds = useCollectionStore((s) => s.checkedTrackIds)
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const moods = useCollectionStore((s) => s.moods)
  const addTagsToCheckedTracks = useCollectionStore((s) => s.addTagsToCheckedTracks)
  const clearCheckedTracks = useCollectionStore((s) => s.clearCheckedTracks)

  if (checkedTrackIds.size === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
      }}
    >
      <span>{checkedTrackIds.size} selected</span>
      <select
        value=""
        onChange={(e) => {
          const id = Number(e.target.value)
          if (id) addTagsToCheckedTracks({ genreIds: [id], subgenreIds: [], moodIds: [] })
        }}
      >
        <option value="">+ Add genre…</option>
        {genres.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <select
        value=""
        onChange={(e) => {
          const id = Number(e.target.value)
          if (id) addTagsToCheckedTracks({ genreIds: [], subgenreIds: [id], moodIds: [] })
        }}
      >
        <option value="">+ Add sub-genre…</option>
        {subgenres.map((sg) => (
          <option key={sg.id} value={sg.id}>
            {sg.name}
          </option>
        ))}
      </select>
      <select
        value=""
        onChange={(e) => {
          const id = Number(e.target.value)
          if (id) addTagsToCheckedTracks({ genreIds: [], subgenreIds: [], moodIds: [id] })
        }}
      >
        <option value="">+ Add mood…</option>
        {moods.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <button onClick={clearCheckedTracks}>Clear selection</button>
    </div>
  )
}
```

- [ ] **Step 6: Render it in `App.tsx`**

Add to the imports:

```tsx
import { BatchTagBar } from './components/BatchTagBar'
```

Change:

```tsx
        <div className="pane" style={{ gridArea: 'center' }}>
          <TrackTable onSelect={setSelectedTrack} selectedFolder={selectedFolder} activeFilter={tagFilter} />
        </div>
```

to:

```tsx
        <div className="pane" style={{ gridArea: 'center' }}>
          <BatchTagBar />
          <TrackTable onSelect={setSelectedTrack} selectedFolder={selectedFolder} activeFilter={tagFilter} />
        </div>
```

- [ ] **Step 7: Type-check and manual walkthrough**

Run: `npx tsc -b --noEmit`
Expected: no errors.

Run: `npm run dev`, check a few track checkboxes, confirm the batch bar appears with the right count, pick a genre from the dropdown, confirm it gets added to all checked tracks' tag state (verify by selecting one of the checked tracks in the detail panel) without removing any tags it already had.

- [ ] **Step 8: Commit**

```bash
git add electron/main/ipc.ts electron/preload/index.ts src/state/store.ts src/components/TrackTable.tsx src/components/BatchTagBar.tsx src/App.tsx
git commit -m "feat: add batch tag editing (checkboxes + add-tag bar)"
```

---

## Task 8: tagExport.ts — exportTagData

**Files:**
- Create: `electron/main/tagExport.ts`, `electron/main/tagExport.test.ts`

**Interfaces:**
- Produces: `TagExportData` interface, `exportTagData(db: AppDatabase): TagExportData`. Consumed by Task 9 (`importTagData` takes the same `TagExportData` shape) and Task 10 (IPC handler).

- [ ] **Step 1: Write the failing tests**

```ts
// electron/main/tagExport.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase, type AppDatabase } from './db'
import { createGenre, createSubgenre, createMood, setTrackGenres, setTrackSubgenres, setTrackMoods } from './tags'
import { exportTagData } from './tagExport'

describe('exportTagData', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = openDatabase(':memory:')
  })

  it('exports the full genre/subgenre/mood catalog by name', () => {
    const houseId = createGenre(db, 'House')
    createSubgenre(db, 'Deep House', houseId)
    createMood(db, 'Energetic')

    const data = exportTagData(db)

    expect(data.version).toBe(1)
    expect(data.genres).toEqual([{ name: 'House' }])
    expect(data.subgenres).toEqual([{ name: 'Deep House', genreName: 'House' }])
    expect(data.moods).toEqual([{ name: 'Energetic' }])
  })

  it('exports each tagged track by path with its tag names', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    const energeticId = createMood(db, 'Energetic')
    const trackId = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/a.wav','a.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number

    setTrackGenres(db, trackId, [houseId])
    setTrackSubgenres(db, trackId, [deepHouseId])
    setTrackMoods(db, trackId, [energeticId])

    const data = exportTagData(db)

    expect(data.tracks).toEqual([
      {
        path: '/a.wav',
        genres: ['House'],
        subgenres: [{ name: 'Deep House', genreName: 'House' }],
        moods: ['Energetic'],
      },
    ])
  })

  it('omits untagged tracks from the tracks list', () => {
    db.prepare(
      `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/untagged.wav','untagged.wav','/', 'wav', 1, 1)`
    ).run()

    const data = exportTagData(db)

    expect(data.tracks).toEqual([])
  })

  it('does not produce a cartesian product when a track has multiple tags of different kinds', () => {
    const houseId = createGenre(db, 'House')
    const technoId = createGenre(db, 'Techno')
    const energeticId = createMood(db, 'Energetic')
    const darkId = createMood(db, 'Dark')
    const trackId = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/b.wav','b.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number

    setTrackGenres(db, trackId, [houseId, technoId])
    setTrackMoods(db, trackId, [energeticId, darkId])

    const data = exportTagData(db)

    expect(data.tracks).toHaveLength(1)
    expect(data.tracks[0].genres.sort()).toEqual(['House', 'Techno'])
    expect(data.tracks[0].moods.sort()).toEqual(['Dark', 'Energetic'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tagExport.test.ts`
Expected: FAIL — `tagExport.ts` module not found.

- [ ] **Step 3: Implement**

```ts
// electron/main/tagExport.ts
import type { AppDatabase } from './db'

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

export function exportTagData(db: AppDatabase): TagExportData {
  const genres = db.prepare('SELECT name FROM genres').all() as { name: string }[]
  const subgenres = db
    .prepare(`SELECT s.name as name, g.name as genre_name FROM subgenres s JOIN genres g ON g.id = s.genre_id`)
    .all() as { name: string; genre_name: string }[]
  const moods = db.prepare('SELECT name FROM moods').all() as { name: string }[]

  const trackPaths = db.prepare('SELECT id, path FROM tracks').all() as { id: number; path: string }[]
  const pathById = new Map(trackPaths.map((t) => [t.id, t.path]))

  // Three separate queries (not one multi-join) — joining track_genres,
  // track_subgenres, and track_moods together in one query would produce a
  // cartesian product across the three independent one-to-many relations
  // for any track with more than one tag of more than one kind.
  const genreRows = db
    .prepare(`SELECT tg.track_id as track_id, g.name as name FROM track_genres tg JOIN genres g ON g.id = tg.genre_id`)
    .all() as { track_id: number; name: string }[]
  const subgenreRows = db
    .prepare(
      `SELECT tsg.track_id as track_id, s.name as name, g.name as genre_name
       FROM track_subgenres tsg
       JOIN subgenres s ON s.id = tsg.subgenre_id
       JOIN genres g ON g.id = s.genre_id`
    )
    .all() as { track_id: number; name: string; genre_name: string }[]
  const moodRows = db
    .prepare(`SELECT tm.track_id as track_id, m.name as name FROM track_moods tm JOIN moods m ON m.id = tm.mood_id`)
    .all() as { track_id: number; name: string }[]

  const byTrack = new Map<
    number,
    { genres: string[]; subgenres: { name: string; genreName: string }[]; moods: string[] }
  >()
  function entry(trackId: number) {
    if (!byTrack.has(trackId)) byTrack.set(trackId, { genres: [], subgenres: [], moods: [] })
    return byTrack.get(trackId)!
  }
  for (const row of genreRows) entry(row.track_id).genres.push(row.name)
  for (const row of subgenreRows) entry(row.track_id).subgenres.push({ name: row.name, genreName: row.genre_name })
  for (const row of moodRows) entry(row.track_id).moods.push(row.name)

  const tracks = Array.from(byTrack.entries())
    .filter(([trackId]) => pathById.has(trackId))
    .map(([trackId, tags]) => ({ path: pathById.get(trackId)!, ...tags }))

  return {
    version: 1,
    genres,
    subgenres: subgenres.map((s) => ({ name: s.name, genreName: s.genre_name })),
    moods,
    tracks,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tagExport.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add electron/main/tagExport.ts electron/main/tagExport.test.ts
git commit -m "feat: add exportTagData"
```

---

## Task 9: tagExport.ts — importTagData

**Files:**
- Modify: `electron/main/tagExport.ts`, `electron/main/tagExport.test.ts`

**Interfaces:**
- Consumes: `TagExportData` (Task 8), `createGenre`/`createSubgenre`/`createMood`/`addGenresToTracks`/`addSubgenresToTracks`/`addMoodsToTracks` (Task 6 and pre-existing `tags.ts`).
- Produces: `ImportResult { matchedTracks: number; skippedTracks: number }`, `importTagData(db: AppDatabase, data: TagExportData): ImportResult`. Consumed by Task 10 (IPC handler).

- [ ] **Step 1: Write the failing tests**

Add to `electron/main/tagExport.test.ts`, as a new top-level `describe` block:

```ts
describe('importTagData', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = openDatabase(':memory:')
  })

  it('creates missing genres/subgenres/moods and tags matched tracks', () => {
    db.prepare(
      `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/a.wav','a.wav','/', 'wav', 1, 1)`
    ).run()

    const result = importTagData(db, {
      version: 1,
      genres: [{ name: 'House' }],
      subgenres: [{ name: 'Deep House', genreName: 'House' }],
      moods: [{ name: 'Energetic' }],
      tracks: [
        {
          path: '/a.wav',
          genres: ['House'],
          subgenres: [{ name: 'Deep House', genreName: 'House' }],
          moods: ['Energetic'],
        },
      ],
    })

    expect(result).toEqual({ matchedTracks: 1, skippedTracks: 0 })

    const genres = db.prepare('SELECT name FROM genres').all()
    expect(genres).toEqual([{ name: 'House' }])
  })

  it('skips and counts tracks whose path is not in the local collection', () => {
    const result = importTagData(db, {
      version: 1,
      genres: [],
      subgenres: [],
      moods: [],
      tracks: [{ path: '/does-not-exist.wav', genres: [], subgenres: [], moods: [] }],
    })

    expect(result).toEqual({ matchedTracks: 0, skippedTracks: 1 })
  })

  it('is additive — does not remove a track\'s existing tags', () => {
    const trackId = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/a.wav','a.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number
    const technoId = createGenre(db, 'Techno')
    setTrackGenres(db, trackId, [technoId])

    importTagData(db, {
      version: 1,
      genres: [{ name: 'House' }],
      subgenres: [],
      moods: [],
      tracks: [{ path: '/a.wav', genres: ['House'], subgenres: [], moods: [] }],
    })

    expect(getTrackTagIds(db, trackId).genreIds.length).toBe(2)
  })

  it('reuses an existing genre/subgenre/mood by name instead of creating a duplicate', () => {
    const houseId = createGenre(db, 'House')

    importTagData(db, {
      version: 1,
      genres: [{ name: 'House' }],
      subgenres: [],
      moods: [],
      tracks: [],
    })

    const genres = db.prepare('SELECT id FROM genres').all() as { id: number }[]
    expect(genres).toEqual([{ id: houseId }])
  })

  it('does not confuse two different genres that have same-named sub-genres', () => {
    db.prepare(
      `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/a.wav','a.wav','/', 'wav', 1, 1)`
    ).run()

    importTagData(db, {
      version: 1,
      genres: [{ name: 'House' }, { name: 'Techno' }],
      subgenres: [
        { name: 'Deep', genreName: 'House' },
        { name: 'Deep', genreName: 'Techno' },
      ],
      moods: [],
      tracks: [
        {
          path: '/a.wav',
          genres: [],
          subgenres: [{ name: 'Deep', genreName: 'House' }],
          moods: [],
        },
      ],
    })

    const subgenres = db
      .prepare(`SELECT s.name as name, g.name as genre_name FROM subgenres s JOIN genres g ON g.id = s.genre_id`)
      .all()
    expect(subgenres).toHaveLength(2) // both "Deep" sub-genres created, not merged
  })
})
```

Update the import line at the top of `tagExport.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase, type AppDatabase } from './db'
import { createGenre, createSubgenre, createMood, setTrackGenres, setTrackSubgenres, setTrackMoods, getTrackTagIds } from './tags'
import { exportTagData, importTagData } from './tagExport'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tagExport.test.ts`
Expected: FAIL — `importTagData` not defined.

- [ ] **Step 3: Implement**

Add to the top of `electron/main/tagExport.ts`:

```ts
import { runInTransaction } from './db'
import { createGenre, createSubgenre, createMood, addGenresToTracks, addSubgenresToTracks, addMoodsToTracks } from './tags'
```

Add at the end of the file:

```ts
export interface ImportResult {
  matchedTracks: number
  skippedTracks: number
}

export function importTagData(db: AppDatabase, data: TagExportData): ImportResult {
  return runInTransaction(db, () => {
    const genreIdByName = new Map<string, number>()
    for (const row of db.prepare('SELECT id, name FROM genres').all() as { id: number; name: string }[]) {
      genreIdByName.set(row.name, row.id)
    }
    for (const g of data.genres) {
      if (!genreIdByName.has(g.name)) {
        genreIdByName.set(g.name, createGenre(db, g.name))
      }
    }

    // Keyed by "genreName::subgenreName" — subgenres.name has no uniqueness
    // constraint in the schema, so two different genres can have same-named
    // sub-genres and must not be merged.
    const subgenreIdByKey = new Map<string, number>()
    for (const row of db
      .prepare(`SELECT s.id as id, s.name as name, g.name as genre_name FROM subgenres s JOIN genres g ON g.id = s.genre_id`)
      .all() as { id: number; name: string; genre_name: string }[]) {
      subgenreIdByKey.set(`${row.genre_name}::${row.name}`, row.id)
    }
    for (const sg of data.subgenres) {
      const key = `${sg.genreName}::${sg.name}`
      if (!subgenreIdByKey.has(key)) {
        const genreId = genreIdByName.get(sg.genreName)
        if (genreId !== undefined) {
          subgenreIdByKey.set(key, createSubgenre(db, sg.name, genreId))
        }
      }
    }

    const moodIdByName = new Map<string, number>()
    for (const row of db.prepare('SELECT id, name FROM moods').all() as { id: number; name: string }[]) {
      moodIdByName.set(row.name, row.id)
    }
    for (const m of data.moods) {
      if (!moodIdByName.has(m.name)) {
        moodIdByName.set(m.name, createMood(db, m.name))
      }
    }

    let matchedTracks = 0
    let skippedTracks = 0
    for (const t of data.tracks) {
      const row = db.prepare('SELECT id FROM tracks WHERE path = ?').get(t.path) as { id: number } | undefined
      if (!row) {
        skippedTracks++
        continue
      }
      matchedTracks++

      const genreIds = t.genres
        .map((name) => genreIdByName.get(name))
        .filter((id): id is number => id !== undefined)
      const subgenreIds = t.subgenres
        .map((sg) => subgenreIdByKey.get(`${sg.genreName}::${sg.name}`))
        .filter((id): id is number => id !== undefined)
      const moodIds = t.moods.map((name) => moodIdByName.get(name)).filter((id): id is number => id !== undefined)

      if (genreIds.length) addGenresToTracks(db, [row.id], genreIds)
      if (subgenreIds.length) addSubgenresToTracks(db, [row.id], subgenreIds)
      if (moodIds.length) addMoodsToTracks(db, [row.id], moodIds)
    }

    return { matchedTracks, skippedTracks }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tagExport.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add electron/main/tagExport.ts electron/main/tagExport.test.ts
git commit -m "feat: add importTagData"
```

---

## Task 10: Export/import IPC + UI

**Files:**
- Modify: `electron/main/ipc.ts`, `electron/preload/index.ts`, `src/types.ts`, `src/state/store.ts`, `src/components/SettingsModal.tsx`
- Test: none (IPC/dialog wiring + UI — verified via `tsc -b --noEmit` and manual walkthrough)

**Interfaces:**
- Consumes: `exportTagData`, `importTagData`, `TagExportData`, `ImportResult` (Tasks 8, 9).
- Produces: `window.api.exportTagData(): Promise<{ path: string } | null>`, `window.api.importTagData(): Promise<ImportResult | null>`. No later task depends on this.

- [ ] **Step 1: Add `ImportResult` to `src/types.ts`**

Add at the end of the file:

```ts
export interface ImportResult {
  matchedTracks: number
  skippedTracks: number
}
```

- [ ] **Step 2: Add the IPC handlers**

In `electron/main/ipc.ts`, add to the imports:

```ts
import { writeFileSync, readFileSync } from 'node:fs'
import { exportTagData, importTagData, type TagExportData } from './tagExport'
```

Add `ImportResult` to the existing `../../src/types` import line.

Add these handlers inside `registerIpcHandlers`:

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

- [ ] **Step 3: Add the preload methods**

In `electron/preload/index.ts`, add `ImportResult` to the `../../src/types` import line.

Add these methods to the `api` object:

```ts
  exportTagData: (): Promise<{ path: string } | null> => ipcRenderer.invoke('tags:exportData'),
  importTagData: (): Promise<ImportResult | null> => ipcRenderer.invoke('tags:importData'),
```

- [ ] **Step 4: Add store actions**

In `src/state/store.ts`, add to the `CollectionState` action list:

```ts
  exportTagData: () => Promise<{ path: string } | null>
  importTagData: () => Promise<ImportResult | null>
```

Add `ImportResult` to the `../types` import line.

Add these actions after `addTagsToCheckedTracks`:

```ts
  exportTagData: () => window.api.exportTagData(),

  importTagData: async () => {
    const result = await window.api.importTagData()
    if (result) await get().loadAll()
    return result
  },
```

- [ ] **Step 5: Add the UI section to `SettingsModal.tsx`**

Add these two `useState`s:

```tsx
  const exportTagData = useCollectionStore((s) => s.exportTagData)
  const importTagData = useCollectionStore((s) => s.importTagData)
  const [tagDataMessage, setTagDataMessage] = useState<string | null>(null)
```

Add this section after the "Restore" section:

```tsx
        <section style={{ marginTop: '20px' }}>
          <h3 style={{ color: 'var(--color-text-dim)', margin: '0 0 8px' }}>Tag data</h3>
          <button
            onClick={async () => {
              const result = await exportTagData()
              setTagDataMessage(result ? `Exported to ${result.path}` : null)
            }}
          >
            Export…
          </button>{' '}
          <button
            onClick={async () => {
              const result = await importTagData()
              setTagDataMessage(
                result ? `Imported: ${result.matchedTracks} matched, ${result.skippedTracks} skipped` : null
              )
            }}
          >
            Import…
          </button>
          {tagDataMessage && (
            <p style={{ margin: '8px 0 0', color: 'var(--color-text-dim)', fontSize: '12px' }}>{tagDataMessage}</p>
          )}
        </section>
```

- [ ] **Step 6: Type-check and manual walkthrough**

Run: `npx tsc -b --noEmit`
Expected: no errors.

Run: `npm run dev`, open Settings, click Export…, save to a temp location, confirm the message shows the path and the file contains valid JSON. Click Import…, pick that same file back, confirm the message shows matched/skipped counts.

- [ ] **Step 7: Commit**

```bash
git add electron/main/ipc.ts electron/preload/index.ts src/types.ts src/state/store.ts src/components/SettingsModal.tsx
git commit -m "feat: add tag data export/import IPC and Settings modal UI"
```

---

## Task 11: Keyboard shortcuts

**Files:**
- Modify: `src/components/Player.tsx`, `src/components/TrackTable.tsx`, `src/App.tsx`
- Test: none (React component changes — see prior plans' precedent; verified via `tsc -b --noEmit` and manual walkthrough)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Add the space-bar shortcut to `Player.tsx`**

Add this `useEffect` inside the `Player` component, after the existing `toggle` function definition:

```tsx
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (e.key === ' ') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])
```

Add `useEffect` to the existing `import { useRef, useState } from 'react'` line (making it `import { useEffect, useRef, useState } from 'react'`).

- [ ] **Step 2: Add `selectedTrackId` prop and arrow-key navigation to `TrackTable.tsx`**

Change the component's prop type:

```tsx
export function TrackTable({
  onSelect,
  selectedFolder,
  activeFilter,
}: {
  onSelect: (track: Track) => void
  selectedFolder: string | null
  activeFilter: (track: Track) => boolean
}) {
```

to:

```tsx
export function TrackTable({
  onSelect,
  selectedFolder,
  activeFilter,
  selectedTrackId,
}: {
  onSelect: (track: Track) => void
  selectedFolder: string | null
  activeFilter: (track: Track) => boolean
  selectedTrackId: number | null
}) {
```

Add `useEffect` to the existing `import { useMemo, useState } from 'react'` line (making it `import { useEffect, useMemo, useState } from 'react'`).

Add this `useEffect` after the `visibleTracks` `useMemo` block:

```tsx
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (visibleTracks.length === 0) return
      e.preventDefault()
      const currentIndex = selectedTrackId ? visibleTracks.findIndex((t) => t.id === selectedTrackId) : -1
      const nextIndex =
        e.key === 'ArrowDown'
          ? Math.min(visibleTracks.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1)
      onSelect(visibleTracks[nextIndex])
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visibleTracks, selectedTrackId, onSelect])
```

- [ ] **Step 3: Pass `selectedTrackId` from `App.tsx`**

Change:

```tsx
        <div className="pane" style={{ gridArea: 'center' }}>
          <BatchTagBar />
          <TrackTable onSelect={setSelectedTrack} selectedFolder={selectedFolder} activeFilter={tagFilter} />
        </div>
```

to:

```tsx
        <div className="pane" style={{ gridArea: 'center' }}>
          <BatchTagBar />
          <TrackTable
            onSelect={setSelectedTrack}
            selectedFolder={selectedFolder}
            activeFilter={tagFilter}
            selectedTrackId={selectedTrack?.id ?? null}
          />
        </div>
```

- [ ] **Step 4: Type-check and manual walkthrough**

Run: `npx tsc -b --noEmit`
Expected: no errors.

Run: `npm run dev`, select a track, press space to play/pause it, press ↓/↑ to move the selection to adjacent rows. Confirm typing in the search box doesn't trigger either shortcut.

- [ ] **Step 5: Commit**

```bash
git add src/components/Player.tsx src/components/TrackTable.tsx src/App.tsx
git commit -m "feat: add space (play/pause) and arrow-key (track navigation) shortcuts"
```

---

## Task 12: tags.ts — genre-deletion snapshot + undo

**Files:**
- Modify: `electron/main/tags.ts`, `electron/main/tags.test.ts`

**Interfaces:**
- Produces: `GenreDeletionSnapshot { genreName: string; subgenres: { name: string }[]; trackGenreAssociations: { trackId: number }[]; trackSubgenreAssociationsByName: Record<string, number[]> }`, `captureGenreDeletionSnapshot(db, genreId: number): GenreDeletionSnapshot`, `undoGenreDeletion(db, snapshot: GenreDeletionSnapshot): void`. Consumed by Task 13.

- [ ] **Step 1: Write the failing tests**

Add to `electron/main/tags.test.ts`, inside the existing `describe('tags', ...)` block:

```ts
  it('captureGenreDeletionSnapshot records the genre, its sub-genres, and every track association', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    setTrackGenres(db, trackId, [houseId])
    setTrackSubgenres(db, trackId, [deepHouseId])

    const snapshot = captureGenreDeletionSnapshot(db, houseId)

    expect(snapshot.genreName).toBe('House')
    expect(snapshot.subgenres).toEqual([{ name: 'Deep House' }])
    expect(snapshot.trackGenreAssociations).toEqual([{ trackId }])
    expect(snapshot.trackSubgenreAssociationsByName).toEqual({ 'Deep House': [trackId] })
  })

  it('undoGenreDeletion recreates the genre, sub-genres, and track associations after a real delete', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    setTrackGenres(db, trackId, [houseId])
    setTrackSubgenres(db, trackId, [deepHouseId])

    const snapshot = captureGenreDeletionSnapshot(db, houseId)
    deleteGenre(db, houseId)
    expect(getTrackTagIds(db, trackId).genreIds).toEqual([])

    undoGenreDeletion(db, snapshot)

    const genres = db.prepare('SELECT name FROM genres').all()
    expect(genres).toEqual([{ name: 'House' }])
    const restoredGenreId = (db.prepare('SELECT id FROM genres WHERE name = ?').get('House') as { id: number }).id
    expect(getTrackTagIds(db, trackId).genreIds).toEqual([restoredGenreId])
    const restoredSubgenreId = (
      db.prepare('SELECT id FROM subgenres WHERE name = ?').get('Deep House') as { id: number }
    ).id
    expect(getTrackTagIds(db, trackId).subgenreIds).toEqual([restoredSubgenreId])
  })
```

Update the import line at the top of the file:

```ts
import {
  createGenre,
  createSubgenre,
  createMood,
  deleteGenre,
  setTrackGenres,
  setTrackSubgenres,
  setTrackMoods,
  getTrackTagIds,
  addGenresToTracks,
  addSubgenresToTracks,
  addMoodsToTracks,
  captureGenreDeletionSnapshot,
  undoGenreDeletion,
} from './tags'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tags.test.ts`
Expected: FAIL — `captureGenreDeletionSnapshot`/`undoGenreDeletion` not defined.

- [ ] **Step 3: Implement**

Add to `electron/main/tags.ts`, after `deleteGenre`:

```ts
export interface GenreDeletionSnapshot {
  genreName: string
  subgenres: { name: string }[]
  trackGenreAssociations: { trackId: number }[]
  trackSubgenreAssociationsByName: Record<string, number[]>
}

// Reads everything deleteGenre's cascade delete is about to destroy —
// called before deleteGenre, not after.
export function captureGenreDeletionSnapshot(db: AppDatabase, genreId: number): GenreDeletionSnapshot {
  const genre = db.prepare('SELECT name FROM genres WHERE id = ?').get(genreId) as { name: string } | undefined
  if (!genre) throw new Error(`No genre with id ${genreId}`)

  const subgenreRows = db.prepare('SELECT id, name FROM subgenres WHERE genre_id = ?').all(genreId) as {
    id: number
    name: string
  }[]

  const trackGenreRows = db.prepare('SELECT track_id FROM track_genres WHERE genre_id = ?').all(genreId) as {
    track_id: number
  }[]

  const trackSubgenreAssociationsByName: Record<string, number[]> = {}
  for (const sg of subgenreRows) {
    const rows = db.prepare('SELECT track_id FROM track_subgenres WHERE subgenre_id = ?').all(sg.id) as {
      track_id: number
    }[]
    trackSubgenreAssociationsByName[sg.name] = rows.map((r) => r.track_id)
  }

  return {
    genreName: genre.name,
    subgenres: subgenreRows.map((s) => ({ name: s.name })),
    trackGenreAssociations: trackGenreRows.map((r) => ({ trackId: r.track_id })),
    trackSubgenreAssociationsByName,
  }
}

// Recreates the genre and sub-genres with NEW ids (the old ones are gone —
// nothing else references them) and re-applies the captured track
// associations against those new ids.
export function undoGenreDeletion(db: AppDatabase, snapshot: GenreDeletionSnapshot): void {
  runInTransaction(db, () => {
    const newGenreId = createGenre(db, snapshot.genreName)
    for (const { trackId } of snapshot.trackGenreAssociations) {
      db.prepare('INSERT INTO track_genres (track_id, genre_id) VALUES (?, ?)').run(trackId, newGenreId)
    }
    for (const sg of snapshot.subgenres) {
      const newSubgenreId = createSubgenre(db, sg.name, newGenreId)
      const trackIds = snapshot.trackSubgenreAssociationsByName[sg.name] ?? []
      for (const trackId of trackIds) {
        db.prepare('INSERT INTO track_subgenres (track_id, subgenre_id) VALUES (?, ?)').run(trackId, newSubgenreId)
      }
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tags.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add electron/main/tags.ts electron/main/tags.test.ts
git commit -m "feat: add genre-deletion snapshot capture and undo"
```

---

## Task 13: Undo-delete-genre UI

**Files:**
- Modify: `electron/main/ipc.ts`, `electron/preload/index.ts`, `src/types.ts`, `src/state/store.ts`, `src/components/TagTree.tsx`, `src/App.tsx`
- Create: `src/components/UndoToast.tsx`
- Test: none (IPC wiring + store + UI — verified via `tsc -b --noEmit` and manual walkthrough)

**Interfaces:**
- Consumes: `captureGenreDeletionSnapshot`, `undoGenreDeletion`, `GenreDeletionSnapshot` (Task 12).
- Produces: nothing consumed by a later task — this is the final task in this plan.

- [ ] **Step 1: Add `GenreDeletionSnapshot` to `src/types.ts`**

Add at the end of the file:

```ts
export interface GenreDeletionSnapshot {
  genreName: string
  subgenres: { name: string }[]
  trackGenreAssociations: { trackId: number }[]
  trackSubgenreAssociationsByName: Record<string, number[]>
}
```

- [ ] **Step 2: Update the IPC handlers**

In `electron/main/ipc.ts`, change the `./tags` import line (as left by Task 7):

```ts
import {
  createGenre,
  createSubgenre,
  createMood,
  deleteGenre,
  setTrackGenres,
  setTrackSubgenres,
  setTrackMoods,
  getTrackTagIds,
  addGenresToTracks,
  addSubgenresToTracks,
  addMoodsToTracks,
} from './tags'
```

to:

```ts
import {
  createGenre,
  createSubgenre,
  createMood,
  deleteGenre,
  setTrackGenres,
  setTrackSubgenres,
  setTrackMoods,
  getTrackTagIds,
  addGenresToTracks,
  addSubgenresToTracks,
  addMoodsToTracks,
  captureGenreDeletionSnapshot,
  undoGenreDeletion,
} from './tags'
```

Add `GenreDeletionSnapshot` to the existing `../../src/types` import line.

Change:

```ts
  ipcMain.handle('tags:deleteGenre', (_e, genreId: number): void => deleteGenre(db, genreId))
```

to:

```ts
  ipcMain.handle('tags:deleteGenre', (_e, genreId: number): GenreDeletionSnapshot => {
    const snapshot = captureGenreDeletionSnapshot(db, genreId)
    deleteGenre(db, genreId)
    return snapshot
  })
  ipcMain.handle('tags:undoDeleteGenre', (_e, snapshot: GenreDeletionSnapshot): void =>
    undoGenreDeletion(db, snapshot)
  )
```

- [ ] **Step 3: Update the preload methods**

In `electron/preload/index.ts`, add `GenreDeletionSnapshot` to the `../../src/types` import line.

Change:

```ts
  deleteGenre: (genreId: number): Promise<void> => ipcRenderer.invoke('tags:deleteGenre', genreId),
```

to:

```ts
  deleteGenre: (genreId: number): Promise<GenreDeletionSnapshot> => ipcRenderer.invoke('tags:deleteGenre', genreId),
  undoDeleteGenre: (snapshot: GenreDeletionSnapshot): Promise<void> =>
    ipcRenderer.invoke('tags:undoDeleteGenre', snapshot),
```

- [ ] **Step 4: Update the store**

In `src/state/store.ts`, add `GenreDeletionSnapshot` to the `../types` import line.

Add to the `CollectionState` interface (after `checkedTrackIds: Set<number>`):

```ts
  pendingGenreDeletion: { snapshot: GenreDeletionSnapshot; timeoutId: ReturnType<typeof setTimeout> } | null
```

Change the `deleteGenre` action signature in the interface and add two new actions after it:

```ts
  deleteGenre: (genreId: number) => Promise<void>
  undoGenreDeletion: () => Promise<void>
  dismissGenreDeletionUndo: () => void
```

(the `deleteGenre` line already exists with this exact signature — no change needed there, only the two new lines are additions)

Add the initial state (after `checkedTrackIds: new Set(),`):

```ts
  pendingGenreDeletion: null,
```

Replace the existing `deleteGenre` action:

```ts
  deleteGenre: async (genreId) => {
    await window.api.deleteGenre(genreId)
    await get().loadAll()
  },
```

with:

```ts
  deleteGenre: async (genreId) => {
    const snapshot = await window.api.deleteGenre(genreId)
    await get().loadAll()
    const prev = get().pendingGenreDeletion
    if (prev) clearTimeout(prev.timeoutId)
    const timeoutId = setTimeout(() => set({ pendingGenreDeletion: null }), 8000)
    set({ pendingGenreDeletion: { snapshot, timeoutId } })
  },

  undoGenreDeletion: async () => {
    const pending = get().pendingGenreDeletion
    if (!pending) return
    clearTimeout(pending.timeoutId)
    set({ pendingGenreDeletion: null })
    await window.api.undoDeleteGenre(pending.snapshot)
    await get().loadAll()
  },

  dismissGenreDeletionUndo: () => {
    const pending = get().pendingGenreDeletion
    if (pending) clearTimeout(pending.timeoutId)
    set({ pendingGenreDeletion: null })
  },
```

- [ ] **Step 5: Create `UndoToast.tsx`**

```tsx
// src/components/UndoToast.tsx
export function UndoToast({
  message,
  onUndo,
  onDismiss,
}: {
  message: string
  onUndo: () => void
  onDismiss: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        zIndex: 30,
      }}
    >
      <span>{message}</span>
      <button onClick={onUndo}>Undo</button>
      <button onClick={onDismiss}>
        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
          close
        </span>
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Remove the confirm() in `TagTree.tsx`**

Change:

```tsx
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (window.confirm(`Delete genre "${genre.name}"? This also removes its sub-genres and untags every track that has it.`)) {
                  deleteGenre(genre.id)
                }
              }}
              title={`Delete genre "${genre.name}"`}
              style={{ padding: '0 4px' }}
            >
```

to:

```tsx
            <button
              onClick={(e) => {
                e.stopPropagation()
                deleteGenre(genre.id)
              }}
              title={`Delete genre "${genre.name}"`}
              style={{ padding: '0 4px' }}
            >
```

- [ ] **Step 7: Render the toast from `App.tsx`**

Add to the imports:

```tsx
import { UndoToast } from './components/UndoToast'
```

Add these store reads:

```tsx
  const pendingGenreDeletion = useCollectionStore((s) => s.pendingGenreDeletion)
  const undoGenreDeletion = useCollectionStore((s) => s.undoGenreDeletion)
  const dismissGenreDeletionUndo = useCollectionStore((s) => s.dismissGenreDeletionUndo)
```

Add this after the `<SettingsModal ... />` line:

```tsx
      {pendingGenreDeletion && (
        <UndoToast
          message={`Deleted "${pendingGenreDeletion.snapshot.genreName}"`}
          onUndo={undoGenreDeletion}
          onDismiss={dismissGenreDeletionUndo}
        />
      )}
```

- [ ] **Step 8: Type-check and manual walkthrough**

Run: `npx tsc -b --noEmit`
Expected: no errors.

Run: `npm run dev`, delete a genre from the Tags view, confirm no `confirm()` dialog appears and an undo toast shows at the bottom instead, click Undo, confirm the genre and its track tags come back (re-check the Tags list and a track that had it).

- [ ] **Step 9: Commit**

```bash
git add electron/main/ipc.ts electron/preload/index.ts src/types.ts src/state/store.ts src/components/UndoToast.tsx src/components/TagTree.tsx src/App.tsx
git commit -m "feat: replace deleteGenre's confirm() with an undo toast"
```
