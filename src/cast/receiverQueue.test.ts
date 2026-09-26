import { describe, it, expect } from 'vitest'
import { bpmChange, buildReceiverQueue, downsamplePeaks } from './receiverQueue'
import type { Track } from '../types'

function track(id: number, over: Partial<Track> = {}): Track {
  return {
    id,
    path: `/music/${id}.mp3`,
    filename: `${id}.mp3`,
    folder: '/music',
    format: 'mp3',
    size: 1,
    mtime: 0,
    birthtime: null,
    duration: 300,
    bitrate: 320,
    title: `Track ${id}`,
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
    ...over,
  }
}

const base = { genres: [], subgenres: [], trackTags: new Map(), keyNotation: 'camelot' as const }

describe('buildReceiverQueue', () => {
  it('describes the head as current and summarises the rest of the queue', () => {
    const tracks = [track(1), track(2, { duration: 200 }), track(3, { duration: null }), track(4, { duration: 100 })]
    const message = buildReceiverQueue({ ...base, tracks, playlist: [1, 2, 3, 4] })
    if (message.type !== 'queue') throw new Error('not a queue message')
    expect(message.current?.trackId).toBe(1)
    expect(message.upNext.map((t) => t.trackId)).toEqual([2, 3, 4])
    expect(message.queuedCount).toBe(3)
    expect(message.queuedDuration).toBe(300)
  })

  it('resolves tags, formats the key and falls back to the filename for a missing title', () => {
    const tracks = [track(1, { title: null, filename: 'dub plate.flac', musicalKey: 'A minor', birthtime: 123 })]
    const message = buildReceiverQueue({
      ...base,
      tracks,
      playlist: [1],
      genres: [{ id: 5, name: 'Dub', color: '#ff0000' }],
      subgenres: [{ id: 9, name: 'Steppers', genreId: 5 }],
      trackTags: new Map([[1, { trackId: 1, genreIds: [5], subgenreIds: [9] }]]),
    })
    if (message.type !== 'queue') throw new Error('not a queue message')
    expect(message.current).toMatchObject({
      title: 'dub plate',
      key: '8A',
      addedAt: 123,
      folder: 'music',
      genres: [{ name: 'Dub', color: '#ff0000' }],
      subgenres: ['Steppers'],
    })
  })

  it('marks whether each upcoming track mixes with the one before it', () => {
    const tracks = [
      track(1, { musicalKey: 'A minor', bpm: 140 }),
      track(2, { musicalKey: 'E minor', bpm: 70 }),
      track(3, { musicalKey: 'F# major', bpm: 100 }),
    ]
    const message = buildReceiverQueue({ ...base, tracks, playlist: [1, 2, 3] })
    if (message.type !== 'queue') throw new Error('not a queue message')
    expect(message.upNext.map((t) => [t.keyMixes, t.bpmMixes])).toEqual([
      [true, true],
      [false, false],
    ])
  })

  it('sends an empty queue when nothing is loaded', () => {
    const message = buildReceiverQueue({ ...base, tracks: [], playlist: [] })
    expect(message).toMatchObject({ current: null, upNext: [], queuedCount: 0, queuedDuration: 0 })
  })
})

describe('bpmChange', () => {
  it('reads the tempo move from one track to the next', () => {
    expect(bpmChange(140, 142.4)).toBe('+2')
    expect(bpmChange(140, 137)).toBe('−3')
    expect(bpmChange(140, 140.2)).toBe('±0')
    expect(bpmChange(140, 70)).toBe('half-time')
    expect(bpmChange(70, 141)).toBe('double-time')
    expect(bpmChange(null, 120)).toBeNull()
  })
})

describe('downsamplePeaks', () => {
  it('keeps the loudest peak of each bucket', () => {
    expect(downsamplePeaks([0.1, 0.9, 0.2, 0.3], 2)).toEqual([0.9, 0.3])
    expect(downsamplePeaks([0.5], 10)).toEqual([0.5])
  })
})
