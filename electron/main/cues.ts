// Cue points (docs/features/hot-cues.md): hot cues A–H set in MCO, and the
// cues Rekordbox has (hot cues, memory cues, loops) brought in from its
// collection export. Writes return the track's cues after the write, so
// the renderer patches locally (the repo's convention).
import { runInTransaction, type AppDatabase } from './db'
import type { TrackCue } from '../../src/types'
import type { RekordboxCollection } from './rekordboxXml'
import { rgbToHex } from '../../src/state/hotCues'

interface CueRow {
  id: number
  kind: TrackCue['kind']
  slot: number
  start: number
  end: number | null
  color: string | null
  name: string
}

export function getTrackCues(db: AppDatabase, trackId: number): TrackCue[] {
  return db
    .prepare('SELECT id, kind, slot, start, end, color, name FROM track_cues WHERE track_id = ? ORDER BY start, slot')
    .all(trackId) as unknown as CueRow[]
}

// How many hot cues each track has, for the table.
export function getHotCueCounts(db: AppDatabase): Record<number, number> {
  const rows = db.prepare("SELECT track_id, COUNT(*) AS n FROM track_cues WHERE kind = 'hot' GROUP BY track_id").all() as {
    track_id: number
    n: number
  }[]
  return Object.fromEntries(rows.map((r) => [r.track_id, r.n]))
}

// Places hot cue `slot` (0–7) at `start` seconds; an existing cue there
// moves, keeping its colour and name.
export function setHotCue(db: AppDatabase, trackId: number, slot: number, start: number): TrackCue[] {
  if (!Number.isInteger(slot) || slot < 0 || slot > 7) throw new Error('A hot cue slot is 0–7 (A–H)')
  if (!Number.isFinite(start) || start < 0) throw new Error('A cue needs a time')
  const time = Math.round(start * 1000) / 1000
  const moved = db.prepare("UPDATE track_cues SET start = ? WHERE track_id = ? AND kind = 'hot' AND slot = ?").run(time, trackId, slot)
  if (Number(moved.changes) === 0) {
    db.prepare("INSERT INTO track_cues (track_id, kind, slot, start) VALUES (?, 'hot', ?, ?)").run(trackId, slot, time)
  }
  return getTrackCues(db, trackId)
}

export function updateHotCue(db: AppDatabase, trackId: number, slot: number, changes: { color?: string | null; name?: string }): TrackCue[] {
  if (changes.color !== undefined) {
    if (changes.color !== null && !/^#[0-9a-f]{6}$/i.test(changes.color)) throw new Error('A colour is #rrggbb')
    db.prepare("UPDATE track_cues SET color = ? WHERE track_id = ? AND kind = 'hot' AND slot = ?").run(changes.color, trackId, slot)
  }
  if (changes.name !== undefined) {
    db.prepare("UPDATE track_cues SET name = ? WHERE track_id = ? AND kind = 'hot' AND slot = ?").run(changes.name.trim(), trackId, slot)
  }
  return getTrackCues(db, trackId)
}

export function deleteHotCue(db: AppDatabase, trackId: number, slot: number): TrackCue[] {
  db.prepare("DELETE FROM track_cues WHERE track_id = ? AND kind = 'hot' AND slot = ?").run(trackId, slot)
  return getTrackCues(db, trackId)
}

// Rekordbox's cues → MCO, for songs MCO has (matched by path) that have no
// cues in MCO yet — songs with MCO cues are left alone and counted.
export function importRekordboxCues(
  db: AppDatabase,
  collection: RekordboxCollection,
  match: (path: string) => number | undefined
): { songs: number; cues: number; skipped: number } {
  return runInTransaction(db, () => {
    const hasCues = db.prepare('SELECT 1 FROM track_cues WHERE track_id = ? LIMIT 1')
    const exists = db.prepare('SELECT 1 FROM tracks WHERE id = ?')
    const insert = db.prepare('INSERT INTO track_cues (track_id, kind, slot, start, end, color, name) VALUES (?, ?, ?, ?, ?, ?, ?)')
    let songs = 0
    let cues = 0
    let skipped = 0
    const done = new Set<number>()
    for (const t of collection.tracks) {
      if (t.cues.length === 0) continue
      const id = match(t.path)
      if (id === undefined || done.has(id) || !exists.get(id)) continue
      done.add(id)
      if (hasCues.get(id)) {
        skipped++
        continue
      }
      const takenSlots = new Set<number>()
      for (const c of t.cues) {
        const kind: TrackCue['kind'] = c.type === 4 ? 'loop' : c.num >= 0 && c.num <= 7 ? 'hot' : 'memory'
        // Rekordbox numbers hot loops with a slot too; MCO keeps them as loops.
        const slot = kind === 'hot' ? c.num : -1
        if (kind === 'hot' && takenSlots.has(slot)) continue
        if (kind === 'hot') takenSlots.add(slot)
        insert.run(id, kind, slot, Math.round(c.start * 1000) / 1000, c.end ?? null, c.color ? rgbToHex(c.color) : null, '')
        cues++
      }
      songs++
    }
    return { songs, cues, skipped }
  })
}
