// "Refine BPM" in a track's menu (docs/features/dj-tools.md, ADR 0064): the
// beat tracker can report a tempo an octave out (85 for 170), or two thirds
// of it (108 for 162). The user doubles it, halves it, multiplies it by one
// and a half, or types it. A tempo set this way is the user's: analysis
// leaves it alone (`bpm_edited`) until they ask for the detected one again.
import type { AppDatabase } from './db'
import type { BpmChange } from '../../src/types'

// Outside this nothing is a tempo; a slip of the keyboard, more likely.
export const SLOWEST_BPM = 30
export const FASTEST_BPM = 300

// The tempo the track's audio agrees on near `target`, or null when it
// can't be measured (analysis/tempoRefine.ts, without the jump to 1.5×).
export type MeasureNear = (path: string, target: number) => Promise<number | null>

const round2 = (bpm: number) => Math.round(bpm * 100) / 100

export async function changeTrackBpm(
  db: AppDatabase,
  trackId: number,
  change: BpmChange,
  measure: MeasureNear
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const row = db.prepare('SELECT path, bpm, present, cloud_status FROM tracks WHERE id = ?').get(trackId) as
    | { path: string; bpm: number | null; present: number; cloud_status: string }
    | undefined
  if (!row) return { ok: false, reason: 'No longer in the collection' }
  if (change.kind === 'detect') {
    db.prepare('UPDATE tracks SET bpm_edited = 0 WHERE id = ?').run(trackId)
    return { ok: true }
  }
  let bpm: number
  if (change.kind === 'set') {
    bpm = round2(change.bpm)
  } else {
    if (!row.bpm) return { ok: false, reason: 'No BPM yet — analyse it, or set one' }
    const target = row.bpm * change.factor
    bpm = round2(target)
    if (bpm >= SLOWEST_BPM && bpm <= FASTEST_BPM && row.present && row.cloud_status === 'local') {
      // 106.58 × 1.5 is 159.87: the audio says 160. Kept only if it stays
      // close to what was asked for.
      const measured = await measure(row.path, target).catch(() => null)
      if (measured && Math.abs(measured / target - 1) <= 0.035) bpm = measured
    }
  }
  if (!Number.isFinite(bpm) || bpm < SLOWEST_BPM || bpm > FASTEST_BPM) {
    return { ok: false, reason: `A BPM is between ${SLOWEST_BPM} and ${FASTEST_BPM}` }
  }
  db.prepare('UPDATE tracks SET bpm = ?, bpm_edited = 1 WHERE id = ?').run(bpm, trackId)
  return { ok: true }
}
