# Progress Indicator + Settings/Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live analysis-progress indicator (per-track status + footer bar) and a Settings modal backed by automatic daily/on-launch backups of the SQLite collection DB and config store.

**Architecture:** Renderer changes reuse the existing `scan:progress` IPC event (already emitted) but replace the current full-`loadAll()`-per-tick handler with a throttled lightweight `getTracks()`-only refresh, plus two new small presentational components. The backup feature is a new pure-logic-plus-I/O module in the main process (`electron/main/backup.ts`), using SQLite's `VACUUM INTO` for an atomic DB snapshot, wired into app startup and an hourly timer, with one new read-only IPC call feeding a new Settings modal.

**Tech Stack:** Same as the v1 app — Electron + `electron-vite` + React + TypeScript, `node:sqlite`, `electron-store`, `zustand`, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-21-progress-indicator-and-settings-backup-design.md`

## Global Constraints

- TypeScript strict mode across main, preload, and renderer code (unchanged project setting).
- Type-check with `npx tsc -b --noEmit` (NOT plain `tsc --noEmit`, which is a silent no-op against this repo's solution-style `tsconfig.json` — see `TODO.md`).
- Test runner: Vitest, run via `npm test`.
- `node:sqlite`'s `DatabaseSync` (aliased `AppDatabase` in `electron/main/db.ts`) is synchronous and only ever touched from the main process.
- Renderer never touches Node/fs/DB directly — all access goes through the preload `contextBridge` API (`window.api`), and every `window.api` method must have an explicit return type (established in the prior fix round — see `TODO.md`'s "IPC/preload boundary" entry).
- No manual "back up now" trigger and no backup pruning/retention limit (explicit spec decisions).
- Commit after every task's final passing-test (or, for untested UI-wiring tasks, final `tsc -b --noEmit` clean) step.

---

## File Structure

```
electron/main/
  config.ts              -- MODIFY: add lastBackupAt get/set, getConfigFilePath (Task 4)
  config.test.ts          -- MODIFY: cover the new functions (Task 4)
  backup.ts                -- CREATE: shouldBackupToday, runBackup, runBackupIfNeeded (Task 5)
  backup.test.ts            -- CREATE (Task 5)
  index.ts                   -- MODIFY: wire backup check into startup + hourly interval (Task 6)
  ipc.ts                      -- MODIFY: add backup:getInfo handler (Task 7)
electron/preload/
  index.ts                     -- MODIFY: add getBackupInfo (Task 7)
src/
  types.ts                      -- MODIFY: add BackupInfo (Task 7)
  theme.css                      -- MODIFY: add .spin keyframes (Task 3)
  App.tsx                         -- MODIFY: footer grid area, onScanProgress throttle, settings modal state (Tasks 2, 8)
  state/
    store.ts                      -- MODIFY: analysisProgress, setAnalysisProgress, refreshTracks (Task 1)
  components/
    AnalysisProgressBar.tsx        -- CREATE (Task 2)
    TrackTable.tsx                  -- MODIFY: status column (Task 3)
    SettingsModal.tsx                -- CREATE (Task 8)
    Toolbar.tsx                       -- MODIFY: gear button (Task 8)
```

---

## Task 1: Store — analysisProgress state + refreshTracks action

**Files:**
- Modify: `src/state/store.ts`
- Test: none (this file has no existing unit tests — see `folderTree.test.ts`/`tagFilter.test.ts` for the pure-logic modules that do; `store.ts`'s own actions have never had dedicated tests in this repo, verified instead by the manual walkthrough in Task 2/8)

**Interfaces:**
- Produces: `analysisProgress: { done: number; total: number } | null` state field; `setAnalysisProgress(progress: { done: number; total: number } | null): void` action; `refreshTracks(): Promise<void>` action. Consumed by Task 2 (`App.tsx`'s `onScanProgress` handler and the footer render) and Task 3 (`TrackTable.tsx` reads `tracks` as before, now refreshed more often).

- [ ] **Step 1: Add the new state field and action signatures to `CollectionState`**

In `src/state/store.ts`, add to the `CollectionState` interface (after `collectionFolder: string | null`):

```ts
  analysisProgress: { done: number; total: number } | null
```

And add to the interface's action list (after `loadAll: () => Promise<void>`):

```ts
  setAnalysisProgress: (progress: { done: number; total: number } | null) => void
  refreshTracks: () => Promise<void>
