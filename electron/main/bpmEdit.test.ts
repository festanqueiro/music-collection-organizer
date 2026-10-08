import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase, type AppDatabase } from './db'
import { changeTrackBpm, type MeasureNear } from './bpmEdit'

describe('changeTrackBpm', () => {
  let db: AppDatabase
  let id: number
  const row = () => db.prepare('SELECT bpm, bpm_edited FROM tracks WHERE id = ?').get(id) as { bpm: number | null; bpm_edited: number }
  // Stands in for the audio: it agrees with the whole number next to what's asked.
  const whole: MeasureNear = async (_path, target) => Math.round(target)
  const none: MeasureNear = async () => null

  beforeEach(() => {
    db = openDatabase(':memory:')
    id = db
      .prepare(`INSERT INTO tracks (path, filename, folder, format, size, mtime, bpm) VALUES ('/m/a.wav', 'a.wav', '/m', 'wav', 1, 1, 106.58)`)
      .run().lastInsertRowid as number
  })

  it('multiplies the tempo and sharpens it on the audio: two thirds fixed, doubled, halved', async () => {
    expect(await changeTrackBpm(db, id, { kind: 'factor', factor: 1.5 }, whole)).toEqual({ ok: true })
    expect(row()).toEqual({ bpm: 160, bpm_edited: 1 })
    await changeTrackBpm(db, id, { kind: 'factor', factor: 0.5 }, whole)
    expect(row().bpm).toBe(80)
    await changeTrackBpm(db, id, { kind: 'factor', factor: 2 }, whole)
    expect(row().bpm).toBe(160)
  })

  it('keeps the plain product when the audio says nothing, or something far off', async () => {
    await changeTrackBpm(db, id, { kind: 'factor', factor: 1.5 }, none)
    expect(row().bpm).toBe(159.87)
    db.prepare('UPDATE tracks SET bpm = 106.58 WHERE id = ?').run(id)
    await changeTrackBpm(db, id, { kind: 'factor', factor: 1.5 }, async () => 175)
    expect(row().bpm).toBe(159.87)
    db.prepare('UPDATE tracks SET bpm = 106.58 WHERE id = ?').run(id)
    await changeTrackBpm(db, id, { kind: 'factor', factor: 1.5 }, async () => {
      throw new Error('the file is gone')
    })
    expect(row().bpm).toBe(159.87)
  })

  it('sets the tempo typed, as typed, to a hundredth', async () => {
    expect(await changeTrackBpm(db, id, { kind: 'set', bpm: 172.456 }, whole)).toEqual({ ok: true })
    expect(row()).toEqual({ bpm: 172.46, bpm_edited: 1 })
  })

  it('refuses what is not a tempo, and a factor on a track with no BPM', async () => {
    expect((await changeTrackBpm(db, id, { kind: 'set', bpm: 12 }, whole)).ok).toBe(false)
    expect((await changeTrackBpm(db, id, { kind: 'set', bpm: 400 }, whole)).ok).toBe(false)
    expect((await changeTrackBpm(db, id, { kind: 'set', bpm: NaN }, whole)).ok).toBe(false)
    expect((await changeTrackBpm(db, id, { kind: 'factor', factor: 4 }, whole)).ok).toBe(false)
    expect(row()).toEqual({ bpm: 106.58, bpm_edited: 0 })
    db.prepare('UPDATE tracks SET bpm = NULL WHERE id = ?').run(id)
    expect((await changeTrackBpm(db, id, { kind: 'factor', factor: 2 }, whole)).ok).toBe(false)
    expect((await changeTrackBpm(db, 999, { kind: 'set', bpm: 120 }, whole)).ok).toBe(false)
  })

  it('hands the tempo back to analysis on "detect"', async () => {
    await changeTrackBpm(db, id, { kind: 'set', bpm: 170 }, whole)
    expect(await changeTrackBpm(db, id, { kind: 'detect' }, whole)).toEqual({ ok: true })
    expect(row()).toEqual({ bpm: 170, bpm_edited: 0 })
  })
})
