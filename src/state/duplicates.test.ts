import { describe, it, expect } from 'vitest'
import type { Track } from '../types'
import { findDuplicateGroups, normalizeFilename, normalizeText } from './duplicates'

let nextId = 1
function track(overrides: Partial<Track>): Track {
  const id = nextId++
  return {
    id,
    path: `/music/${id}.mp3`,
    filename: `${id}.mp3`,
    folder: '/music',
    format: 'mp3',
    size: 1000,
    mtime: 0,
    birthtime: null,
    duration: 200,
    bitrate: null,
    title: null,
    artist: null,
    album: null,
    genreTag: null,
    year: null,
    bpm: null,
    musicalKey: null,
    waveformPeaks: null,
    loudness: null,
    energy: null,
    playCount: 0,
    lastPlayedAt: null,
    cloudStatus: 'local',
    analysisStatus: 'done',
    ...overrides,
  }
}

const ids = (groups: Track[][]) => groups.map((g) => g.map((t) => t.id).sort((a, b) => a - b))

describe('normalizeText / normalizeFilename', () => {
  it('ignores case, accents, and punctuation but keeps version brackets', () => {
    expect(normalizeText('Café Dub (Original Mix)!')).toBe('cafe dub (original mix)')
    expect(normalizeText('Rock & Roll')).toBe('rock and roll')
  })

  it('drops leading track numbers and the extension', () => {
    expect(normalizeFilename('03 - King Tubby - Dub.mp3')).toBe('king tubby dub')
    expect(normalizeFilename('King Tubby - Dub.wav')).toBe('king tubby dub')
    expect(normalizeFilename('1999 Dub.wav')).toBe('1999 dub')
  })
})

describe('findDuplicateGroups', () => {
  it('groups the same title and artist within a second of each other', () => {
    const a = track({ title: 'Dub Fi Gwan', artist: 'King Tubby', duration: 200, format: 'wav', size: 5000 })
    const b = track({ title: 'dub fi gwan', artist: 'KING TUBBY', duration: 200.8, format: 'mp3', size: 900 })
    const other = track({ title: 'Something else', artist: 'King Tubby' })
    const groups = findDuplicateGroups([a, b, other])
    expect(ids(groups)).toEqual([[a.id, b.id]])
    // Biggest file first.
    expect(groups[0][0].id).toBe(a.id)
  })

  it('does not group when durations differ by more than a second', () => {
    const a = track({ title: 'Dub', artist: 'X', duration: 200 })
    const b = track({ title: 'Dub', artist: 'X', duration: 230 })
    expect(findDuplicateGroups([a, b])).toEqual([])
  })

  it('keeps different mixes apart', () => {
    const a = track({ title: 'Dub (Vocal Mix)', artist: 'X' })
    const b = track({ title: 'Dub (Instrumental)', artist: 'X' })
    expect(findDuplicateGroups([a, b])).toEqual([])
  })

  it('matches untagged files by filename', () => {
    const a = track({ filename: '01 - Roots Rock.wav' })
    const b = track({ filename: 'Roots Rock.mp3' })
    expect(ids(findDuplicateGroups([a, b]))).toEqual([[a.id, b.id]])
  })

  it('links transitively across the two keys', () => {
    const a = track({ title: 'Roots Rock', artist: 'Y', filename: 'rr-final.wav' })
    const b = track({ title: 'Roots Rock', artist: 'Y', filename: 'Roots Rock.mp3' })
    const c = track({ filename: 'Roots Rock.flac' })
    expect(ids(findDuplicateGroups([a, b, c]))).toEqual([[a.id, b.id, c.id]])
  })

  it('treats an unknown duration as matching', () => {
    const a = track({ title: 'Dub', artist: 'X', duration: null })
    const b = track({ title: 'Dub', artist: 'X', duration: 180 })
    expect(ids(findDuplicateGroups([a, b]))).toEqual([[a.id, b.id]])
  })
})
