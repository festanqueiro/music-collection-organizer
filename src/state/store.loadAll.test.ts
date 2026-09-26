import { describe, it, expect, vi } from 'vitest'
import type { Track } from '../types'

// Same window.api stub approach as store.queue.test.ts — just the calls
// loadAll makes.
let tracks: Track[] = []
;(globalThis as unknown as { window: unknown }).window = {
  api: {
    getTracks: vi.fn(async () => tracks),
    getGenres: vi.fn(async () => []),
    getSubgenres: vi.fn(async () => []),
    getAllTagIds: vi.fn(async () => []),
  },
}

const { useCollectionStore } = await import('./store')

function track(id: number): Track {
  return {
    id,
    path: `/music/${id}.mp3`,
    filename: `${id}.mp3`,
    folder: '/music',
    format: 'mp3',
    size: 1,
    mtime: 0,
    birthtime: null,
    duration: 180,
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
    tagsRead: true,
  }
}

describe('loadAll', () => {
  it('keeps the checked-track selection, dropping only tracks that no longer exist', async () => {
    tracks = [track(1), track(2), track(3)]
    useCollectionStore.setState({ checkedTrackIds: new Set([1, 3]) })
    await useCollectionStore.getState().loadAll()
    expect([...useCollectionStore.getState().checkedTrackIds]).toEqual([1, 3])

    tracks = [track(1), track(2)]
    await useCollectionStore.getState().loadAll()
    expect([...useCollectionStore.getState().checkedTrackIds]).toEqual([1])
  })
})