```

- [ ] **Step 2: Add the initial state and implementations**

In the `create<CollectionState>((set, get) => ({...}))` object, add after `collectionFolder: null,`:

```ts
  analysisProgress: null,
```

And add these two actions after the existing `loadAll` action:

```ts
  setAnalysisProgress: (progress) => set({ analysisProgress: progress }),

  refreshTracks: async () => {
    const tracks = await window.api.getTracks()
    set({ tracks })
  },
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/state/store.ts
git commit -m "feat: add analysisProgress state and refreshTracks action to store"
```

---

## Task 2: AnalysisProgressBar component + throttled onScanProgress wiring

**Files:**
- Create: `src/components/AnalysisProgressBar.tsx`
- Modify: `src/App.tsx`
- Test: none (React components have no test harness in this repo — `@testing-library/react` isn't installed and Vitest is configured `environment: 'node'` only; verified via the manual `npm run dev` walkthrough in this task's Step 5)

**Interfaces:**
- Consumes: `analysisProgress`, `setAnalysisProgress`, `refreshTracks` from the store (Task 1).
- Produces: `AnalysisProgressBar` component, rendered by `App.tsx` — no other task depends on this directly.

- [ ] **Step 1: Create the component**

```tsx
// src/components/AnalysisProgressBar.tsx
export function AnalysisProgressBar({ progress }: { progress: { done: number; total: number } }) {
  const percent = progress.total > 0 ? (progress.done / progress.total) * 100 : 0

  return (
    <div
      style={{
        padding: '8px 16px',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        fontSize: '12px',
        color: 'var(--color-text-dim)',
      }}
    >
      <div>
        Analyzing {progress.done} of {progress.total}…
      </div>
      <div
        style={{
          marginTop: '4px',
          height: '4px',
          background: 'var(--color-border)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            background: 'var(--color-accent)',
            transition: 'width 150ms ease',
          }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire the throttled progress handler into `App.tsx`**

In `src/App.tsx`, add to the imports:

```tsx
import { useRef } from 'react'
import { AnalysisProgressBar } from './components/AnalysisProgressBar'
```

(combine with the existing `import { useEffect, useState } from 'react'` line — change it to `import { useEffect, useRef, useState } from 'react'`.)

Inside the `App` component, add these two store reads near the existing `loadAll`/`collectionFolder` reads:

```tsx
  const analysisProgress = useCollectionStore((s) => s.analysisProgress)
  const setAnalysisProgress = useCollectionStore((s) => s.setAnalysisProgress)
  const refreshTracks = useCollectionStore((s) => s.refreshTracks)
  const lastRefreshRef = useRef(0)
```

Replace the existing `useEffect` block:

```tsx
  useEffect(() => {
    loadAll()
    loadCollectionFolder()
    const unsubscribe = window.api.onScanProgress(() => {
      loadAll()
    })
    return unsubscribe
  }, [loadAll, loadCollectionFolder])
```

with:

```tsx
  useEffect(() => {
    loadAll()
    loadCollectionFolder()
    const unsubscribe = window.api.onScanProgress((progress) => {
      setAnalysisProgress(progress)
      const isFinal = progress.done === progress.total
      const now = Date.now()
      if (isFinal || now - lastRefreshRef.current >= 300) {
        lastRefreshRef.current = now
        refreshTracks().then(() => {
          if (isFinal) setAnalysisProgress(null)
        })
      }
    })
    return unsubscribe
  }, [loadAll, loadCollectionFolder, setAnalysisProgress, refreshTracks])
```

- [ ] **Step 3: Add the footer grid row**

In `src/App.tsx`, change:

```tsx
        style={{
          gridTemplateRows: 'auto 1fr',
          gridTemplateAreas: "'toolbar toolbar toolbar' 'left center right'",
        }}
```

to:

```tsx
        style={{
          gridTemplateRows: 'auto 1fr auto',
          gridTemplateAreas: "'toolbar toolbar toolbar' 'left center right' 'footer footer footer'",
        }}
```

Then add, right after the closing `</div>` of the `right` grid-area block (the one wrapping `<DetailPanel ... />`), still inside the outer `app-layout` div:

```tsx
        {analysisProgress && (
          <div style={{ gridArea: 'footer' }}>
            <AnalysisProgressBar progress={analysisProgress} />
          </div>
        )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual walkthrough**

Run: `npm run dev`, choose a collection folder with a few audio files (or point it at an existing test collection), click "Update Collection".
Expected: a footer bar appears reading "Analyzing 1 of N…" (or similar) with a filling progress bar, and disappears once analysis completes.

- [ ] **Step 6: Commit**

```bash
git add src/components/AnalysisProgressBar.tsx src/App.tsx
git commit -m "feat: add footer analysis-progress bar with throttled track refresh"
```

---

## Task 3: TrackTable per-row analysis status column

**Files:**
- Modify: `src/components/TrackTable.tsx`, `src/theme.css`
- Test: none (see Task 2's note on React component testing in this repo; verified in this task's Step 3 manual walkthrough)

**Interfaces:**
- Consumes: `Track.analysisStatus` (`'pending' | 'analyzing' | 'done' | 'error'`, already in `src/types.ts`), refreshed live via Task 1/2's `refreshTracks`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the spin animation to `theme.css`**

Append to `src/theme.css`:

```css
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
```

- [ ] **Step 2: Add the status column to `TrackTable.tsx`**

In `src/components/TrackTable.tsx`, change the header row:

```tsx
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => setSortKey(col.key)}
                style={{ ...cellStyle, cursor: 'pointer', textAlign: 'left' }}
              >
                {col.label}
              </th>
            ))}
            <th style={cellStyle}>Cloud</th>
          </tr>
