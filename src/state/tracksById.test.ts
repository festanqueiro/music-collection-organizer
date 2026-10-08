import { describe, it, expect } from 'vitest'
import { tracksById } from './tracksById'
import type { Track } from '../types'

const track = (id: number) => ({ id, title: `T${id}` }) as unknown as Track

describe('tracksById', () => {
  it('finds a track by its id, and nothing for an id that is not there', () => {
    const tracks = [track(3), track(1), track(2)]
    expect(tracksById(tracks).get(1)).toBe(tracks[1])
    expect(tracksById(tracks).get(9)).toBeUndefined()
    expect(tracksById([]).size).toBe(0)
  })

  it('builds the map once per track list, and again for a new list', () => {
    const tracks = [track(1)]
    expect(tracksById(tracks)).toBe(tracksById(tracks))
    const next = [...tracks, track(2)]
    expect(tracksById(next)).not.toBe(tracksById(tracks))
    expect(tracksById(next).get(2)).toBe(next[1])
  })
})
