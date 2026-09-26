# v1 Library Organizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 Electron desktop app that scans a configurable folder of DJ music, analyzes tracks (tags, BPM, key, waveform), stores results in local SQLite, and exposes a dark-themed three-pane browsing/tagging/filtering UI.

**Architecture:** Electron main process owns SQLite (`better-sqlite3`), the folder scan, and a background analysis worker queue; a typed `contextBridge` preload exposes everything to a React renderer over IPC. Pure logic (scan-diff, cloud detection, waveform computation, tag filter combination, folder-tree building) lives in standalone testable modules separate from I/O.

**Tech Stack:** Electron + `electron-vite` + React + TypeScript, `better-sqlite3`, `electron-store`, `music-metadata`, `ffmpeg-static`, `essentia.js` (WASM), `zustand` (renderer state), Vitest (tests), `@fontsource/jost`, `material-symbols`.

**Spec:** `docs/superpowers/specs/2026-08-20-v1-library-organizer-design.md`

## Global Constraints

- Platform: macOS only for v1 (per spec).
- TypeScript strict mode across main, preload, and renderer code.
- Test runner: Vitest, run via `npm test` (`vitest run`).
- `better-sqlite3` is synchronous and only ever touched from the main process.
- Renderer never touches Node/fs/DB directly: `contextIsolation: true`, `nodeIntegration: false`, all access goes through the preload `contextBridge` API.
- No Google Drive API/OAuth anywhere — cloud-only file handling relies solely on filesystem access to the Drive for Desktop mount (per spec's out-of-scope section).
- Font is Jost, self-hosted via `@fontsource/jost` (no CDN dependency). Icons are Material Symbols, self-hosted via the `material-symbols` npm package.
- Commit after every task's final passing-test step.

---

## File Structure

```
package.json
electron.vite.config.ts
tsconfig.json
electron/
  main/
    index.ts              -- app entry, BrowserWindow creation
    db.ts                  -- better-sqlite3 connection + schema init
    config.ts              -- electron-store wrapper (collection folder path)
    scanDiff.ts             -- pure diff logic (Task 5)
    folderWalk.ts           -- fs walk producing DiskFile[] (Task 6)
    cloudDetect.ts          -- pure cloud-only heuristic (Task 7)
    scan.ts                 -- orchestrates walk+diff+cloudDetect+DB upsert (Task 8)
    tags.ts                  -- genre/subgenre/mood CRUD + cascade/orphan logic (Task 9)
    ipc.ts                   -- ipcMain.handle registrations (Task 10)
    analysis/
      waveform.ts            -- pure peak computation (Task 11)
      decode.ts               -- ffmpeg PCM decode (Task 12)
      metadata.ts              -- music-metadata tag extraction (Task 13)
      bpmKey.ts                -- essentia.js BPM/key detection (Task 14)
      queue.ts                 -- worker pool + progress events (Task 15)
      worker.ts                -- worker_thread entry point (Task 15)
    cloudDownload.ts          -- materialize cloud-only file + requeue (Task 16)
  preload/
    index.ts                  -- contextBridge API (Task 10)
src/
  main.tsx
  App.tsx                      -- top-level layout wiring (Task 22)
  theme.css                    -- dark palette, Jost font-face import (Task 17)
  types.ts                      -- shared Track/Genre/Subgenre/Mood/etc TS types
  state/
    store.ts                    -- zustand store (Task 17)
    tagFilter.ts                 -- pure OR-within/AND-across matching logic (Task 20)
    folderTree.ts                 -- pure tree-from-paths builder (Task 19)
  components/
    Toolbar.tsx                   -- search bar + Update Collection button (Task 18)
    ScanPrompt.tsx                 -- startup "Scan folder for changes?" dialog (Task 18)
    LeftPane.tsx                    -- Folders/Tags toggle container (Task 19/20)
    FolderTree.tsx                   -- renders folderTree.ts output (Task 19)
    TagTree.tsx                       -- renders Genre/Sub-Genre/Mood checkboxes (Task 20)
    TrackTable.tsx                     -- sortable track table (Task 19)
    DetailPanel.tsx                     -- tag pickers, waveform, player, download (Task 21)
    Player.tsx                           -- play/pause/seek audio element (Task 21)
tests/
  fixtures/
    audioFixture.ts                     -- generates a synthetic WAV tone in a temp dir
  (colocated *.test.ts next to each module above)
```

---

## Task 1: Scaffold Electron + Vite + React + TypeScript project

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `electron/main/index.ts`, `electron/preload/index.ts`, `src/main.tsx`, `src/App.tsx`
- Test: none (scaffold verification is a manual run)

**Interfaces:**
- Produces: a running `npm run dev` Electron window; `npm test` command wired to Vitest (used by every later task).

- [ ] **Step 1: Scaffold with the official template**

```bash
npm create @quick-start/electron@latest . -- --template react-ts
```

When prompted, choose: TypeScript, no ESLint/Prettier scaffolding conflict (accept defaults), skip Playwright/testing scaffold (Vitest is added in Task 2).

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

- [ ] **Step 3: Verify the dev app launches**

Run: `npm run dev`
Expected: an Electron window opens showing the template's default React page. Close the app.

- [ ] **Step 4: Simplify the default App shell**

Replace `src/App.tsx` with a minimal placeholder (full layout comes in Task 22):

```tsx
export default function App() {
  return <div>Music Collection Organizer</div>
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite + react + typescript project"
```

---

## Task 2: Configure Vitest test runner

**Files:**
- Modify: `package.json` (add `test` script and devDependency)
- Create: `vitest.config.ts`
- Test: `tests/sanity.test.ts`

**Interfaces:**
- Produces: `npm test` runs Vitest; all later tasks' test files are discovered automatically via this config.

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Add config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/*.test.ts', 'src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add npm script**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run"
```

- [ ] **Step 4: Write a sanity test**

```ts
// tests/sanity.test.ts
import { describe, it, expect } from 'vitest'

describe('sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add vitest test runner"
```

---

## Task 3: SQLite schema & DB init module

**Files:**
- Create: `electron/main/db.ts`
- Test: `electron/main/db.test.ts`

**Interfaces:**
- Produces: `openDatabase(path: string): Database.Database` — opens (creating if needed) a `better-sqlite3` connection with the full schema applied. `path === ':memory:'` supported for tests.

- [ ] **Step 1: Install better-sqlite3**

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3 electron-rebuild
```

Add to `package.json` `"scripts"`: `"postinstall": "electron-rebuild -f -w better-sqlite3"`.

- [ ] **Step 2: Write the failing test**

```ts
// electron/main/db.test.ts
import { describe, it, expect } from 'vitest'
import { openDatabase } from './db'

describe('openDatabase', () => {
  it('creates all expected tables', () => {
    const db = openDatabase(':memory:')
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name)
    expect(tables).toEqual([
      'genres',
      'moods',
      'subgenres',
      'track_genres',
      'track_moods',
      'track_subgenres',
      'tracks',
    ])
    db.close()
  })

  it('enforces genre cascade delete onto subgenres', () => {
    const db = openDatabase(':memory:')
    db.prepare('INSERT INTO genres (id, name) VALUES (1, ?)').run('House')
    db.prepare('INSERT INTO subgenres (id, name, genre_id) VALUES (1, ?, 1)').run('Deep House')
    db.prepare('DELETE FROM genres WHERE id = 1').run()
    const remaining = db.prepare('SELECT * FROM subgenres').all()
    expect(remaining).toEqual([])
    db.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- db.test.ts`
Expected: FAIL — `openDatabase` not defined.

- [ ] **Step 3: Implement**

```ts
// electron/main/db.ts
import Database from 'better-sqlite3'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  filename TEXT NOT NULL,
  folder TEXT NOT NULL,
  format TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  duration REAL,
  title TEXT,
  artist TEXT,
  album TEXT,
  genre_tag TEXT,
  year INTEGER,
  bpm REAL,
  musical_key TEXT,
  waveform_peaks TEXT,
  cloud_status TEXT NOT NULL DEFAULT 'local',
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  analyzed_at INTEGER
);

CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS subgenres (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS moods (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS track_genres (
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (track_id, genre_id)
);

CREATE TABLE IF NOT EXISTS track_subgenres (
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  subgenre_id INTEGER NOT NULL REFERENCES subgenres(id) ON DELETE CASCADE,
  PRIMARY KEY (track_id, subgenre_id)
);

CREATE TABLE IF NOT EXISTS track_moods (
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  mood_id INTEGER NOT NULL REFERENCES moods(id) ON DELETE CASCADE,
  PRIMARY KEY (track_id, mood_id)
);
`

export function openDatabase(path: string): Database.Database {
  const db = new Database(path)
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- db.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add sqlite schema and db init module"
```

---

## Task 4: App config store (collection folder path)

**Files:**
- Create: `electron/main/config.ts`
- Test: `electron/main/config.test.ts`

**Interfaces:**
- Produces: `getCollectionFolder(): string | null`, `setCollectionFolder(path: string): void` — backed by `electron-store`, separate from the SQLite collection DB per spec.

- [ ] **Step 1: Install electron-store**

```bash
npm install electron-store
```

- [ ] **Step 2: Write the failing test**

```ts
// electron/main/config.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import Store from 'electron-store'
import { getCollectionFolder, setCollectionFolder, __setStoreForTests } from './config'

describe('config store', () => {
  beforeEach(() => {
    __setStoreForTests(new Store({ name: `test-${Math.random()}` }))
  })

  it('returns null when unset', () => {
    expect(getCollectionFolder()).toBeNull()
  })

  it('persists a set folder', () => {
    setCollectionFolder('/Users/dj/Music')
    expect(getCollectionFolder()).toBe('/Users/dj/Music')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- config.test.ts`
Expected: FAIL — module not defined.

- [ ] **Step 4: Implement**

```ts
// electron/main/config.ts
import Store from 'electron-store'

interface ConfigSchema {
  collectionFolder?: string
}

let store = new Store<ConfigSchema>({ name: 'config' })

export function __setStoreForTests(testStore: Store<ConfigSchema>) {
  store = testStore
}

export function getCollectionFolder(): string | null {
  return store.get('collectionFolder') ?? null
}

export function setCollectionFolder(path: string): void {
  store.set('collectionFolder', path)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- config.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add app config store for collection folder path"
```

---

## Task 5: Scan-diff pure logic

**Files:**
- Create: `electron/main/scanDiff.ts`
- Test: `electron/main/scanDiff.test.ts`

**Interfaces:**
- Produces: `DiskFile { path, size, mtime }`, `DbTrackRow { path, size, mtime }`, `ScanDiff { toInsert, toUpdate, toRemove }`, `diffScan(diskFiles, dbRows): ScanDiff`. Consumed by Task 8.

- [ ] **Step 1: Write the failing tests**

```ts
// electron/main/scanDiff.test.ts
import { describe, it, expect } from 'vitest'
import { diffScan } from './scanDiff'

describe('diffScan', () => {
  it('flags new files as toInsert', () => {
    const result = diffScan([{ path: '/a.wav', size: 100, mtime: 1 }], [])
    expect(result.toInsert).toEqual([{ path: '/a.wav', size: 100, mtime: 1 }])
    expect(result.toUpdate).toEqual([])
    expect(result.toRemove).toEqual([])
  })

  it('flags changed files as toUpdate', () => {
    const result = diffScan(
      [{ path: '/a.wav', size: 200, mtime: 2 }],
      [{ path: '/a.wav', size: 100, mtime: 1 }]
    )
    expect(result.toUpdate).toEqual([{ path: '/a.wav', size: 200, mtime: 2 }])
    expect(result.toInsert).toEqual([])
  })

  it('leaves unchanged files alone', () => {
    const result = diffScan(
      [{ path: '/a.wav', size: 100, mtime: 1 }],
      [{ path: '/a.wav', size: 100, mtime: 1 }]
    )
    expect(result.toInsert).toEqual([])
    expect(result.toUpdate).toEqual([])
    expect(result.toRemove).toEqual([])
  })

  it('flags missing files as toRemove', () => {
    const result = diffScan([], [{ path: '/gone.wav', size: 100, mtime: 1 }])
    expect(result.toRemove).toEqual(['/gone.wav'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- scanDiff.test.ts`
Expected: FAIL — module not defined.

- [ ] **Step 3: Implement**

```ts
// electron/main/scanDiff.ts
export interface DiskFile {
  path: string
  size: number
  mtime: number
}

export interface DbTrackRow {
  path: string
  size: number
  mtime: number
}

export interface ScanDiff {
  toInsert: DiskFile[]
  toUpdate: DiskFile[]
  toRemove: string[]
}

export function diffScan(diskFiles: DiskFile[], dbRows: DbTrackRow[]): ScanDiff {
  const dbByPath = new Map(dbRows.map((r) => [r.path, r]))
  const diskPaths = new Set(diskFiles.map((f) => f.path))

  const toInsert: DiskFile[] = []
  const toUpdate: DiskFile[] = []
  for (const file of diskFiles) {
    const existing = dbByPath.get(file.path)
    if (!existing) {
      toInsert.push(file)
    } else if (existing.size !== file.size || existing.mtime !== file.mtime) {
      toUpdate.push(file)
    }
  }

  const toRemove = dbRows.filter((r) => !diskPaths.has(r.path)).map((r) => r.path)

  return { toInsert, toUpdate, toRemove }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- scanDiff.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add pure scan-diff logic"
```

---

## Task 6: Folder walk (fs integration)

**Files:**
- Create: `electron/main/folderWalk.ts`
- Test: `electron/main/folderWalk.test.ts`

**Interfaces:**
- Consumes: `DiskFile` type from Task 5 (`scanDiff.ts`).
- Produces: `walkAudioFiles(rootPath: string): DiskFile[]` — recursively finds `.wav`/`.aiff`/`.aif`/`.flac` files.

- [ ] **Step 1: Write the failing test**

```ts
// electron/main/folderWalk.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { walkAudioFiles } from './folderWalk'

describe('walkAudioFiles', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'walk-test-'))
    mkdirSync(join(root, 'sub'), { recursive: true })
    writeFileSync(join(root, 'track1.wav'), 'x')
    writeFileSync(join(root, 'sub', 'track2.flac'), 'xx')
    writeFileSync(join(root, 'notes.txt'), 'ignore me')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('finds audio files recursively, ignores non-audio', () => {
    const files = walkAudioFiles(root)
    const paths = files.map((f) => f.path).sort()
    expect(paths).toEqual([join(root, 'sub', 'track2.flac'), join(root, 'track1.wav')])
  })

  it('reports correct size for each file', () => {
    const files = walkAudioFiles(root)
    const track1 = files.find((f) => f.path.endsWith('track1.wav'))!
    expect(track1.size).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- folderWalk.test.ts`
Expected: FAIL — module not defined.

- [ ] **Step 3: Implement**

```ts
// electron/main/folderWalk.ts
import { readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import type { DiskFile } from './scanDiff'

const AUDIO_EXTENSIONS = new Set(['.wav', '.aiff', '.aif', '.flac'])

export function walkAudioFiles(rootPath: string): DiskFile[] {
  const results: DiskFile[] = []

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        const stats = statSync(fullPath)
        results.push({ path: fullPath, size: stats.size, mtime: Math.floor(stats.mtimeMs) })
      }
    }
  }

  walk(rootPath)
  return results
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- folderWalk.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add recursive audio file folder walk"
```

---

## Task 7: Cloud-only detection heuristic

**Files:**
- Create: `electron/main/cloudDetect.ts`
- Test: `electron/main/cloudDetect.test.ts`

**Interfaces:**
- Produces: `isCloudOnly(stats: { size: number; blocks: number }): boolean`. Consumed by Task 8.

- [ ] **Step 1: Write the failing tests**

```ts
// electron/main/cloudDetect.test.ts
import { describe, it, expect } from 'vitest'
import { isCloudOnly } from './cloudDetect'

describe('isCloudOnly', () => {
  it('returns false for a fully-allocated file', () => {
    // 100KB file, ~100KB allocated (196 blocks * 512 bytes ~= 100352)
    expect(isCloudOnly({ size: 100000, blocks: 196 })).toBe(false)
  })

  it('returns true for a placeholder file with near-zero allocation', () => {
    expect(isCloudOnly({ size: 5_000_000, blocks: 8 })).toBe(true)
  })

  it('returns false for an empty file', () => {
    expect(isCloudOnly({ size: 0, blocks: 0 })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- cloudDetect.test.ts`
Expected: FAIL — module not defined.

- [ ] **Step 3: Implement**

```ts
// electron/main/cloudDetect.ts
export function isCloudOnly(stats: { size: number; blocks: number }): boolean {
  if (stats.size === 0) return false
  const allocatedBytes = stats.blocks * 512
  return allocatedBytes < stats.size * 0.5
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- cloudDetect.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add cloud-only file detection heuristic"
```

**Note for implementer:** per the spec's open risk #1, validate this heuristic against a real Google Drive for Desktop "stream" mode mount on macOS before relying on it in production use — create one cloud-only placeholder file and one fully-downloaded file there, and confirm `fs.statSync` on each gives the expected `blocks`/`size` relationship this function assumes.

---

## Task 8: Wire scan flow (walk + diff + cloud detect + DB upsert)

**Files:**
- Create: `electron/main/scan.ts`
- Test: `electron/main/scan.test.ts`

**Interfaces:**
- Consumes: `openDatabase` (Task 3), `walkAudioFiles` (Task 6), `diffScan` (Task 5), `isCloudOnly` (Task 7).
- Produces: `runScan(db: Database.Database, rootPath: string): ScanResult` where `ScanResult = { inserted: number; updated: number; removed: number }`. This is the function both the startup prompt and "Update Collection" button call (per spec).

- [ ] **Step 1: Write the failing test**

```ts
// electron/main/scan.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { openDatabase } from './db'
import { runScan } from './scan'

describe('runScan', () => {
  let root: string
  let db: Database.Database

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'scan-test-'))
    db = openDatabase(':memory:')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    db.close()
  })

  it('inserts newly found tracks as pending', () => {
    writeFileSync(join(root, 'a.wav'), 'x'.repeat(1000))
    const result = runScan(db, root)
    expect(result.inserted).toBe(1)
    const row = db.prepare('SELECT * FROM tracks').get() as any
    expect(row.analysis_status).toBe('pending')
    expect(row.filename).toBe('a.wav')
  })

  it('marks removed files gone from the DB on rescan', () => {
    const filePath = join(root, 'b.wav')
    writeFileSync(filePath, 'x'.repeat(1000))
    runScan(db, root)
    unlinkSync(filePath)
    const result = runScan(db, root)
    expect(result.removed).toBe(1)
    const row = db.prepare('SELECT * FROM tracks').get()
    expect(row).toBeUndefined()
  })

  it('does not reprocess unchanged files on rescan', () => {
    writeFileSync(join(root, 'c.wav'), 'x'.repeat(1000))
    runScan(db, root)
    const second = runScan(db, root)
    expect(second.inserted).toBe(0)
    expect(second.updated).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- scan.test.ts`
Expected: FAIL — module not defined.

- [ ] **Step 3: Implement**

```ts
// electron/main/scan.ts
import { statSync } from 'node:fs'
import { dirname, basename, extname } from 'node:path'
import type Database from 'better-sqlite3'
import { walkAudioFiles } from './folderWalk'
import { diffScan, type DbTrackRow } from './scanDiff'
import { isCloudOnly } from './cloudDetect'

export interface ScanResult {
  inserted: number
  updated: number
  removed: number
}

export function runScan(db: Database.Database, rootPath: string): ScanResult {
  const diskFiles = walkAudioFiles(rootPath)
  const dbRows = db.prepare('SELECT path, size, mtime FROM tracks').all() as DbTrackRow[]
  const diff = diffScan(diskFiles, dbRows)

  const insertStmt = db.prepare(`
    INSERT INTO tracks (path, filename, folder, format, size, mtime, cloud_status, analysis_status)
    VALUES (@path, @filename, @folder, @format, @size, @mtime, @cloud_status, 'pending')
  `)
  const updateStmt = db.prepare(`
    UPDATE tracks SET size = @size, mtime = @mtime, cloud_status = @cloud_status, analysis_status = 'pending'
    WHERE path = @path
  `)
  const removeStmt = db.prepare('DELETE FROM tracks WHERE path = ?')

  const toRow = (file: { path: string; size: number; mtime: number }) => {
    const stats = statSync(file.path)
    const cloudStatus = isCloudOnly({ size: stats.size, blocks: (stats as any).blocks ?? 0 })
      ? 'cloud_only'
      : 'local'
    return {
      path: file.path,
      filename: basename(file.path),
      folder: dirname(file.path),
      format: extname(file.path).slice(1).toLowerCase(),
      size: file.size,
      mtime: file.mtime,
      cloud_status: cloudStatus,
    }
  }

  const transaction = db.transaction(() => {
    for (const file of diff.toInsert) insertStmt.run(toRow(file))
    for (const file of diff.toUpdate) updateStmt.run(toRow(file))
    for (const path of diff.toRemove) removeStmt.run(path)
  })
  transaction()

  return { inserted: diff.toInsert.length, updated: diff.toUpdate.length, removed: diff.toRemove.length }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- scan.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire folder walk, diff, and cloud detection into scan flow"
```

---

## Task 9: Tag data layer (genres/subgenres/moods CRUD + cascade/orphan logic)

**Files:**
- Create: `electron/main/tags.ts`
- Test: `electron/main/tags.test.ts`

**Interfaces:**
- Consumes: `openDatabase` (Task 3).
- Produces:
  - `createGenre(db, name): number`, `createSubgenre(db, name, genreId): number`, `createMood(db, name): number`
  - `deleteGenre(db, genreId): void`
  - `setTrackGenres(db, trackId, genreIds: number[]): void` — replaces the track's genre set, and auto-removes any of the track's subgenre tags whose parent genre is no longer in `genreIds`.
  - `setTrackSubgenres(db, trackId, subgenreIds: number[]): void`
  - `setTrackMoods(db, trackId, moodIds: number[]): void`
  - `getTrackTagIds(db, trackId): { genreIds: number[]; subgenreIds: number[]; moodIds: number[] }`

- [ ] **Step 1: Write the failing tests**

```ts
// electron/main/tags.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { openDatabase } from './db'
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

describe('tags', () => {
  let db: Database.Database
  let trackId: number

  beforeEach(() => {
    db = openDatabase(':memory:')
    trackId = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES ('/a.wav','a.wav','/', 'wav', 1, 1)`
      )
      .run().lastInsertRowid as number
  })

  it('creates genres, subgenres, moods and tags a track', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    const energeticId = createMood(db, 'Energetic')

    setTrackGenres(db, trackId, [houseId])
    setTrackSubgenres(db, trackId, [deepHouseId])
    setTrackMoods(db, trackId, [energeticId])

    expect(getTrackTagIds(db, trackId)).toEqual({
      genreIds: [houseId],
      subgenreIds: [deepHouseId],
      moodIds: [energeticId],
    })
  })

  it('auto-removes orphaned subgenre tags when parent genre is unassigned', () => {
    const houseId = createGenre(db, 'House')
    const deepHouseId = createSubgenre(db, 'Deep House', houseId)
    setTrackGenres(db, trackId, [houseId])
    setTrackSubgenres(db, trackId, [deepHouseId])

    setTrackGenres(db, trackId, []) // unassign House

    expect(getTrackTagIds(db, trackId).subgenreIds).toEqual([])
  })

  it('cascades subgenre deletion when a genre is deleted', () => {
    const houseId = createGenre(db, 'House')
    createSubgenre(db, 'Deep House', houseId)
    deleteGenre(db, houseId)
    const remaining = db.prepare('SELECT * FROM subgenres').all()
    expect(remaining).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tags.test.ts`
Expected: FAIL — module not defined.

- [ ] **Step 3: Implement**

```ts
// electron/main/tags.ts
import type Database from 'better-sqlite3'

export function createGenre(db: Database.Database, name: string): number {
  return db.prepare('INSERT INTO genres (name) VALUES (?)').run(name).lastInsertRowid as number
}

export function createSubgenre(db: Database.Database, name: string, genreId: number): number {
  return db
    .prepare('INSERT INTO subgenres (name, genre_id) VALUES (?, ?)')
    .run(name, genreId).lastInsertRowid as number
}

export function createMood(db: Database.Database, name: string): number {
  return db.prepare('INSERT INTO moods (name) VALUES (?)').run(name).lastInsertRowid as number
}

export function deleteGenre(db: Database.Database, genreId: number): void {
  db.prepare('DELETE FROM genres WHERE id = ?').run(genreId)
}

export function setTrackGenres(db: Database.Database, trackId: number, genreIds: number[]): void {
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM track_genres WHERE track_id = ?').run(trackId)
    for (const genreId of genreIds) {
      db.prepare('INSERT INTO track_genres (track_id, genre_id) VALUES (?, ?)').run(trackId, genreId)
    }

    const keptGenreIds = new Set(genreIds)
    const trackSubgenres = db
      .prepare(
        `SELECT s.id as subgenre_id, s.genre_id as genre_id
         FROM track_subgenres ts JOIN subgenres s ON s.id = ts.subgenre_id
         WHERE ts.track_id = ?`
      )
      .all(trackId) as { subgenre_id: number; genre_id: number }[]

    for (const row of trackSubgenres) {
      if (!keptGenreIds.has(row.genre_id)) {
        db.prepare('DELETE FROM track_subgenres WHERE track_id = ? AND subgenre_id = ?').run(
          trackId,
          row.subgenre_id
        )
      }
    }
  })
  transaction()
}

export function setTrackSubgenres(db: Database.Database, trackId: number, subgenreIds: number[]): void {
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM track_subgenres WHERE track_id = ?').run(trackId)
    for (const subgenreId of subgenreIds) {
      db.prepare('INSERT INTO track_subgenres (track_id, subgenre_id) VALUES (?, ?)').run(trackId, subgenreId)
    }
  })
  transaction()
}

export function setTrackMoods(db: Database.Database, trackId: number, moodIds: number[]): void {
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM track_moods WHERE track_id = ?').run(trackId)
    for (const moodId of moodIds) {
      db.prepare('INSERT INTO track_moods (track_id, mood_id) VALUES (?, ?)').run(trackId, moodId)
    }
  })
  transaction()
}

export function getTrackTagIds(
  db: Database.Database,
  trackId: number
): { genreIds: number[]; subgenreIds: number[]; moodIds: number[] } {
  const genreIds = (db.prepare('SELECT genre_id FROM track_genres WHERE track_id = ?').all(trackId) as any[]).map(
    (r) => r.genre_id
  )
  const subgenreIds = (
    db.prepare('SELECT subgenre_id FROM track_subgenres WHERE track_id = ?').all(trackId) as any[]
  ).map((r) => r.subgenre_id)
  const moodIds = (db.prepare('SELECT mood_id FROM track_moods WHERE track_id = ?').all(trackId) as any[]).map(
    (r) => r.mood_id
  )
  return { genreIds, subgenreIds, moodIds }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tags.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add genre/subgenre/mood tag data layer with cascade and orphan cleanup"
```

---

## Task 10: IPC + preload bridge

**Files:**
- Create: `electron/main/ipc.ts`
- Modify: `electron/main/index.ts`, `electron/preload/index.ts`
- Create: `src/types.ts`
- Test: none automated (IPC wiring is verified via manual smoke run, documented below); type-check via `tsc --noEmit` stands in as the automated check for this task

**Interfaces:**
- Consumes: `runScan` (Task 8), `getCollectionFolder`/`setCollectionFolder` (Task 4), all of `tags.ts` (Task 9), `openDatabase` (Task 3).
- Produces: `window.api` typed surface in the renderer:
  ```ts
  interface Api {
    getCollectionFolder(): Promise<string | null>
    chooseCollectionFolder(): Promise<string | null>
    scanCollection(): Promise<{ inserted: number; updated: number; removed: number }>
    getTracks(): Promise<Track[]>
    getGenres(): Promise<Genre[]>
    getSubgenres(): Promise<Subgenre[]>
    getMoods(): Promise<Mood[]>
    setTrackGenres(trackId: number, genreIds: number[]): Promise<void>
    setTrackSubgenres(trackId: number, subgenreIds: number[]): Promise<void>
    setTrackMoods(trackId: number, moodIds: number[]): Promise<void>
    onScanProgress(cb: (progress: { done: number; total: number }) => void): () => void
  }
  ```
  This surface is consumed by every renderer task (17-22).

- [ ] **Step 1: Define shared types**

```ts
// src/types.ts
export interface Track {
  id: number
  path: string
  filename: string
  folder: string
  format: string
  size: number
  mtime: number
  duration: number | null
  title: string | null
  artist: string | null
  album: string | null
  year: number | null
  bpm: number | null
  musicalKey: string | null
  waveformPeaks: number[] | null
  cloudStatus: 'local' | 'cloud_only'
  analysisStatus: 'pending' | 'analyzing' | 'done' | 'error'
}

export interface Genre {
  id: number
  name: string
}

export interface Subgenre {
  id: number
  name: string
  genreId: number
}

export interface Mood {
  id: number
  name: string
}
```

- [ ] **Step 2: Implement ipc.ts**

```ts
// electron/main/ipc.ts
import { ipcMain, dialog, BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'
import { getCollectionFolder, setCollectionFolder } from './config'
import { runScan } from './scan'
import {
  createGenre,
  createSubgenre,
  createMood,
  setTrackGenres,
  setTrackSubgenres,
  setTrackMoods,
} from './tags'

function rowToTrack(row: any) {
  return {
    id: row.id,
    path: row.path,
    filename: row.filename,
    folder: row.folder,
    format: row.format,
    size: row.size,
    mtime: row.mtime,
    duration: row.duration,
    title: row.title,
    artist: row.artist,
    album: row.album,
    year: row.year,
    bpm: row.bpm,
    musicalKey: row.musical_key,
    waveformPeaks: row.waveform_peaks ? JSON.parse(row.waveform_peaks) : null,
    cloudStatus: row.cloud_status,
    analysisStatus: row.analysis_status,
  }
}

export function registerIpcHandlers(db: Database.Database, mainWindow: BrowserWindow) {
  ipcMain.handle('config:getCollectionFolder', () => getCollectionFolder())

  ipcMain.handle('config:chooseCollectionFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    const folder = result.filePaths[0]
    setCollectionFolder(folder)
    return folder
  })

  ipcMain.handle('scan:run', () => {
    const folder = getCollectionFolder()
    if (!folder) throw new Error('No collection folder configured')
    return runScan(db, folder)
  })

  ipcMain.handle('tracks:getAll', () => {
    return (db.prepare('SELECT * FROM tracks').all() as any[]).map(rowToTrack)
  })

  ipcMain.handle('tags:getGenres', () => db.prepare('SELECT * FROM genres').all())
  ipcMain.handle('tags:getSubgenres', () =>
    (db.prepare('SELECT * FROM subgenres').all() as any[]).map((r) => ({
      id: r.id,
      name: r.name,
      genreId: r.genre_id,
    }))
  )
  ipcMain.handle('tags:getMoods', () => db.prepare('SELECT * FROM moods').all())

  ipcMain.handle('tags:createGenre', (_e, name: string) => createGenre(db, name))
  ipcMain.handle('tags:createSubgenre', (_e, name: string, genreId: number) => createSubgenre(db, name, genreId))
  ipcMain.handle('tags:createMood', (_e, name: string) => createMood(db, name))

  ipcMain.handle('tags:setTrackGenres', (_e, trackId: number, genreIds: number[]) =>
    setTrackGenres(db, trackId, genreIds)
  )
  ipcMain.handle('tags:setTrackSubgenres', (_e, trackId: number, subgenreIds: number[]) =>
    setTrackSubgenres(db, trackId, subgenreIds)
  )
  ipcMain.handle('tags:setTrackMoods', (_e, trackId: number, moodIds: number[]) =>
    setTrackMoods(db, trackId, moodIds)
  )
}
```

- [ ] **Step 3: Implement preload bridge**

```ts
// electron/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getCollectionFolder: () => ipcRenderer.invoke('config:getCollectionFolder'),
  chooseCollectionFolder: () => ipcRenderer.invoke('config:chooseCollectionFolder'),
  scanCollection: () => ipcRenderer.invoke('scan:run'),
  getTracks: () => ipcRenderer.invoke('tracks:getAll'),
  getGenres: () => ipcRenderer.invoke('tags:getGenres'),
  getSubgenres: () => ipcRenderer.invoke('tags:getSubgenres'),
  getMoods: () => ipcRenderer.invoke('tags:getMoods'),
  createGenre: (name: string) => ipcRenderer.invoke('tags:createGenre', name),
  createSubgenre: (name: string, genreId: number) => ipcRenderer.invoke('tags:createSubgenre', name, genreId),
  createMood: (name: string) => ipcRenderer.invoke('tags:createMood', name),
  setTrackGenres: (trackId: number, genreIds: number[]) =>
    ipcRenderer.invoke('tags:setTrackGenres', trackId, genreIds),
  setTrackSubgenres: (trackId: number, subgenreIds: number[]) =>
    ipcRenderer.invoke('tags:setTrackSubgenres', trackId, subgenreIds),
  setTrackMoods: (trackId: number, moodIds: number[]) =>
    ipcRenderer.invoke('tags:setTrackMoods', trackId, moodIds),
  onScanProgress: (cb: (progress: { done: number; total: number }) => void) => {
    const listener = (_e: unknown, progress: { done: number; total: number }) => cb(progress)
    ipcRenderer.on('scan:progress', listener)
    return () => ipcRenderer.removeListener('scan:progress', listener)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
```

- [ ] **Step 4: Wire into main entry**

Modify `electron/main/index.ts` to open the DB on app ready and call `registerIpcHandlers`:

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { openDatabase } from './db'
import { registerIpcHandlers } from './ipc'

app.whenReady().then(() => {
  const db = openDatabase(join(app.getPath('userData'), 'collection.db'))

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  registerIpcHandlers(db, mainWindow)

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
})
```

- [ ] **Step 5: Add a global type declaration for `window.api`**

```ts
// src/vite-env.d.ts (append)
import type { Api } from '../electron/preload/index'
declare global {
  interface Window {
    api: Api
  }
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev`, open DevTools console in the window, run `await window.api.getTracks()`.
Expected: resolves to `[]` (empty DB, no crash).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: wire ipc handlers and typed preload bridge"
```

---

## Task 11: Waveform peak computation (pure)

**Files:**
- Create: `electron/main/analysis/waveform.ts`
- Test: `electron/main/analysis/waveform.test.ts`

**Interfaces:**
- Produces: `computeWaveformPeaks(pcm: Float32Array, peakCount?: number): number[]`. Consumed by Task 15.

- [ ] **Step 1: Write the failing tests**

```ts
// electron/main/analysis/waveform.test.ts
import { describe, it, expect } from 'vitest'
import { computeWaveformPeaks } from './waveform'

describe('computeWaveformPeaks', () => {
  it('returns the requested number of peaks', () => {
    const pcm = new Float32Array(1000).fill(0.5)
    const peaks = computeWaveformPeaks(pcm, 10)
    expect(peaks).toHaveLength(10)
  })

  it('captures the max absolute amplitude per bucket', () => {
    const pcm = new Float32Array([0.1, -0.9, 0.2, 0.3, -0.1, 0.05])
    const peaks = computeWaveformPeaks(pcm, 2)
    expect(peaks[0]).toBeCloseTo(0.9)
    expect(peaks[1]).toBeCloseTo(0.3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- waveform.test.ts`
Expected: FAIL — module not defined.

- [ ] **Step 3: Implement**

```ts
// electron/main/analysis/waveform.ts
export function computeWaveformPeaks(pcm: Float32Array, peakCount = 800): number[] {
  const peaks: number[] = []
  const samplesPerPeak = Math.max(1, Math.floor(pcm.length / peakCount))
  for (let i = 0; i < peakCount; i++) {
    const start = i * samplesPerPeak
    const end = Math.min(start + samplesPerPeak, pcm.length)
    let max = 0
    for (let j = start; j < end; j++) {
      const abs = Math.abs(pcm[j])
      if (abs > max) max = abs
    }
    peaks.push(max)
  }
  return peaks
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- waveform.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add pure waveform peak computation"
```

---

## Task 12: Audio fixture + PCM decode via ffmpeg

**Files:**
- Create: `tests/fixtures/audioFixture.ts`, `electron/main/analysis/decode.ts`
- Test: `electron/main/analysis/decode.test.ts`

**Interfaces:**
- Produces: `decodeToPcm(filePath: string, sampleRate?: number): Promise<Float32Array>` (mono, 32-bit float PCM). `createTestToneWav(dir: string): string` fixture helper, reused by Tasks 13-14.

- [ ] **Step 1: Write the fixture generator**

```ts
// tests/fixtures/audioFixture.ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Generates a 1-second, 44100Hz, mono, 16-bit PCM WAV file containing a 440Hz sine wave.
export function createTestToneWav(dir: string, filename = 'tone.wav'): string {
  const sampleRate = 44100
  const durationSeconds = 1
  const numSamples = sampleRate * durationSeconds
  const dataSize = numSamples * 2 // 16-bit = 2 bytes/sample
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16) // fmt chunk size
  buffer.writeUInt16LE(1, 20) // PCM format
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28) // byte rate
  buffer.writeUInt16LE(2, 32) // block align
  buffer.writeUInt16LE(16, 34) // bits per sample
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.5
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2)
  }

  const filePath = join(dir, filename)
  writeFileSync(filePath, buffer)
  return filePath
}
```

- [ ] **Step 2: Write the failing test**

```ts
// electron/main/analysis/decode.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestToneWav } from '../../../tests/fixtures/audioFixture'
import { decodeToPcm } from './decode'

describe('decodeToPcm', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'decode-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('decodes a wav file to a non-empty Float32Array', async () => {
    const filePath = createTestToneWav(dir)
    const pcm = await decodeToPcm(filePath)
    expect(pcm).toBeInstanceOf(Float32Array)
    expect(pcm.length).toBeGreaterThan(40000) // ~1 second at 44100Hz
  })

  it('rejects for a nonexistent file', async () => {
    await expect(decodeToPcm(join(dir, 'missing.wav'))).rejects.toThrow()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- decode.test.ts`
Expected: FAIL — module not defined.

- [ ] **Step 4: Install ffmpeg-static and implement**

```bash
npm install ffmpeg-static
npm install -D @types/node
```

```ts
// electron/main/analysis/decode.ts
import { spawn } from 'node:child_process'
// @ts-expect-error ffmpeg-static has no types
import ffmpegPath from 'ffmpeg-static'

export function decodeToPcm(filePath: string, sampleRate = 44100): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const args = ['-i', filePath, '-f', 'f32le', '-ac', '1', '-ar', String(sampleRate), '-loglevel', 'error', 'pipe:1']
    const proc = spawn(ffmpegPath as string, args)

    const chunks: Buffer[] = []
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`))
        return
      }
      const buffer = Buffer.concat(chunks)
      const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4)
      resolve(new Float32Array(floatArray)) // copy out of the shared buffer
    })
  })
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- decode.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add ffmpeg PCM decode and synthetic test-tone fixture"
```

---

## Task 13: Metadata extraction (music-metadata)

**Files:**
- Create: `electron/main/analysis/metadata.ts`
- Test: `electron/main/analysis/metadata.test.ts`

**Interfaces:**
- Produces: `extractMetadata(filePath: string): Promise<{ title: string | null; artist: string | null; album: string | null; genre: string | null; year: number | null; duration: number | null }>`. Consumed by Task 15.

- [ ] **Step 1: Install music-metadata**

```bash
npm install music-metadata
```

- [ ] **Step 2: Write the failing test**

```ts
// electron/main/analysis/metadata.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestToneWav } from '../../../tests/fixtures/audioFixture'
import { extractMetadata } from './metadata'

describe('extractMetadata', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'metadata-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('extracts duration from a wav file even with no tags', async () => {
    const filePath = createTestToneWav(dir)
    const meta = await extractMetadata(filePath)
    expect(meta.duration).toBeGreaterThan(0.9)
    expect(meta.duration).toBeLessThan(1.1)
    expect(meta.title).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- metadata.test.ts`
Expected: FAIL — module not defined.

- [ ] **Step 4: Implement**

```ts
// electron/main/analysis/metadata.ts
import { parseFile } from 'music-metadata'

export interface ExtractedMetadata {
  title: string | null
  artist: string | null
  album: string | null
  genre: string | null
  year: number | null
  duration: number | null
}

export async function extractMetadata(filePath: string): Promise<ExtractedMetadata> {
  const result = await parseFile(filePath)
  return {
    title: result.common.title ?? null,
    artist: result.common.artist ?? null,
    album: result.common.album ?? null,
    genre: result.common.genre?.[0] ?? null,
    year: result.common.year ?? null,
    duration: result.format.duration ?? null,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- metadata.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add tag metadata extraction via music-metadata"
```

---

## Task 14: BPM/key detection via essentia.js

**Files:**
- Create: `electron/main/analysis/bpmKey.ts`
- Test: `electron/main/analysis/bpmKey.test.ts`

**Interfaces:**
- Consumes: `decodeToPcm` (Task 12), `createTestToneWav` fixture (Task 12).
- Produces: `detectBpmAndKey(pcm: Float32Array): { bpm: number; key: string; scale: string }`. Consumed by Task 15.

- [ ] **Step 1: Install essentia.js**

```bash
npm install essentia.js
```

- [ ] **Step 2: Write the failing test**

```ts
// electron/main/analysis/bpmKey.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestToneWav } from '../../../tests/fixtures/audioFixture'
import { decodeToPcm } from './decode'
import { detectBpmAndKey } from './bpmKey'

describe('detectBpmAndKey', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bpmkey-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns numeric bpm and string key/scale without throwing', async () => {
    const filePath = createTestToneWav(dir)
    const pcm = await decodeToPcm(filePath)
    const result = detectBpmAndKey(pcm)
    expect(typeof result.bpm).toBe('number')
    expect(result.bpm).toBeGreaterThanOrEqual(0)
    expect(typeof result.key).toBe('string')
    expect(typeof result.scale).toBe('string')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- bpmKey.test.ts`
Expected: FAIL — module not defined.

- [ ] **Step 4: Implement**

```ts
// electron/main/analysis/bpmKey.ts
import { Essentia, EssentiaWASM } from 'essentia.js'

let essentiaInstance: Essentia | null = null

function getEssentia(): Essentia {
  if (!essentiaInstance) {
    essentiaInstance = new Essentia(EssentiaWASM)
  }
  return essentiaInstance
}

export interface BpmKeyResult {
  bpm: number
  key: string
  scale: string
}

export function detectBpmAndKey(pcm: Float32Array): BpmKeyResult {
  const essentia = getEssentia()
  const vector = essentia.arrayToVector(pcm)

  const rhythm = essentia.RhythmExtractor2013(vector)
  const keyResult = essentia.KeyExtractor(vector)

  return {
    bpm: rhythm.bpm,
    key: keyResult.key,
    scale: keyResult.scale,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- bpmKey.test.ts`
Expected: PASS, 1 test. **Note for implementer:** essentia.js's exact method names/return shapes (`RhythmExtractor2013`, `KeyExtractor`) should be confirmed against the installed version's TypeScript definitions if this fails to compile or run — treat a mismatch here as an API-surface fix, not a design change.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add bpm and key detection via essentia.js"
```

---

## Task 15: Analysis worker orchestration (queue + progress)

**Files:**
- Create: `electron/main/analysis/queue.ts`
- Test: `electron/main/analysis/queue.test.ts`

**Interfaces:**
- Consumes: `decodeToPcm` (12), `extractMetadata` (13), `detectBpmAndKey` (14), `computeWaveformPeaks` (11), `openDatabase` (3).
- Produces: `analyzeTrack(db, track: { id: number; path: string }): Promise<void>` — runs the full pipeline for one track and upserts results, setting `analysis_status`. `runAnalysisQueue(db, tracks, { concurrency, onProgress }): Promise<void>` — bounded-concurrency runner over pending tracks. This is what Task 22 wires the "Update Collection" flow to, after `runScan`.

- [ ] **Step 1: Write the failing tests**

```ts
// electron/main/analysis/queue.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { openDatabase } from '../db'
import { createTestToneWav } from '../../../tests/fixtures/audioFixture'
import { analyzeTrack, runAnalysisQueue } from './queue'

describe('analyzeTrack', () => {
  let dir: string
  let db: Database.Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'queue-test-'))
    db = openDatabase(':memory:')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    db.close()
  })

  it('analyzes a track and marks it done', async () => {
    const filePath = createTestToneWav(dir)
    const id = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES (?, 'tone.wav', ?, 'wav', 1, 1)`
      )
      .run(filePath, dir).lastInsertRowid as number

    await analyzeTrack(db, { id, path: filePath })

    const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as any
    expect(row.analysis_status).toBe('done')
    expect(row.duration).toBeGreaterThan(0.9)
    expect(typeof row.bpm).toBe('number')
    expect(JSON.parse(row.waveform_peaks)).toHaveLength(800)
  })

  it('marks a track as error if analysis throws', async () => {
    const id = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES (?, 'missing.wav', '/', 'wav', 1, 1)`
      )
      .run(join(dir, 'missing.wav')).lastInsertRowid as number

    await analyzeTrack(db, { id, path: join(dir, 'missing.wav') })

    const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as any
    expect(row.analysis_status).toBe('error')
  })
})

describe('runAnalysisQueue', () => {
  let dir: string
  let db: Database.Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'queue-multi-test-'))
    db = openDatabase(':memory:')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    db.close()
  })

  it('processes all given tracks and reports progress', async () => {
    const filePath = createTestToneWav(dir)
    const ids: number[] = []
    for (let i = 0; i < 3; i++) {
      const id = db
        .prepare(
          `INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES (?, ?, ?, 'wav', 1, 1)`
        )
        .run(`${filePath}-${i}`, `tone${i}.wav`, dir).lastInsertRowid as number
      ids.push(id)
    }
    // Point every row at the same real fixture file so decode succeeds.
    for (const id of ids) {
      db.prepare('UPDATE tracks SET path = ? WHERE id = ?').run(filePath, id)
    }

    const progressCalls: { done: number; total: number }[] = []
    await runAnalysisQueue(
      db,
      ids.map((id) => ({ id, path: filePath })),
      { concurrency: 2, onProgress: (p) => progressCalls.push(p) }
    )

    const rows = db.prepare('SELECT analysis_status FROM tracks').all() as any[]
    expect(rows.every((r) => r.analysis_status === 'done')).toBe(true)
    expect(progressCalls[progressCalls.length - 1]).toEqual({ done: 3, total: 3 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- queue.test.ts`
Expected: FAIL — module not defined.

- [ ] **Step 3: Implement**

```ts
// electron/main/analysis/queue.ts
import type Database from 'better-sqlite3'
import { decodeToPcm } from './decode'
import { extractMetadata } from './metadata'
import { detectBpmAndKey } from './bpmKey'
import { computeWaveformPeaks } from './waveform'

export async function analyzeTrack(db: Database.Database, track: { id: number; path: string }): Promise<void> {
  db.prepare("UPDATE tracks SET analysis_status = 'analyzing' WHERE id = ?").run(track.id)
  try {
    const [metadata, pcm] = await Promise.all([extractMetadata(track.path), decodeToPcm(track.path)])
    const { bpm, key, scale } = detectBpmAndKey(pcm)
    const peaks = computeWaveformPeaks(pcm)

    db.prepare(
      `UPDATE tracks SET
        title = @title, artist = @artist, album = @album, genre_tag = @genre, year = @year, duration = @duration,
        bpm = @bpm, musical_key = @musical_key, waveform_peaks = @waveform_peaks,
        analysis_status = 'done', analyzed_at = @analyzed_at
      WHERE id = @id`
    ).run({
      id: track.id,
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      genre: metadata.genre,
      year: metadata.year,
      duration: metadata.duration,
      bpm,
      musical_key: `${key} ${scale}`,
      waveform_peaks: JSON.stringify(peaks),
      analyzed_at: Date.now(),
    })
  } catch {
    db.prepare("UPDATE tracks SET analysis_status = 'error' WHERE id = ?").run(track.id)
  }
}

export async function runAnalysisQueue(
  db: Database.Database,
  tracks: { id: number; path: string }[],
  options: { concurrency: number; onProgress?: (progress: { done: number; total: number }) => void }
): Promise<void> {
  const total = tracks.length
  let done = 0
  let nextIndex = 0

  async function worker() {
    while (nextIndex < tracks.length) {
      const track = tracks[nextIndex++]
      await analyzeTrack(db, track)
      done++
      options.onProgress?.({ done, total })
    }
  }

  const workers = Array.from({ length: Math.min(options.concurrency, tracks.length) }, () => worker())
  await Promise.all(workers)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- queue.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add analysis queue orchestration with progress reporting"
```

**Note for implementer:** this task runs the pipeline in-process with bounded async concurrency (not true `worker_threads`) which is sufficient given `decodeToPcm` and `essentia.js` calls are already I/O/WASM-bound rather than blocking the Node event loop for long synchronous stretches. If real-world profiling on a large collection shows main-thread UI jank, moving `analyzeTrack` into a `worker_threads` pool is a follow-up, not a v1 blocker.

---

## Task 16: Cloud file download action

**Files:**
- Create: `electron/main/cloudDownload.ts`
- Test: `electron/main/cloudDownload.test.ts`

**Interfaces:**
- Consumes: `analyzeTrack` (Task 15).
- Produces: `downloadTrack(db, track: { id: number; path: string }): Promise<void>` — reads the file's full bytes (materializing a cloud-only file), sets `cloud_status = 'local'`, then re-runs analysis.

- [ ] **Step 1: Write the failing test**

```ts
// electron/main/cloudDownload.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { openDatabase } from './db'
import { createTestToneWav } from '../../tests/fixtures/audioFixture'
import { downloadTrack } from './cloudDownload'

describe('downloadTrack', () => {
  let dir: string
  let db: Database.Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'download-test-'))
    db = openDatabase(':memory:')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    db.close()
  })

  it('marks the track local and analyzed after download', async () => {
    const filePath = createTestToneWav(dir)
    const id = db
      .prepare(
        `INSERT INTO tracks (path, filename, folder, format, size, mtime, cloud_status) VALUES (?, 'tone.wav', ?, 'wav', 1, 1, 'cloud_only')`
      )
      .run(filePath, dir).lastInsertRowid as number

    await downloadTrack(db, { id, path: filePath })

    const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as any
    expect(row.cloud_status).toBe('local')
    expect(row.analysis_status).toBe('done')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cloudDownload.test.ts`
Expected: FAIL — module not defined.

- [ ] **Step 3: Implement**

```ts
// electron/main/cloudDownload.ts
import { readFile } from 'node:fs/promises'
import type Database from 'better-sqlite3'
import { analyzeTrack } from './analysis/queue'

export async function downloadTrack(db: Database.Database, track: { id: number; path: string }): Promise<void> {
  await readFile(track.path) // forces Drive for Desktop to materialize the file locally
  db.prepare("UPDATE tracks SET cloud_status = 'local' WHERE id = ?").run(track.id)
  await analyzeTrack(db, track)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- cloudDownload.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Add the IPC handler and preload method**

In `electron/main/ipc.ts`, add:

```ts
import { downloadTrack } from './cloudDownload'
// ...
ipcMain.handle('tracks:download', async (_e, trackId: number, path: string) => {
  await downloadTrack(db, { id: trackId, path })
})
```

In `electron/preload/index.ts`, add to `api`:

```ts
downloadTrack: (trackId: number, path: string) => ipcRenderer.invoke('tracks:download', trackId, path),
```

And extend the `Api` interface usage in `src/types.ts` is not needed (types.ts holds domain types, not the API shape — the `Api` type already flows from `typeof api`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add cloud file download/materialize action"
```

---

## Task 17: Renderer shell — theme + 3-pane layout scaffold + zustand store

**Files:**
- Create: `src/theme.css`, `src/state/store.ts`
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: none automated (visual/layout task; verified by manual run per step 5)

**Interfaces:**
- Produces: `useCollectionStore()` zustand hook exposing `{ tracks, genres, subgenres, moods, loadAll(), setTrackGenres(), setTrackSubgenres(), setTrackMoods() }`. Consumed by all remaining renderer tasks (18-22).

- [ ] **Step 1: Install zustand and fonts/icons**

```bash
npm install zustand @fontsource/jost material-symbols
```

- [ ] **Step 2: Write the theme stylesheet**

```css
/* src/theme.css */
@import '@fontsource/jost/400.css';
@import '@fontsource/jost/500.css';
@import '@fontsource/jost/600.css';
@import 'material-symbols/outlined.css';

:root {
  --color-bg: #12151a;
  --color-surface: #1b1f26;
  --color-surface-raised: #232833;
  --color-border: #2b3140;
  --color-text: #e6e9ef;
  --color-text-dim: #9aa3b2;
  --color-accent: #2dd4bf;
  --color-accent-strong: #14b8a6;
  --color-secondary: #a78bfa;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: 'Jost', sans-serif;
}

.material-symbols-outlined {
  font-size: 20px;
  vertical-align: middle;
}

.app-layout {
  display: grid;
  grid-template-columns: 260px 1fr 320px;
  height: 100vh;
}

.pane {
  overflow-y: auto;
  border-right: 1px solid var(--color-border);
}

.pane:last-child {
  border-right: none;
}
```

- [ ] **Step 3: Write the zustand store**

```ts
// src/state/store.ts
import { create } from 'zustand'
import type { Track, Genre, Subgenre, Mood } from '../types'

interface CollectionState {
  tracks: Track[]
  genres: Genre[]
  subgenres: Subgenre[]
  moods: Mood[]
  loadAll: () => Promise<void>
  setTrackGenres: (trackId: number, genreIds: number[]) => Promise<void>
  setTrackSubgenres: (trackId: number, subgenreIds: number[]) => Promise<void>
  setTrackMoods: (trackId: number, moodIds: number[]) => Promise<void>
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
  tracks: [],
  genres: [],
  subgenres: [],
  moods: [],

  loadAll: async () => {
    const [tracks, genres, subgenres, moods] = await Promise.all([
      window.api.getTracks(),
      window.api.getGenres(),
      window.api.getSubgenres(),
      window.api.getMoods(),
    ])
    set({ tracks, genres, subgenres, moods })
  },

  setTrackGenres: async (trackId, genreIds) => {
    await window.api.setTrackGenres(trackId, genreIds)
    await get().loadAll()
  },

  setTrackSubgenres: async (trackId, subgenreIds) => {
    await window.api.setTrackSubgenres(trackId, subgenreIds)
    await get().loadAll()
  },

  setTrackMoods: async (trackId, moodIds) => {
    await window.api.setTrackMoods(trackId, moodIds)
    await get().loadAll()
  },
}))
```

- [ ] **Step 4: Wire the layout scaffold**

```tsx
// src/App.tsx
import { useEffect } from 'react'
import { useCollectionStore } from './state/store'

