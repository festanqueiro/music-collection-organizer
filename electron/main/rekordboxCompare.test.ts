import { describe, it, expect, beforeEach } from 'vitest'
import { openDatabase, type AppDatabase } from './db'
import { compareWithRekordbox, loadMcoSide } from './rekordboxCompare'
import { addTracksToPlaylist, applyRekordboxImport, createPlaylistNode } from './playlists'
import { createGenre, createSubgenre, addGenresToTracks, addSubgenresToTracks } from './tags'
import type { RekordboxCollection, RekordboxTrack } from './rekordboxXml'

const C = '/music'
function rbTrack(id: string, path: string, extra: Partial<RekordboxTrack> = {}): RekordboxTrack {
  return { trackId: id, path, name: '', artist: '', album: '', genre: '', comments: '', year: null, bpm: null, tonality: '', seconds: 200, cues: [], ...extra }
}

describe('compareWithRekordbox', () => {
  let db: AppDatabase
  let ids: Record<string, number>
  beforeEach(() => {
    db = openDatabase(':memory:')
    const insert = db.prepare(
      `INSERT INTO tracks (path, filename, folder, format, size, mtime, title, artist, album, year, bpm, musical_key, present)
       VALUES (?, ?, ?, 'aiff', 1, 1, ?, ?, ?, ?, ?, ?, ?)`
    )
    const add = (name: string, title: string | null, artist: string | null, bpm: number | null, key: string | null, present = 1) =>
      insert.run(`${C}/${name}`, name, C, title, artist, 'EP', 2024, bpm, key, present).lastInsertRowid as number
    ids = {
      dub: add('dub.aiff', 'Deep Water', 'Low Tide', 140, 'G minor'),
      jungle: add('jungle.aiff', 'Iron Gate', 'Amber', 172, 'A minor'),
      untitled: add('Some File.aiff', null, null, 125, 'D minor'),
      onlyMco: add('mco-only.aiff', 'Only Here', 'X', 120, 'C major'),
      missing: add('gone.aiff', 'Gone', 'Y', 130, 'E minor', 0),
    }
    const dub = createGenre(db, 'Dub')
    const steppers = createSubgenre(db, 'Steppers', dub)
    addGenresToTracks(db, [ids.dub], [dub])
    addSubgenresToTracks(db, [ids.dub], [steppers])
  })

  const exists = (p: string) => !p.includes('deleted')
  const rb = (tracks: RekordboxTrack[], tree: RekordboxCollection['tree'] = []): RekordboxCollection => ({ version: '7.2.7', tracks, tree })

  it('lists music info that differs, with tolerance for tempo, key notation and genre spelling', () => {
    const report = compareWithRekordbox(
      'x.xml',
      rb([
        rbTrack('1', `${C}/dub.aiff`, { name: 'Deep Water', artist: 'Low Tide', album: 'EP', year: 2024, genre: 'steppers / DUB', bpm: 70.2, tonality: '6A' }),
        rbTrack('2', `${C}/jungle.aiff`, { name: 'Iron Gate (VIP)', artist: 'Amber', album: 'EP', year: 2024, genre: 'Jungle', bpm: 174, tonality: 'Em' }),
        rbTrack('3', `${C}/Some File.aiff`, { name: 'Some File', album: 'EP', year: 2024, bpm: 125, tonality: 'Dm' }),
      ]),
      loadMcoSide(db, C),
      exists
    )
    const field = (f: string) => report.info.find((i) => i.field === f)!
    expect(report.matched).toBe(3)
    // Same genre in another order/case/separator; half tempo; G minor = 6A; a file-name title.
    expect(field('genre').rows).toEqual([{ trackId: ids.jungle, song: 'Amber – Iron Gate', rekordbox: 'Jungle', mco: '—' }])
    expect(field('title').rows.map((r) => [r.rekordbox, r.mco])).toEqual([['Iron Gate (VIP)', 'Iron Gate']])
    expect(field('bpm').rows.map((r) => [r.rekordbox, r.mco])).toEqual([['174.00', '172.00']])
    expect(field('key').rows.map((r) => r.rekordbox)).toEqual(['Em (9A)'])
    expect(field('artist').count + field('album').count + field('year').count).toBe(0)
  })

  it('sorts files into outside the collection, not scanned, gone, only in MCO, missing in MCO', () => {
    const report = compareWithRekordbox(
      'x.xml',
      rb([
        rbTrack('1', '/Volumes/USB/Contents/a.aiff', { name: 'From Stick' }),
        rbTrack('2', `${C}/new.aiff`, { name: 'New' }),
        rbTrack('3', `${C}/deleted.aiff`, { name: 'Deleted' }),
        rbTrack('4', `${C}/gone.aiff`, { name: 'Gone' }),
        rbTrack('5', `${C}/dub.aiff`, { name: 'Deep Water' }),
      ]),
      loadMcoSide(db, C),
      exists
    )
    const kind = (k: string) => report.files.find((f) => f.kind === k)!
    expect(kind('outside-collection').rows.map((r) => r.song)).toEqual(['From Stick'])
    expect(kind('not-scanned').rows.map((r) => r.song)).toEqual(['New'])
    expect(kind('gone-from-disk').rows.map((r) => r.song)).toEqual(['Deleted'])
    expect(kind('missing-in-mco').rows.map((r) => r.song)).toEqual(['Gone'])
    expect(kind('only-in-mco').rows.map((r) => r.song).sort()).toEqual(['Amber – Iron Gate', 'Some File.aiff', 'X – Only Here'])
  })

  it("carries Rekordbox's cue points for songs MCO has, in time order with their colours", () => {
    const report = compareWithRekordbox(
      'x.xml',
      rb([
        rbTrack('1', `${C}/dub.aiff`, {
          cues: [
            { num: 1, type: 0, start: 40, color: [69, 172, 219] },
            { num: 0, type: 0, start: 12.5, color: [255, 55, 111] },
            { num: -1, type: 4, start: 60, end: 64, color: null },
          ],
        }),
      ]),
      loadMcoSide(db, C),
      exists
    )
    expect(report.cues).toEqual({
      count: 3,
      songs: 1,
      rows: [
        {
          trackId: ids.dub,
          song: 'Low Tide – Deep Water',
          marks: [
            { slot: 0, kind: 'hot', start: 12.5, color: '#ff376f' },
            { slot: 1, kind: 'hot', start: 40, color: '#45acdb' },
            { slot: -1, kind: 'loop', start: 60, end: 64, color: null },
          ],
        },
      ],
    })
  })

  it('compares playlists by their path, imported ones by where they came from', () => {
    const tracks = [rbTrack('1', `${C}/dub.aiff`), rbTrack('2', `${C}/jungle.aiff`), rbTrack('3', '/Volumes/USB/x.aiff')]
    const p = (name: string, paths: string[]) => ({ kind: 'playlist' as const, name, paths })
    // Imported earlier: Sets/Sunday with dub, jungle.
    applyRekordboxImport(db, [{ kind: 'folder', name: 'Sets', children: [p('Sunday', [`${C}/dub.aiff`, `${C}/jungle.aiff`])] }])
    // Made in MCO: one also in Rekordbox (same, by name), one only here.
    const same = createPlaylistNode(db, 'playlist', 'Warm-up', null)
    addTracksToPlaylist(db, same, [ids.jungle])
    createPlaylistNode(db, 'playlist', 'Mine', null)
    const report = compareWithRekordbox(
      'x.xml',
      rb(tracks, [
        // Sunday reordered in Rekordbox, with a stick song added.
        { kind: 'folder', name: 'Sets', children: [p('Sunday', [`${C}/jungle.aiff`, `${C}/dub.aiff`, '/Volumes/USB/x.aiff'])] },
        p('Warm-up', [`${C}/jungle.aiff`]),
        p('Kiosk', [`${C}/dub.aiff`]),
      ]),
      loadMcoSide(db, C),
      exists
    )
    const byName = Object.fromEntries(report.playlists.map((x) => [x.name, x]))
    expect(byName['Sets / Sunday']).toMatchObject({ kind: 'different', orderDiffers: true, notInCollection: 1, onlyRekordbox: [], onlyMco: [] })
    expect(byName['Warm-up'].kind).toBe('same')
    expect(byName['Kiosk']).toMatchObject({ kind: 'only-rekordbox', rekordboxSongs: 1 })
    expect(byName['Mine']).toMatchObject({ kind: 'only-mco', goneFromRekordbox: false })
    expect(report.playlists.map((x) => x.kind)).toEqual(['different', 'only-rekordbox', 'only-mco', 'same'])
  })
})
