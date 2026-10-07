import { describe, it, expect } from 'vitest'
import { computeStats, qualityVerdict } from './collectionStats'
import type { Genre, Track } from '../types'
import type { TrackTagIds } from './tagFilter'
import type { KeyNotation } from './harmonic'

function track(id: number, over: Partial<Track> = {}): Track {
  return {
    id,
    path: `/music/${id}.aiff`,
    filename: `${id}.aiff`,
    folder: '/music',
    format: 'aiff',
    size: 100,
    mtime: 0,
    birthtime: null,
    duration: 300,
    bitrate: null,
    title: `Track ${id}`,
    artist: null,
    album: null,
    genreTag: null,
    year: null,
    bpm: null,
    firstBeat: null,
    musicalKey: null,
    analyzedAt: null,
    gridStart: null,
    loudness: null,
    energy: null,
    playCount: 0,
    lastPlayedAt: null,
    cloudStatus: 'local',
    analysisStatus: 'done',
    analysisError: null,
    tagsRead: true,
    ...over,
  }
}

type Extra = { missing?: Track[]; tags?: Map<number, TrackTagIds>; genres?: Genre[]; notation?: KeyNotation }
const stats = (tracks: Track[], extra: Extra = {}) =>
  computeStats(tracks, extra.missing ?? [], extra.tags ?? new Map(), extra.genres ?? [], extra.notation ?? 'camelot')

describe('qualityVerdict', () => {
  it('is lossless for anything but a lossy format, and grades lossy by bitrate', () => {
    expect(qualityVerdict({ format: 'flac', bitrate: null })).toBe('lossless')
    expect(qualityVerdict({ format: 'MP3', bitrate: 320 })).toBe('lossy')
    expect(qualityVerdict({ format: 'mp3', bitrate: 128 })).toBe('low')
    expect(qualityVerdict({ format: 'm4a', bitrate: null })).toBe('unknown')
  })
})

describe('computeStats', () => {
  it('adds up the tiles, counting songs with no length', () => {
    const s = stats([track(1), track(2, { duration: null, size: 50 }), track(3, { duration: 0 })])
    expect(s).toMatchObject({ songs: 3, playtimeSeconds: 300, noLength: 2, sizeBytes: 250 })
  })

  it('counts the same artist in any case once, shown as most often written', () => {
    const s = stats([
      track(1, { artist: 'Mala' }),
      track(2, { artist: 'mala ' }),
      track(3, { artist: 'Mala' }),
      track(4, { artist: 'Coki' }),
      track(5, { artist: null }),
    ])
    expect(s.artists).toBe(2)
    expect(s.topArtists).toEqual([
      { label: 'Mala', count: 3 },
      { label: 'Coki', count: 1 },
    ])
  })

  it('bins tempo by 5 BPM with empty bins between, and takes the median', () => {
    const s = stats([track(1, { bpm: 70 }), track(2, { bpm: 84 }), track(3, { bpm: 140 }), track(4)])
    expect(s.bpmBins[0]).toEqual({ label: '70–74', count: 1 })
    expect(s.bpmBins.at(-1)).toEqual({ label: '140–144', count: 1 })
    expect(s.bpmBins).toHaveLength(15)
    expect(s).toMatchObject({ bpmMin: 70, bpmMax: 140, bpmMedian: 84, noBpm: 1 })
  })

  it('lists keys round the wheel in the chosen notation', () => {
    const tracks = [track(1, { musicalKey: 'C major' }), track(2, { musicalKey: 'A minor' }), track(3, { musicalKey: 'A minor' }), track(4)]
    expect(stats(tracks).keys).toEqual([
      { label: '8A', count: 2 },
      { label: '8B', count: 1 },
    ])
    expect(stats(tracks, { notation: 'musical' }).keys.map((k) => k.label)).toEqual(['Am', 'C'])
    expect(stats(tracks).noKey).toBe(1)
  })

  it('ranks genres by tagged songs and counts tagged songs', () => {
    const tags = new Map([
      [1, { trackId: 1, genreIds: [10, 11], subgenreIds: [] }],
      [2, { trackId: 2, genreIds: [10], subgenreIds: [] }],
    ])
    const genres = [
      { id: 10, name: 'Dub', color: null },
      { id: 11, name: 'Jungle', color: null },
    ]
    const s = stats([track(1), track(2), track(3)], { tags, genres })
    expect(s.topGenres).toEqual([
      { label: 'Dub', count: 2 },
      { label: 'Jungle', count: 1 },
    ])
    expect(s).toMatchObject({ genres: 2, tagged: 2 })
  })

  it('fills in empty years and months, and groups years by decade', () => {
    const s = stats([
      track(1, { year: 1998, birthtime: new Date(2024, 10, 5).getTime() }),
      track(2, { year: 2001, birthtime: new Date(2025, 1, 1).getTime() }),
      track(3),
    ])
    expect(s.years.map((y) => y.label)).toEqual(['1998', '1999', '2000', '2001'])
    expect(s.decades).toEqual([
      { label: '1990s', count: 1 },
      { label: '2000s', count: 1 },
    ])
    expect(s.addedPerMonth.map((m) => m.label)).toEqual(['2024-11', '2024-12', '2025-01', '2025-02'])
    expect(s).toMatchObject({ noYear: 1, noAddedDate: 1 })
  })

  it('counts quality verdicts, formats, missing and cloud-only files', () => {
    const s = stats(
      [track(1, { format: 'aif' }), track(2, { format: 'mp3', bitrate: 128, cloudStatus: 'cloud_only' }), track(3, { format: 'mp3', bitrate: 320 })],
      { missing: [track(9)] },
    )
    expect(s.quality).toEqual({ lossless: 1, lossy: 1, low: 1, unknown: 0 })
    expect(s.formats).toEqual([
      { label: 'MP3', count: 2 },
      { label: 'AIFF', count: 1 },
    ])
    expect(s).toMatchObject({ missing: 1, cloudOnly: 1 })
  })
})