export default function App() {
  const loadAll = useCollectionStore((s) => s.loadAll)

  useEffect(() => {
    loadAll()
  }, [loadAll])

  return (
    <div className="app-layout">
      <div className="pane">Left pane (Task 19/20)</div>
      <div className="pane">Center pane (Task 18/19)</div>
      <div className="pane">Right pane (Task 21)</div>
    </div>
  )
}
```

```tsx
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`
Expected: dark-themed window, three visible panes with placeholder text, Jost font applied (compare against system default font to confirm it loaded).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add dark theme, three-pane layout scaffold, and zustand store"
```

---

## Task 18: Toolbar (search + Update Collection) + startup scan prompt

**Files:**
- Create: `src/components/Toolbar.tsx`, `src/components/ScanPrompt.tsx`
- Modify: `src/App.tsx`, `src/state/store.ts`
- Test: none automated (thin UI wiring over already-tested `runScan`/IPC; verified manually per step 5)

**Interfaces:**
- Consumes: `useCollectionStore` (Task 17), `window.api.scanCollection` (Task 10).
- Produces: `searchText` state in the store, consumed by Task 19's `TrackTable`.

- [ ] **Step 1: Extend the store with search text and a scan action**

Add to `src/state/store.ts`:

```ts
interface CollectionState {
  // ...existing fields
  searchText: string
  setSearchText: (text: string) => void
  runScan: () => Promise<void>
}
```

