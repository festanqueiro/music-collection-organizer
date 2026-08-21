import { DatabaseSync } from 'node:sqlite'

export type AppDatabase = DatabaseSync

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
  analyzed_at INTEGER,
  present INTEGER NOT NULL DEFAULT 1
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

export function openDatabase(path: string): AppDatabase {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  migrate(db)
  return db
}

// CREATE TABLE IF NOT EXISTS only applies to brand-new databases — it never
// alters a tracks table that already exists from before a column was added.
// This adds any columns older local databases are missing, so schema
// changes don't require deleting your collection.db.
function migrate(db: AppDatabase): void {
  const columns = db.prepare('PRAGMA table_info(tracks)').all() as { name: string }[]
  const columnNames = new Set(columns.map((c) => c.name))

  if (!columnNames.has('present')) {
    db.exec('ALTER TABLE tracks ADD COLUMN present INTEGER NOT NULL DEFAULT 1')
  }
}

// node:sqlite has no built-in transaction() helper like better-sqlite3; this
// wraps a block of statements in a manual BEGIN/COMMIT/ROLLBACK.
//
// Reentrant: a nested call (e.g. importTagData wrapping calls to
// addGenresToTracks, which itself calls runInTransaction) joins the
// already-open outer transaction instead of trying to BEGIN again, which
// SQLite would reject. Only the outermost call issues BEGIN/COMMIT/ROLLBACK;
// an error inside a nested call still propagates out and rolls back the
// whole outer transaction.
const transactionDepth = new WeakMap<AppDatabase, number>()

export function runInTransaction<T>(db: AppDatabase, fn: () => T): T {
  const depth = transactionDepth.get(db) ?? 0
  if (depth > 0) {
    transactionDepth.set(db, depth + 1)
    try {
      return fn()
    } finally {
      transactionDepth.set(db, depth)
    }
  }

  transactionDepth.set(db, 1)
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  } finally {
    transactionDepth.set(db, 0)
  }
}
