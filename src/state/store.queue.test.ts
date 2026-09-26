import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Track } from '../types'

// store.ts is written for the renderer, where `window.api` (the preload
// bridge) always exists — stub just the analysis call the queue path
// makes, before the module (which builds its zustand store at import
// time) loads.
const analyzeCollection = vi.fn().mockResolvedValue(undefined)
;(globalThis as unknown as { window: unknown }).window = { api: { analyzeCollection } }

const { useCollectionStore } = await import('./store')

function track(id: number, overrides: Partial<Track> = {}): Track {
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
    // Analysed since loudness/energy were added.
    loudness: -9,
    energy: 6,
    playCount: 0,
    lastPlayedAt: null,
    cloudStatus: 'local',
    analysisStatus: 'done',
    ...overrides,
  }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe('requestAddManyToQueue / resolveQueueRequest', () => {
  beforeEach(() => {
    analyzeCollection.mockClear()
    useCollectionStore.setState({ playlist: [], queueRequest: null, modalOpen: false, tracks: [] })
  })

  it('queues directly (no dialog) when everything is analysed and the batch is small', () => {
    useCollectionStore.setState({ tracks: [track(1), track(2)] })
    useCollectionStore.getState().requestAddManyToQueue([1, 2])
    const state = useCollectionStore.getState()
    expect(state.queueRequest).toBeNull()
    expect(state.playlist).toEqual([1, 2])
    expect(analyzeCollection).not.toHaveBeenCalled()
  })

  it('re-analyses queued tracks analysed before energy existed, without asking', () => {
    useCollectionStore.setState({ tracks: [track(1, { energy: null, loudness: null }), track(2)] })
    useCollectionStore.getState().requestAddManyToQueue([1, 2])
    expect(useCollectionStore.getState().queueRequest).toBeNull()
    expect(analyzeCollection).toHaveBeenCalledWith([1])
  })

  it('asks when any track still needs analysis, counting only local pending/error tracks', () => {
    useCollectionStore.setState({
      tracks: [
        track(1, { analysisStatus: 'pending' }),
        track(2, { analysisStatus: 'error' }),
        track(3),
        track(4, { analysisStatus: 'pending', cloudStatus: 'cloud_only' }),
      ],
    })
    useCollectionStore.getState().requestAddManyToQueue([1, 2, 3, 4])
    const state = useCollectionStore.getState()
    expect(state.queueRequest).toEqual({ trackIds: [1, 2, 3, 4], unanalysedCount: 2 })
    expect(state.modalOpen).toBe(true)
    expect(state.playlist).toEqual([])
  })

  it('asks for a large batch even when everything is analysed', () => {
    useCollectionStore.setState({ tracks: range(51).map((id) => track(id)) })
    useCollectionStore.getState().requestAddManyToQueue(range(51))
    expect(useCollectionStore.getState().queueRequest).toEqual({ trackIds: range(51), unanalysedCount: 0 })
  })

  it('"analyse" queues and starts analysing the tracks that need it', () => {
    useCollectionStore.setState({ tracks: [track(1, { analysisStatus: 'pending' }), track(2)] })
    useCollectionStore.getState().requestAddManyToQueue([1, 2])
    useCollectionStore.getState().resolveQueueRequest('analyse')
    const state = useCollectionStore.getState()
    expect(state.playlist).toEqual([1, 2])
    expect(state.queueRequest).toBeNull()
    expect(state.modalOpen).toBe(false)
    expect(analyzeCollection).toHaveBeenCalledWith([1])
  })

  it('"queue-only" queues without analysing', () => {
    useCollectionStore.setState({ tracks: [track(1, { analysisStatus: 'pending' })] })
    useCollectionStore.getState().requestAddManyToQueue([1])
    useCollectionStore.getState().resolveQueueRequest('queue-only')
    expect(useCollectionStore.getState().playlist).toEqual([1])
    expect(analyzeCollection).not.toHaveBeenCalled()
  })

  it('"cancel" leaves the queue untouched', () => {
    useCollectionStore.setState({ tracks: [track(1, { analysisStatus: 'pending' })] })
    useCollectionStore.getState().requestAddManyToQueue([1])
    useCollectionStore.getState().resolveQueueRequest('cancel')
    const state = useCollectionStore.getState()
    expect(state.playlist).toEqual([])
    expect(state.queueRequest).toBeNull()
    expect(state.modalOpen).toBe(false)
    expect(analyzeCollection).not.toHaveBeenCalled()
  })
})
