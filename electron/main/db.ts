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