```

to:

```tsx
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => setSortKey(col.key)}
                style={{ ...cellStyle, cursor: 'pointer', textAlign: 'left' }}
              >
                {col.label}
              </th>
            ))}
            <th style={cellStyle}>Status</th>
            <th style={cellStyle}>Cloud</th>
          </tr>
```

And change the row rendering:

```tsx
              <td style={cellStyle}>{track.duration ? formatDuration(track.duration) : '—'}</td>
              <td style={cellStyle}>
                {track.cloudStatus === 'cloud_only' ? <span className="material-symbols-outlined">cloud</span> : null}
              </td>
```

to:

```tsx
              <td style={cellStyle}>{track.duration ? formatDuration(track.duration) : '—'}</td>
              <td style={cellStyle}>
                {track.analysisStatus === 'analyzing' ? (
                  <span className="material-symbols-outlined spin" style={{ fontSize: '16px' }} title="Analyzing…">
                    progress_activity
                  </span>
                ) : track.analysisStatus === 'error' ? (
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '16px', color: '#f87171' }}
                    title="Analysis failed"
                  >
                    error
                  </span>
                ) : null}
              </td>
              <td style={cellStyle}>
                {track.cloudStatus === 'cloud_only' ? <span className="material-symbols-outlined">cloud</span> : null}
              </td>
```

- [ ] **Step 3: Manual walkthrough**

Run: `npm run dev`, trigger a scan on a folder with new/changed files.
Expected: rows currently being analyzed show a spinning icon in the new Status column; a row that fails analysis shows a red error icon (can be verified by temporarily pointing the collection at a corrupt/non-audio file if one is handy — otherwise visual code review is sufficient here since forcing a real analysis failure isn't practical in this walkthrough).

- [ ] **Step 4: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/TrackTable.tsx src/theme.css
git commit -m "feat: show per-track analysis status (spinner/error) in track table"
```

---

## Task 4: config.ts — lastBackupAt + config file path

**Files:**
- Modify: `electron/main/config.ts`, `electron/main/config.test.ts`