```ts
export const useCollectionStore = create<CollectionState>((set, get) => ({
  // ...existing fields
  searchText: '',
  setSearchText: (text) => set({ searchText: text }),
  runScan: async () => {
    await window.api.scanCollection()
    await get().loadAll()
  },
}))
```

- [ ] **Step 2: Build the toolbar**

```tsx
// src/components/Toolbar.tsx
import { useCollectionStore } from '../state/store'

export function Toolbar() {
  const searchText = useCollectionStore((s) => s.searchText)
  const setSearchText = useCollectionStore((s) => s.setSearchText)
  const runScan = useCollectionStore((s) => s.runScan)

  return (
    <div style={{ display: 'flex', gap: '12px', padding: '12px', borderBottom: '1px solid var(--color-border)' }}>
      <input
        type="text"
        placeholder="Search title, artist, album..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{
          flex: 1,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '6px',
          padding: '8px 12px',
          color: 'var(--color-text)',
        }}
      />
      <button onClick={() => runScan()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span className="material-symbols-outlined">refresh</span>
        Update Collection
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Build the startup scan prompt**

```tsx
// src/components/ScanPrompt.tsx
import { useState } from 'react'
import { useCollectionStore } from '../state/store'

export function ScanPrompt() {
  const [dismissed, setDismissed] = useState(false)
  const runScan = useCollectionStore((s) => s.runScan)

  if (dismissed) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '16px',
        zIndex: 10,
      }}
    >
      <p style={{ margin: '0 0 12px' }}>Scan folder for changes?</p>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => {
            runScan()
            setDismissed(true)
          }}
        >
          Yes
        </button>
        <button onClick={() => setDismissed(true)}>No</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire both into App.tsx**

