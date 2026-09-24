import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDatabase, type AppDatabase } from './db'
import { createGenre, createSubgenre, addGenresToTracks, addSubgenresToTracks } from './tags'
import { buildRekordboxXml, toRekordboxLocation, xmlAttr } from './rekordboxExport'

function insertTrack(db: AppDatabase, path: string, extra: Record<string, unknown> = {}): number {
  const row = {
    path,
    filename: path.split('/').pop()!,
    folder: '/music',
    format: path.split('.').pop()!.toLowerCase(),
    size: 1000,
    mtime: 0,
    birthtime: Date.UTC(2026, 0, 15),
    duration: 245.6,
    title: null,
    artist: null,
    bpm: null,
    musical_key: null,
    cloud_status: 'local',
    present: 1,
    ...extra,
  }
  const keys = Object.keys(row)
  return db
    .prepare(`INSERT INTO tracks (${keys.join(', ')}) VALUES (${keys.map((k) => '@' + k).join(', ')})`)
    .run(row as Record<string, string | number | null>).lastInsertRowid as number
}

describe('xmlAttr', () => {
  it('escapes markup and strips control characters', () => {
    expect(xmlAttr(`Tom & Jerry's "<Dub>"\u0001`)).toBe('Tom &amp; Jerry&apos;s &quot;&lt;Dub&gt;&quot;')
    expect(xmlAttr(null)).toBe('')
  })
})

describe('toRekordboxLocation', () => {
  it('percent-encodes each path segment', () => {
    expect(toRekordboxLocation('/Users/dj/My Music/Dub #1?.mp3')).toBe(
      'file://localhost/Users/dj/My%20Music/Dub%20%231%3F.mp3'
    )
  })
})

describe('buildRekordboxXml', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = openDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('exports present local tracks with their metadata', () => {
    insertTrack(db, '/music/a.mp3', {
      title: 'Roots & Culture',
      artist: 'King Tubby',
      bpm: 72.4,
      musical_key: 'A minor',
    })
    insertTrack(db, '/music/gone.wav', { present: 0 })
    insertTrack(db, '/music/cloud.flac', { cloud_status: 'cloud_only' })

    const { xml, trackCount } = buildRekordboxXml(db, '1.2.3')

    expect(trackCount).toBe(1)
    expect(xml).toContain('<COLLECTION Entries="1">')
    expect(xml).toContain('Name="Roots &amp; Culture"')
    expect(xml).toContain('Artist="King Tubby"')
    expect(xml).toContain('Kind="MP3 File"')
    expect(xml).toContain('AverageBpm="72.40"')
    expect(xml).toContain('Tonality="Am"')
    expect(xml).toContain('TotalTime="246"')
    expect(xml).toContain('DateAdded="2026-01-15"')
    expect(xml).toContain('Location="file://localhost/music/a.mp3"')
    expect(xml).not.toContain('gone.wav')
    expect(xml).not.toContain('cloud.flac')
    expect(xml).toContain('Version="1.2.3"')
  })

  it('falls back to the filename without extension when there is no title', () => {
    insertTrack(db, '/music/untitled track.wav')
    expect(buildRekordboxXml(db, '1').xml).toContain('Name="untitled track"')
  })

  it('turns genres into playlists and genres with sub-genres into folders', () => {
    const t1 = insertTrack(db, '/music/1.mp3')
    const t2 = insertTrack(db, '/music/2.mp3')
    const t3 = insertTrack(db, '/music/3.mp3')
    const dub = createGenre(db, 'Dub')
    const house = createGenre(db, 'House')
    const steppers = createSubgenre(db, 'Steppers', dub)
    addGenresToTracks(db, [t1, t2], [dub])
    addSubgenresToTracks(db, [t2], [steppers])
    addGenresToTracks(db, [t3], [house])

    const { xml, playlistCount } = buildRekordboxXml(db, '1')

    // Dub folder: "Dub (all)" + "Steppers"; House: plain playlist.
    expect(playlistCount).toBe(3)
    expect(xml).toContain('<NODE Type="0" Name="MCO" Count="2">')
    expect(xml).toContain('<NODE Type="0" Name="Dub" Count="2">')
    expect(xml).toMatch(/<NODE Name="Dub \(all\)" Type="1" KeyType="0" Entries="2">\s*<TRACK Key="1"\/>\s*<TRACK Key="2"\/>/)
    expect(xml).toMatch(/<NODE Name="Steppers" Type="1" KeyType="0" Entries="1">\s*<TRACK Key="2"\/>/)
    expect(xml).toMatch(/<NODE Name="House" Type="1" KeyType="0" Entries="1">\s*<TRACK Key="3"\/>/)
    // Tag names also go into Comments.
    expect(xml).toMatch(/TrackID="2"[^>]*Comments="Dub, Steppers"/)
  })

  it('leaves tracks that are not exported out of playlists', () => {
    const gone = insertTrack(db, '/music/gone.mp3', { present: 0 })
    const genre = createGenre(db, 'Dub')
    addGenresToTracks(db, [gone], [genre])
    expect(buildRekordboxXml(db, '1').xml).toContain('<NODE Name="Dub" Type="1" KeyType="0" Entries="0">')
  })
})