**Interfaces:**
- Produces: `getLastBackupAt(): string | null`, `setLastBackupAt(iso: string): void`, `getConfigFilePath(): string`. Consumed by Task 5 (`backup.ts`) and Task 7 (`ipc.ts`'s `backup:getInfo` handler).

- [ ] **Step 1: Write the failing tests**

Add to `electron/main/config.test.ts`, inside the existing `describe('config store', ...)` block (after the `it('persists a set folder', ...)` test):

```ts
  it('returns null lastBackupAt when unset', () => {
    expect(getLastBackupAt()).toBeNull()
  })

  it('persists a set lastBackupAt', () => {
    setLastBackupAt('2026-08-21T12:00:00.000Z')
    expect(getLastBackupAt()).toBe('2026-08-21T12:00:00.000Z')
  })

  it('exposes the config file path', () => {
    expect(getConfigFilePath()).toMatch(/\.json$/)
  })
```

Update the import line at the top of the file:

```ts
import { getCollectionFolder, setCollectionFolder, __setStoreForTests } from './config'
```

to:

```ts
import {
  getCollectionFolder,
  setCollectionFolder,
  getLastBackupAt,
  setLastBackupAt,
  getConfigFilePath,
  __setStoreForTests,
} from './config'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- config.test.ts`
Expected: FAIL — `getLastBackupAt`/`setLastBackupAt`/`getConfigFilePath` not defined.

- [ ] **Step 3: Implement**

In `electron/main/config.ts`, change the schema:

```ts
interface ConfigSchema {
  collectionFolder?: string
}
```

to:

```ts
interface ConfigSchema {
  collectionFolder?: string
  lastBackupAt?: string
}
```

Add these three functions after the existing `setCollectionFolder`:

```ts
export function getLastBackupAt(): string | null {
  return getStore().get('lastBackupAt') ?? null
}

export function setLastBackupAt(iso: string): void {
  getStore().set('lastBackupAt', iso)
}

export function getConfigFilePath(): string {
  return getStore().path
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- config.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add electron/main/config.ts electron/main/config.test.ts
git commit -m "feat: add lastBackupAt and config file path to config store"
```

---

## Task 5: backup.ts — shouldBackupToday, runBackup, runBackupIfNeeded

**Files:**
- Create: `electron/main/backup.ts`, `electron/main/backup.test.ts`

**Interfaces:**
- Consumes: `AppDatabase` (Task 3 of the v1 plan, `electron/main/db.ts`), `openDatabase` (same file, for tests), `getLastBackupAt`/`setLastBackupAt` (Task 4).
- Produces: `getBackupFolder(userDataPath: string): string`, `shouldBackupToday(lastBackupAt: string | null, now: Date): boolean`, `runBackup(db: AppDatabase, configFilePath: string, backupFolder: string, now: Date): { dbBackupPath: string; configBackupPath: string }`, `runBackupIfNeeded(db: AppDatabase, configFilePath: string, backupFolder: string, now: Date): void`. Consumed by Task 6 (`index.ts`) and Task 7 (`ipc.ts`, via `getBackupFolder`).

- [ ] **Step 1: Write the failing tests**

```ts
// electron/main/backup.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Store from 'electron-store'
import { openDatabase, type AppDatabase } from './db'
import { __setStoreForTests, getLastBackupAt } from './config'
import { shouldBackupToday, runBackup, runBackupIfNeeded, getBackupFolder } from './backup'

describe('shouldBackupToday', () => {
  it('returns true when never backed up', () => {
    expect(shouldBackupToday(null, new Date('2026-08-21T12:00:00Z'))).toBe(true)
  })

  it('returns false for a backup made earlier the same local day', () => {
    const now = new Date(2026, 7, 21, 18, 0, 0)
    const lastBackupAt = new Date(2026, 7, 21, 6, 0, 0).toISOString()
    expect(shouldBackupToday(lastBackupAt, now)).toBe(false)
  })

  it('returns true for a backup made on a different day', () => {
    const now = new Date(2026, 7, 21, 6, 0, 0)
    const lastBackupAt = new Date(2026, 7, 20, 23, 59, 0).toISOString()
    expect(shouldBackupToday(lastBackupAt, now)).toBe(true)
  })
})

describe('getBackupFolder', () => {
  it('appends a backups directory to the userData path', () => {
    expect(getBackupFolder('/Users/dj/Library/Application Support/App')).toBe(
      '/Users/dj/Library/Application Support/App/backups'
    )
  })
})

describe('runBackup / runBackupIfNeeded', () => {
  let dir: string
  let dbPath: string
  let configFilePath: string
  let backupFolder: string
  let db: AppDatabase

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'backup-test-'))
    dbPath = join(dir, 'collection.db')
    configFilePath = join(dir, 'config.json')
    backupFolder = join(dir, 'backups')
    writeFileSync(configFilePath, JSON.stringify({ collectionFolder: '/Users/dj/Music' }))
    db = openDatabase(dbPath)
    db.prepare(
      `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/a.wav','a.wav','/', 'wav', 1, 1)`
    ).run()
    __setStoreForTests(new Store({ name: `backup-test-${Math.random()}` } as ConstructorParameters<typeof Store>[0]))
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('runBackup writes a valid DB snapshot and a config copy, timestamped and never colliding', () => {
    const now = new Date('2026-08-21T12:00:00.000Z')
    const { dbBackupPath, configBackupPath } = runBackup(db, configFilePath, backupFolder, now)

    expect(existsSync(dbBackupPath)).toBe(true)
    expect(existsSync(configBackupPath)).toBe(true)

    const backupDb = openDatabase(dbBackupPath)
    const row = backupDb.prepare('SELECT filename FROM tracks').get() as { filename: string }
    expect(row.filename).toBe('a.wav')
    backupDb.close()

    const configCopy = JSON.parse(readFileSync(configBackupPath, 'utf-8'))
    expect(configCopy.collectionFolder).toBe('/Users/dj/Music')
  })

  it('runBackupIfNeeded backs up when none has run yet, and updates lastBackupAt', () => {
    const now = new Date('2026-08-21T12:00:00.000Z')
    runBackupIfNeeded(db, configFilePath, backupFolder, now)
    expect(getLastBackupAt()).toBe(now.toISOString())
    expect(existsSync(backupFolder)).toBe(true)
  })

  it('runBackupIfNeeded is a no-op on a second call the same day', () => {
    const first = new Date(2026, 7, 21, 6, 0, 0)
    const second = new Date(2026, 7, 21, 18, 0, 0)
    runBackupIfNeeded(db, configFilePath, backupFolder, first)
    const afterFirst = getLastBackupAt()
    runBackupIfNeeded(db, configFilePath, backupFolder, second)
    expect(getLastBackupAt()).toBe(afterFirst)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- backup.test.ts`
Expected: FAIL — `backup.ts` module not found.

- [ ] **Step 3: Implement**

```ts
// electron/main/backup.ts
import { mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppDatabase } from './db'
import { getLastBackupAt, setLastBackupAt } from './config'

export function getBackupFolder(userDataPath: string): string {
  return join(userDataPath, 'backups')
}

export function shouldBackupToday(lastBackupAt: string | null, now: Date): boolean {
  if (!lastBackupAt) return true
  const last = new Date(lastBackupAt)
  return (
    last.getFullYear() !== now.getFullYear() ||
    last.getMonth() !== now.getMonth() ||
    last.getDate() !== now.getDate()
  )
}

function timestampForFilename(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-')
}

export function runBackup(
  db: AppDatabase,
  configFilePath: string,
  backupFolder: string,
  now: Date
): { dbBackupPath: string; configBackupPath: string } {
  mkdirSync(backupFolder, { recursive: true })

  const stamp = timestampForFilename(now)
  const dbBackupPath = join(backupFolder, `collection-${stamp}.db`)
  const configBackupPath = join(backupFolder, `config-${stamp}.json`)

  // VACUUM INTO takes a plain SQL string, not a bindable parameter — the
  // destination is always a path we constructed above (timestamp + fixed
  // folder), never user input, but single quotes are still escaped
  // defensively since SQL string literals use them as delimiters.
  const escapedPath = dbBackupPath.replace(/'/g, "''")
  db.exec(`VACUUM INTO '${escapedPath}'`)

  copyFileSync(configFilePath, configBackupPath)

  return { dbBackupPath, configBackupPath }
}

export function runBackupIfNeeded(
  db: AppDatabase,
  configFilePath: string,
  backupFolder: string,
  now: Date
): void {
  if (!shouldBackupToday(getLastBackupAt(), now)) return
  runBackup(db, configFilePath, backupFolder, now)
  setLastBackupAt(now.toISOString())
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- backup.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add electron/main/backup.ts electron/main/backup.test.ts
git commit -m "feat: add automatic collection DB and config backup module"
```

---

## Task 6: Wire backups into app startup + hourly check

**Files:**
- Modify: `electron/main/index.ts`
- Test: none (main-process startup wiring — see the v1 plan's Task 10/17/22 for precedent; verified via this task's Step 3 manual walkthrough)

**Interfaces:**
- Consumes: `runBackupIfNeeded`, `getBackupFolder` (Task 5), `getConfigFilePath` (Task 4).
- Produces: nothing consumed by a later task (Task 7's `getBackupFolder` call is independent, reading the same function directly).

- [ ] **Step 1: Add the backup check to `index.ts`**

`electron/main/index.ts` currently has this import line (added by earlier work on this branch):

```ts
import { getCollectionFolder } from './config'
```

Change it to:

```ts
import { getCollectionFolder, getConfigFilePath } from './config'
```

Add a new import line for `backup.ts`:

```ts
import { runBackupIfNeeded, getBackupFolder } from './backup'
```

Add this near the top of the file, after the `registerMediaProtocol` function definition:

```ts
let backupIntervalStarted = false

function performBackupCheck(db: ReturnType<typeof openDatabase>): void {
  try {
    runBackupIfNeeded(db, getConfigFilePath(), getBackupFolder(app.getPath('userData')), new Date())
  } catch (err) {
    console.error('backup failed', err)
  }
}
```

In `createWindow()`, right after the `const db = openDatabase(...)` line, add:

```ts
  performBackupCheck(db)

  if (!backupIntervalStarted) {
    backupIntervalStarted = true
    setInterval(() => performBackupCheck(db), 60 * 60 * 1000)
  }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual walkthrough**

Run: `npm run dev` once, quit, then check `~/Library/Application Support/<app name>/backups/` (the exact `<app name>` directory matches whatever `npm run dev`'s Electron instance reports — check `~/Library/Application Support/Electron/backups/` first, since unpackaged dev runs typically use the default Electron app name).
Expected: a `collection-<timestamp>.db` and `config-<timestamp>.json` pair exists. Run `npm run dev` a second time immediately after.
Expected: no new backup files are created (same-day dedup).

- [ ] **Step 4: Commit**

```bash
git add electron/main/index.ts
git commit -m "feat: run collection backup on startup and hourly while the app is open"
```

---

## Task 7: backup:getInfo IPC handler + preload + type

**Files:**
- Modify: `electron/main/ipc.ts`, `electron/preload/index.ts`, `src/types.ts`
- Test: none (IPC wiring — see the v1 plan's Task 10 for precedent; verified via `tsc -b --noEmit` and this task's Step 4 manual check)

**Interfaces:**
- Consumes: `getBackupFolder` (Task 5), `getLastBackupAt` (Task 4).
- Produces: `window.api.getBackupInfo(): Promise<BackupInfo>`. Consumed by Task 8 (`SettingsModal.tsx`).

- [ ] **Step 1: Add the `BackupInfo` type**

In `src/types.ts`, add at the end of the file:

```ts
export interface BackupInfo {
  backupFolder: string
  lastBackupAt: string | null
}
```

- [ ] **Step 2: Add the IPC handler**

In `electron/main/ipc.ts`, change the `registerIpcHandlers` signature and the import lines. First, update the import from `./config`:

```ts
import { getCollectionFolder, setCollectionFolder } from './config'
```

to:

```ts
import { getCollectionFolder, setCollectionFolder, getLastBackupAt } from './config'
```

Add a new import line:

```ts
import { getBackupFolder } from './backup'
```

Change the existing types import line:

```ts
import type { Track, Genre, Subgenre, Mood } from '../../src/types'
```

to:

```ts
import type { Track, Genre, Subgenre, Mood, BackupInfo } from '../../src/types'
```

Change the function signature:

```ts
export function registerIpcHandlers(db: AppDatabase, mainWindow: BrowserWindow) {
```

to:

```ts
export function registerIpcHandlers(db: AppDatabase, mainWindow: BrowserWindow, backupFolder: string) {
```

Add this handler inside `registerIpcHandlers`, anywhere alongside the other `ipcMain.handle` calls:

```ts
  ipcMain.handle('backup:getInfo', (): BackupInfo => ({
    backupFolder,
    lastBackupAt: getLastBackupAt(),
  }))
```

- [ ] **Step 3: Update the call site and preload**

In `electron/main/index.ts`, update the `registerIpcHandlers(db, mainWindow)` call (added originally in the v1 plan's Task 10, already present in this file) to:

```ts
  registerIpcHandlers(db, mainWindow, getBackupFolder(app.getPath('userData')))
```

In `electron/preload/index.ts`, change the existing types import line:

```ts
import type { Track, Genre, Subgenre, Mood } from '../../src/types'
```

to:

```ts
import type { Track, Genre, Subgenre, Mood, BackupInfo } from '../../src/types'
```

Add this method to the `api` object, right after `downloadTrack`:

```ts
  getBackupInfo: (): Promise<BackupInfo> => ipcRenderer.invoke('backup:getInfo'),
```

- [ ] **Step 4: Type-check and smoke test**

Run: `npx tsc -b --noEmit`
Expected: no errors.

Run: `npm run dev`, open DevTools console, run `await window.api.getBackupInfo()`.
Expected: resolves to `{ backupFolder: '<path>/backups', lastBackupAt: '<some ISO string>' }` (assuming Task 6's startup backup already ran once).

- [ ] **Step 5: Commit**

```bash
git add electron/main/ipc.ts electron/main/index.ts electron/preload/index.ts src/types.ts
git commit -m "feat: add backup:getInfo IPC handler and preload method"
```

---

## Task 8: SettingsModal component + toolbar gear button

**Files:**
- Create: `src/components/SettingsModal.tsx`
- Modify: `src/components/Toolbar.tsx`, `src/App.tsx`
- Test: none (see Task 2's note on React component testing in this repo; verified via this task's Step 4 manual walkthrough)

**Interfaces:**
- Consumes: `window.api.getBackupInfo()` (Task 7), `collectionFolder`/`pickCollectionFolder` from the store (already existing, from the v1 plan).
- Produces: nothing consumed by a later task — this is the final task in this plan.

- [ ] **Step 1: Create the modal component**

```tsx
// src/components/SettingsModal.tsx
import { useEffect, useState } from 'react'
import { useCollectionStore } from '../state/store'
import type { BackupInfo } from '../types'

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const collectionFolder = useCollectionStore((s) => s.collectionFolder)
  const pickCollectionFolder = useCollectionStore((s) => s.pickCollectionFolder)
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null)

  useEffect(() => {
    if (open) {
      window.api.getBackupInfo().then(setBackupInfo)
    }
  }, [open])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '24px',
          minWidth: '360px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '16px' }}>Settings</h2>
          <button onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <section style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '13px', color: 'var(--color-text-dim)', margin: '0 0 8px' }}>Collection folder</h3>
          <p style={{ margin: '0 0 8px', wordBreak: 'break-all' }}>{collectionFolder ?? 'Not set'}</p>
          <button onClick={() => pickCollectionFolder()}>Change…</button>
        </section>

        <section>
          <h3 style={{ fontSize: '13px', color: 'var(--color-text-dim)', margin: '0 0 8px' }}>Backups</h3>
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
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the gear button to `Toolbar.tsx`**

In `src/components/Toolbar.tsx`, change the function signature:

```tsx
export function Toolbar() {
```

to:

```tsx
export function Toolbar({ onOpenSettings }: { onOpenSettings: () => void }) {
```

Add this button right after the opening `<div style={{ display: 'flex', gap: '12px', ...`'s search `<input>` element, inside the same flex row (immediately before the closing `<div style={{ display: 'flex', flexDirection: 'column', ...` block that holds "Update Collection"):

```tsx
      <button onClick={onOpenSettings} style={{ alignSelf: 'flex-start' }}>
        <span className="material-symbols-outlined">settings</span>
      </button>
```

- [ ] **Step 3: Wire modal state into `App.tsx`**

In `src/App.tsx`, add to the imports:

```tsx
import { SettingsModal } from './components/SettingsModal'
```

Inside the `App` component, add:

```tsx
  const [settingsOpen, setSettingsOpen] = useState(false)
```

Change:

```tsx
        <div style={{ gridArea: 'toolbar' }}>
          <Toolbar />
        </div>
```

to:

```tsx
        <div style={{ gridArea: 'toolbar' }}>
          <Toolbar onOpenSettings={() => setSettingsOpen(true)} />
        </div>
```

And add, as a sibling of `<ScanPrompt />` near the top of the returned JSX (inside the outermost `<>` fragment, before the `<div className="app-layout" ...>`):

```tsx
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
```

- [ ] **Step 4: Type-check and manual walkthrough**

Run: `npx tsc -b --noEmit`
Expected: no errors.

Run: `npm run dev`, click the new gear icon in the toolbar.
Expected: a modal opens showing the collection folder (with a working "Change…" button) and the backup folder path + last-backup time. Clicking outside the panel or the close button closes it.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsModal.tsx src/components/Toolbar.tsx src/App.tsx
git commit -m "feat: add Settings modal with collection folder and backup status"
```