```tsx
// src/App.tsx
import { useEffect } from 'react'
import { useCollectionStore } from './state/store'
import { Toolbar } from './components/Toolbar'
import { ScanPrompt } from './components/ScanPrompt'

export default function App() {
  const loadAll = useCollectionStore((s) => s.loadAll)

  useEffect(() => {
    loadAll()
  }, [loadAll])

  return (
    <>
      <ScanPrompt />
      <div className="app-layout" style={{ gridTemplateRows: 'auto 1fr', gridTemplateAreas: "'toolbar toolbar toolbar' 'left center right'" }}>
        <div style={{ gridArea: 'toolbar' }}>
          <Toolbar />
        </div>
        <div className="pane">Left pane (Task 19/20)</div>
        <div className="pane">Center pane (Task 19)</div>
        <div className="pane">Right pane (Task 21)</div>
      </div>
    </>
  )
}
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Confirm the scan prompt appears on launch, "No" dismisses it, "Update Collection" button is visible and clickable (with no configured folder yet, expect an error in the console — that's fine, folder picking wiring lands in Task 19).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add toolbar with search and update-collection, startup scan prompt"
```

---

## Task 19: Track table + folder tree

**Files:**
- Create: `src/state/folderTree.ts`, `src/components/TrackTable.tsx`, `src/components/FolderTree.tsx`
- Modify: `src/App.tsx`
- Test: `src/state/folderTree.test.ts`

**Interfaces:**
- Produces: `buildFolderTree(folderPaths: string[], rootPath: string): FolderTreeNode` (pure, TDD'd). `TrackTable` and `FolderTree` React components, consumed by Task 22's final layout.

- [ ] **Step 1: Write the failing tests for the pure tree builder**

```ts
// src/state/folderTree.test.ts
import { describe, it, expect } from 'vitest'
import { buildFolderTree } from './folderTree'

describe('buildFolderTree', () => {
  it('builds a nested tree from flat folder paths', () => {
    const tree = buildFolderTree(['/root/House', '/root/House/Deep', '/root/Techno'], '/root')
    expect(tree.name).toBe('root')
    expect(tree.children.map((c) => c.name).sort()).toEqual(['House', 'Techno'])
    const houseNode = tree.children.find((c) => c.name === 'House')!
    expect(houseNode.children.map((c) => c.name)).toEqual(['Deep'])
  })

  it('deduplicates repeated folder paths', () => {
    const tree = buildFolderTree(['/root/House', '/root/House'], '/root')
    expect(tree.children).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- folderTree.test.ts`
Expected: FAIL — module not defined.

- [ ] **Step 3: Implement the pure tree builder**

```ts
// src/state/folderTree.ts
export interface FolderTreeNode {
  name: string
  path: string
  children: FolderTreeNode[]
}

export function buildFolderTree(folderPaths: string[], rootPath: string): FolderTreeNode {
  const root: FolderTreeNode = { name: rootPath.split('/').pop() || rootPath, path: rootPath, children: [] }
  const nodeByPath = new Map<string, FolderTreeNode>([[rootPath, root]])

  const sorted = [...new Set(folderPaths)].sort()
  for (const folderPath of sorted) {
    if (folderPath === rootPath) continue
    const relative = folderPath.startsWith(rootPath + '/') ? folderPath.slice(rootPath.length + 1) : folderPath
    const segments = relative.split('/')
    let currentPath = rootPath
    let parent = root
    for (const segment of segments) {
      currentPath = `${currentPath}/${segment}`
      let node = nodeByPath.get(currentPath)
      if (!node) {
        node = { name: segment, path: currentPath, children: [] }
        nodeByPath.set(currentPath, node)
        parent.children.push(node)
      }
      parent = node
    }
  }
  return root
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- folderTree.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Build the track table component**

```tsx
// src/components/TrackTable.tsx
import { useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import type { Track } from '../types'

type SortKey = 'title' | 'artist' | 'bpm' | 'musicalKey' | 'format' | 'duration'

export function TrackTable({
  onSelect,
  selectedFolder,
  activeFilter,
}: {
  onSelect: (track: Track) => void
  selectedFolder: string | null
  activeFilter: (track: Track) => boolean
}) {
  const tracks = useCollectionStore((s) => s.tracks)
  const searchText = useCollectionStore((s) => s.searchText)
  const [sortKey, setSortKey] = useState<SortKey>('title')

  const visibleTracks = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return tracks
      .filter((t) => (selectedFolder ? t.folder === selectedFolder || t.folder.startsWith(selectedFolder + '/') : true))
      .filter(activeFilter)
      .filter((t) =>
        query
          ? [t.title, t.artist, t.album, t.filename].some((v) => v?.toLowerCase().includes(query))
          : true
      )
      .sort((a, b) => {
        const av = a[sortKey] ?? ''
        const bv = b[sortKey] ?? ''
        return av < bv ? -1 : av > bv ? 1 : 0
      })
  }, [tracks, searchText, selectedFolder, activeFilter, sortKey])

  const columns: { key: SortKey; label: string }[] = [
    { key: 'title', label: 'Title' },
    { key: 'artist', label: 'Artist' },
    { key: 'bpm', label: 'BPM' },
    { key: 'musicalKey', label: 'Key' },
    { key: 'format', label: 'Format' },
    { key: 'duration', label: 'Duration' },
  ]

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} onClick={() => setSortKey(col.key)} style={{ cursor: 'pointer', textAlign: 'left', padding: '8px' }}>
              {col.label}
            </th>
          ))}
          <th>Cloud</th>
        </tr>
      </thead>
      <tbody>
        {visibleTracks.map((track) => (
          <tr key={track.id} onClick={() => onSelect(track)} style={{ cursor: 'pointer' }}>
            <td style={{ padding: '8px' }}>{track.title ?? track.filename}</td>
            <td>{track.artist ?? '—'}</td>
            <td>{track.bpm?.toFixed(0) ?? '—'}</td>
            <td>{track.musicalKey ?? '—'}</td>
            <td>{track.format}</td>
            <td>{track.duration ? `${Math.round(track.duration)}s` : '—'}</td>
            <td>
              {track.cloudStatus === 'cloud_only' ? <span className="material-symbols-outlined">cloud</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 6: Build the folder tree component**

```tsx
// src/components/FolderTree.tsx
import { useMemo } from 'react'
import { useCollectionStore } from '../state/store'
import { buildFolderTree, type FolderTreeNode } from '../state/folderTree'

function TreeNode({ node, onSelect, depth }: { node: FolderTreeNode; onSelect: (path: string) => void; depth: number }) {
  return (
    <div>
      <div style={{ paddingLeft: `${depth * 16}px`, cursor: 'pointer' }} onClick={() => onSelect(node.path)}>
        <span className="material-symbols-outlined">folder</span> {node.name}
      </div>
      {node.children.map((child) => (
        <TreeNode key={child.path} node={child} onSelect={onSelect} depth={depth + 1} />
      ))}
    </div>
  )
}

export function FolderTree({ rootPath, onSelect }: { rootPath: string; onSelect: (path: string | null) => void }) {
  const tracks = useCollectionStore((s) => s.tracks)
  const tree = useMemo(() => buildFolderTree(tracks.map((t) => t.folder), rootPath), [tracks, rootPath])

  return (
    <div>
      <div style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '8px' }} onClick={() => onSelect(null)}>
        All Tracks
      </div>
      <TreeNode node={tree} onSelect={onSelect} depth={0} />
    </div>
  )
}
```

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: all tests still PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add track table and folder tree components"
```

---

## Task 20: Tag tree + filter combination logic

**Files:**
- Create: `src/state/tagFilter.ts`, `src/components/TagTree.tsx`
- Test: `src/state/tagFilter.test.ts`

**Interfaces:**
- Consumes: `Genre`, `Subgenre`, `Mood` types (Task 10), `useCollectionStore` (Task 17).
- Produces: `TagFilterState { genreIds: Set<number>; subgenreIds: Set<number>; moodIds: Set<number> }`, `matchesTagFilter(track: TrackTagIds, filter: TagFilterState, subgenreIdsByGenreId: Map<number, number[]>): boolean` (pure, TDD'd). `TagTree` component producing an `activeFilter: (track: Track) => boolean` consumed by Task 19's `TrackTable` (via Task 22 wiring).

- [ ] **Step 1: Write the failing tests**

```ts
// src/state/tagFilter.test.ts
import { describe, it, expect } from 'vitest'
import { matchesTagFilter, type TagFilterState, type TrackTagIds } from './tagFilter'

const HOUSE = 1
const DEEP_HOUSE = 10
const TECHNO = 2
const ENERGETIC = 100

const subgenreIdsByGenreId = new Map([[HOUSE, [DEEP_HOUSE]]])

function track(overrides: Partial<TrackTagIds>): TrackTagIds {
  return { trackId: 1, genreIds: [], subgenreIds: [], moodIds: [], ...overrides }
}

function emptyFilter(): TagFilterState {
  return { genreIds: new Set(), subgenreIds: new Set(), moodIds: new Set() }
}

describe('matchesTagFilter', () => {
  it('matches everything when no filter is active', () => {
    expect(matchesTagFilter(track({}), emptyFilter(), subgenreIdsByGenreId)).toBe(true)
  })

  it('matches a track tagged with the selected genre', () => {
    const filter = { ...emptyFilter(), genreIds: new Set([HOUSE]) }
    expect(matchesTagFilter(track({ genreIds: [HOUSE] }), filter, subgenreIdsByGenreId)).toBe(true)
  })

  it('a genre selection also matches tracks tagged with its subgenres', () => {
    const filter = { ...emptyFilter(), genreIds: new Set([HOUSE]) }
    expect(matchesTagFilter(track({ subgenreIds: [DEEP_HOUSE] }), filter, subgenreIdsByGenreId)).toBe(true)
  })

  it('OR-combines multiple genre selections', () => {
    const filter = { ...emptyFilter(), genreIds: new Set([HOUSE, TECHNO]) }
    expect(matchesTagFilter(track({ genreIds: [TECHNO] }), filter, subgenreIdsByGenreId)).toBe(true)
  })

  it('excludes a track matching neither selected genre', () => {
    const filter = { ...emptyFilter(), genreIds: new Set([HOUSE]) }
    expect(matchesTagFilter(track({ genreIds: [TECHNO] }), filter, subgenreIdsByGenreId)).toBe(false)
  })

  it('AND-combines genre branch and mood branch', () => {
    const filter = { genreIds: new Set([HOUSE]), subgenreIds: new Set<number>(), moodIds: new Set([ENERGETIC]) }
    expect(matchesTagFilter(track({ genreIds: [HOUSE], moodIds: [] }), filter, subgenreIdsByGenreId)).toBe(false)
    expect(matchesTagFilter(track({ genreIds: [HOUSE], moodIds: [ENERGETIC] }), filter, subgenreIdsByGenreId)).toBe(
      true
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tagFilter.test.ts`
Expected: FAIL — module not defined.

- [ ] **Step 3: Implement**

```ts
// src/state/tagFilter.ts
export interface TagFilterState {
  genreIds: Set<number>
  subgenreIds: Set<number>
  moodIds: Set<number>
}

export interface TrackTagIds {
  trackId: number
  genreIds: number[]
  subgenreIds: number[]
  moodIds: number[]
}

export function matchesTagFilter(
  track: TrackTagIds,
  filter: TagFilterState,
  subgenreIdsByGenreId: Map<number, number[]>
): boolean {
  const genreBranchActive = filter.genreIds.size > 0 || filter.subgenreIds.size > 0
  const moodBranchActive = filter.moodIds.size > 0

  if (genreBranchActive) {
    const directGenreMatch = track.genreIds.some((id) => filter.genreIds.has(id))

    const impliedSubgenreIds = new Set<number>()
    for (const genreId of filter.genreIds) {
      for (const subId of subgenreIdsByGenreId.get(genreId) ?? []) impliedSubgenreIds.add(subId)
    }
    const subgenreMatch = track.subgenreIds.some(
      (id) => filter.subgenreIds.has(id) || impliedSubgenreIds.has(id)
    )

    if (!directGenreMatch && !subgenreMatch) return false
  }

  if (moodBranchActive) {
    const moodMatch = track.moodIds.some((id) => filter.moodIds.has(id))
    if (!moodMatch) return false
  }

  return true
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tagFilter.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Build the tag tree component**

Note: the app's `Track` type (from `src/types.ts`) does not carry per-track tag ids directly — the store needs a `trackTags: Map<number, TrackTagIds>` populated alongside `tracks`. Extend `src/state/store.ts`:

```ts
// add to CollectionState in src/state/store.ts
import type { TrackTagIds } from './tagFilter'
// ...
trackTags: Map<number, TrackTagIds>
```

In `loadAll`, after fetching tracks, also fetch each track's tag ids and populate the map (batched, not one IPC call per track):

Add an IPC handler in `electron/main/ipc.ts`:

```ts
ipcMain.handle('tracks:getAllTagIds', () => {
  const rows = db
    .prepare(
      `SELECT track_id, genre_id, NULL as subgenre_id, NULL as mood_id FROM track_genres
       UNION ALL
       SELECT track_id, NULL, subgenre_id, NULL FROM track_subgenres
       UNION ALL
       SELECT track_id, NULL, NULL, mood_id FROM track_moods`
    )
    .all() as any[]
  const byTrack = new Map<number, { genreIds: number[]; subgenreIds: number[]; moodIds: number[] }>()
  for (const row of rows) {
    if (!byTrack.has(row.track_id)) byTrack.set(row.track_id, { genreIds: [], subgenreIds: [], moodIds: [] })
    const entry = byTrack.get(row.track_id)!
    if (row.genre_id) entry.genreIds.push(row.genre_id)
    if (row.subgenre_id) entry.subgenreIds.push(row.subgenre_id)
    if (row.mood_id) entry.moodIds.push(row.mood_id)
  }
  return Array.from(byTrack.entries()).map(([trackId, tags]) => ({ trackId, ...tags }))
})
```

Add to `electron/preload/index.ts` `api`: `getAllTagIds: () => ipcRenderer.invoke('tracks:getAllTagIds')`.

Update `loadAll` in `src/state/store.ts`:

```ts
loadAll: async () => {
  const [tracks, genres, subgenres, moods, tagIdRows] = await Promise.all([
    window.api.getTracks(),
    window.api.getGenres(),
    window.api.getSubgenres(),
    window.api.getMoods(),
    window.api.getAllTagIds(),
  ])
  const trackTags = new Map(tagIdRows.map((r: any) => [r.trackId, r]))
  set({ tracks, genres, subgenres, moods, trackTags })
},
```

```tsx
// src/components/TagTree.tsx
import { useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { matchesTagFilter, type TagFilterState } from '../state/tagFilter'
import type { Track } from '../types'

export function TagTree({ onFilterChange }: { onFilterChange: (filter: (track: Track) => boolean) => void }) {
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const moods = useCollectionStore((s) => s.moods)
  const trackTags = useCollectionStore((s) => s.trackTags)

  const [genreIds, setGenreIds] = useState<Set<number>>(new Set())
  const [subgenreIds, setSubgenreIds] = useState<Set<number>>(new Set())
  const [moodIds, setMoodIds] = useState<Set<number>>(new Set())

  const subgenreIdsByGenreId = useMemo(() => {
    const map = new Map<number, number[]>()
    for (const sg of subgenres) {
      if (!map.has(sg.genreId)) map.set(sg.genreId, [])
      map.get(sg.genreId)!.push(sg.id)
    }
    return map
  }, [subgenres])

  function applyFilter(next: TagFilterState) {
    onFilterChange((track: Track) => {
      const tags = trackTags.get(track.id) ?? { trackId: track.id, genreIds: [], subgenreIds: [], moodIds: [] }
      return matchesTagFilter(tags, next, subgenreIdsByGenreId)
    })
  }

  function toggle(set: Set<number>, id: number, setter: (s: Set<number>) => void, key: 'genre' | 'subgenre' | 'mood') {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setter(next)
    const filterState: TagFilterState = {
      genreIds: key === 'genre' ? next : genreIds,
      subgenreIds: key === 'subgenre' ? next : subgenreIds,
      moodIds: key === 'mood' ? next : moodIds,
    }
    applyFilter(filterState)
  }

  return (
    <div>
      <div style={{ fontWeight: 600, margin: '8px 0' }}>Genre</div>
      {genres.map((genre) => (
        <div key={genre.id}>
          <label style={{ display: 'block', paddingLeft: '8px' }}>
            <input
              type="checkbox"
              checked={genreIds.has(genre.id)}
              onChange={() => toggle(genreIds, genre.id, setGenreIds, 'genre')}
            />{' '}
            {genre.name}
          </label>
          {subgenres
            .filter((sg) => sg.genreId === genre.id)
            .map((sg) => (
              <label key={sg.id} style={{ display: 'block', paddingLeft: '24px' }}>
                <input
                  type="checkbox"
                  checked={subgenreIds.has(sg.id)}
                  onChange={() => toggle(subgenreIds, sg.id, setSubgenreIds, 'subgenre')}
                />{' '}
                {sg.name}
              </label>
            ))}
        </div>
      ))}
      <div style={{ fontWeight: 600, margin: '8px 0' }}>Mood</div>
      {moods.map((mood) => (
        <label key={mood.id} style={{ display: 'block', paddingLeft: '8px' }}>
          <input
            type="checkbox"
            checked={moodIds.has(mood.id)}
            onChange={() => toggle(moodIds, mood.id, setMoodIds, 'mood')}
          />{' '}
          {mood.name}
        </label>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add tag tree with OR-within/AND-across filter logic"
```

---

## Task 21: Detail panel (tag pickers, waveform, player) + cloud download wiring

**Files:**
- Create: `src/components/DetailPanel.tsx`, `src/components/Player.tsx`
- Test: none automated (audio playback and canvas rendering are verified manually per step 4; underlying tag logic is already covered by Tasks 9 and 20's tests)

**Interfaces:**
- Consumes: `useCollectionStore` (Task 17), `matchesTagFilter`'s sibling data shapes (Task 20), `window.api.downloadTrack` (Task 16).

- [ ] **Step 1: Build the player component**

```tsx
// src/components/Player.tsx
import { useRef, useState } from 'react'

export function Player({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      audio.play()
    }
    setPlaying(!playing)
  }

  return (
    <div>
      <audio ref={audioRef} src={`file://${src}`} onEnded={() => setPlaying(false)} />
      <button onClick={toggle}>
        <span className="material-symbols-outlined">{playing ? 'pause' : 'play_arrow'}</span>
      </button>
      <input
        type="range"
        min={0}
        max={100}
        onChange={(e) => {
          const audio = audioRef.current
          if (audio && audio.duration) audio.currentTime = (Number(e.target.value) / 100) * audio.duration
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Build the detail panel**

```tsx
// src/components/DetailPanel.tsx
import { useCollectionStore } from '../state/store'
import type { Track } from '../types'
import { Player } from './Player'

export function DetailPanel({ track }: { track: Track | null }) {
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const moods = useCollectionStore((s) => s.moods)
  const trackTags = useCollectionStore((s) => s.trackTags)
  const setTrackGenres = useCollectionStore((s) => s.setTrackGenres)
  const setTrackSubgenres = useCollectionStore((s) => s.setTrackSubgenres)
  const setTrackMoods = useCollectionStore((s) => s.setTrackMoods)

  if (!track) return <div style={{ padding: '16px', color: 'var(--color-text-dim)' }}>Select a track</div>

  const tags = trackTags.get(track.id) ?? { trackId: track.id, genreIds: [], subgenreIds: [], moodIds: [] }
  const availableSubgenres = subgenres.filter((sg) => tags.genreIds.includes(sg.genreId))

  function toggleInList(list: number[], id: number): number[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  }

  if (track.cloudStatus === 'cloud_only') {
    return (
      <div style={{ padding: '16px' }}>
        <h3>{track.filename}</h3>
        <p>
          <span className="material-symbols-outlined">cloud</span> This file is not downloaded locally.
        </p>
        <button onClick={() => window.api.downloadTrack(track.id, track.path)}>Download</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px' }}>
      <h3>{track.title ?? track.filename}</h3>
      <p>{track.artist}</p>

      {track.waveformPeaks && (
        <svg width="100%" height="60" viewBox={`0 0 ${track.waveformPeaks.length} 100`} preserveAspectRatio="none">
          {track.waveformPeaks.map((peak, i) => (
            <rect key={i} x={i} y={50 - peak * 50} width={1} height={peak * 100} fill="var(--color-accent)" />
          ))}
        </svg>
      )}

      <Player src={track.path} />

      <div style={{ marginTop: '16px' }}>
        <div style={{ fontWeight: 600 }}>Genre</div>
        {genres.map((g) => (
          <label key={g.id} style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={tags.genreIds.includes(g.id)}
              onChange={() => setTrackGenres(track.id, toggleInList(tags.genreIds, g.id))}
            />{' '}
            {g.name}
          </label>
        ))}

        <div style={{ fontWeight: 600, marginTop: '8px' }}>Sub-Genre</div>
        {availableSubgenres.map((sg) => (
          <label key={sg.id} style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={tags.subgenreIds.includes(sg.id)}
              onChange={() => setTrackSubgenres(track.id, toggleInList(tags.subgenreIds, sg.id))}
            />{' '}
            {sg.name}
          </label>
        ))}

        <div style={{ fontWeight: 600, marginTop: '8px' }}>Mood</div>
        {moods.map((m) => (
          <label key={m.id} style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={tags.moodIds.includes(m.id)}
              onChange={() => setTrackMoods(track.id, toggleInList(tags.moodIds, m.id))}
            />{' '}
            {m.name}
          </label>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add `downloadTrack` to the `Api` type usage**

`window.api.downloadTrack` already exists from Task 16 Step 5 — no change needed, this step is just confirming the preload surface lines up (verified by `tsc --noEmit` in the next step).

- [ ] **Step 4: Type-check and manual verification**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run dev`, select a locally-available analyzed track, confirm waveform renders, play/pause/seek works, and Genre/Sub-Genre/Mood checkboxes update and persist (reselect the track to confirm).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add detail panel with tag pickers, waveform, player, and cloud download"
```

---

## Task 22: Final integration — wire full App layout

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: everything from Tasks 17-21.
- Produces: the complete v1 app shell.

- [ ] **Step 1: Wire the complete layout**

```tsx
// src/App.tsx
import { useEffect, useState } from 'react'
import { useCollectionStore } from './state/store'
import { Toolbar } from './components/Toolbar'
import { ScanPrompt } from './components/ScanPrompt'
import { FolderTree } from './components/FolderTree'
import { TagTree } from './components/TagTree'
import { TrackTable } from './components/TrackTable'
import { DetailPanel } from './components/DetailPanel'
import type { Track } from './types'

type LeftView = 'folders' | 'tags'

export default function App() {
  const loadAll = useCollectionStore((s) => s.loadAll)
  const [leftView, setLeftView] = useState<LeftView>('folders')
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null)
  const [tagFilter, setTagFilter] = useState<(track: Track) => boolean>(() => () => true)
  const [collectionFolder, setCollectionFolder] = useState<string | null>(null)

  useEffect(() => {
    loadAll()
    window.api.getCollectionFolder().then(setCollectionFolder)
  }, [loadAll])

  async function pickFolder() {
    const folder = await window.api.chooseCollectionFolder()
    if (folder) setCollectionFolder(folder)
  }

  return (
    <>
      <ScanPrompt />
      <div
        className="app-layout"
        style={{
          gridTemplateRows: 'auto 1fr',
          gridTemplateAreas: "'toolbar toolbar toolbar' 'left center right'",
        }}
      >
        <div style={{ gridArea: 'toolbar' }}>
          <Toolbar />
        </div>

        <div className="pane" style={{ gridArea: 'left', padding: '12px' }}>
          {!collectionFolder ? (
            <button onClick={pickFolder}>Choose collection folder…</button>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button onClick={() => setLeftView('folders')} disabled={leftView === 'folders'}>
                  Folders
                </button>
                <button onClick={() => setLeftView('tags')} disabled={leftView === 'tags'}>
                  Tags
                </button>
              </div>
              {leftView === 'folders' ? (
                <FolderTree rootPath={collectionFolder} onSelect={setSelectedFolder} />
              ) : (
                <TagTree onFilterChange={(filter) => setTagFilter(() => filter)} />
              )}
            </>
          )}
        </div>

        <div className="pane" style={{ gridArea: 'center' }}>
          <TrackTable onSelect={setSelectedTrack} selectedFolder={selectedFolder} activeFilter={tagFilter} />
        </div>

        <div className="pane" style={{ gridArea: 'right' }}>
          <DetailPanel track={selectedTrack} />
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run full automated test suite**

Run: `npm test`
Expected: every test across all 22 tasks PASSES.

- [ ] **Step 4: Full manual verification pass**

Run: `npm run dev`. Walk through:
1. Choose a collection folder containing a few small wav/aiff/flac files.
2. Dismiss or accept the scan prompt; confirm tracks appear in the table (progress visible if you added the optional progress UI — otherwise confirm the table populates after scan completes).
3. Toggle Folders/Tags in the left pane.
4. Select a track, confirm the detail panel shows waveform, tags, and playback works.
5. Create a Genre, a Sub-Genre under it, and a Mood; tag a track with all three; confirm the Tags tree filters the table correctly using each.
6. Rename/move a file in the folder, click "Update Collection", confirm the table reflects the change without duplicating rows.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire full v1 app layout"
```

---

## Self-Review Notes

- **Spec coverage:** every spec section maps to a task — data model (3, 9), scan flow (5-8), cloud detection (7, 8, 16), analysis pipeline (11-15), IPC/security boundary (10), UI layout/theme (17-22), tagging behavior including cascade/orphan cleanup (9), filter logic OR-within/AND-across (20). Both open technical risks from the spec are called out inline at Task 7 and Task 15 for the implementer to validate.
- **Placeholder scan:** no TBD/TODO markers; every step has concrete code or an exact command.
- **Type consistency:** `Track`, `Genre`, `Subgenre`, `Mood` types (Task 10) are reused verbatim through Tasks 17-22; `TagFilterState`/`TrackTagIds` (Task 20) match the `matchesTagFilter` signature used in `TagTree`; `analyzeTrack`/`runAnalysisQueue` (Task 15) signatures match their use in `cloudDownload.ts` (Task 16).
