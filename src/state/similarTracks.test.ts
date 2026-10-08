import { describe, it, expect } from 'vitest'
import { findSimilarTracks } from './similarTracks'
import type { TrackTagIds } from './tagFilter'

const t = (id: number, musicalKey: string | null, bpm: number | null = null, title = `T${id}`) => ({ id, musicalKey, bpm, title, filename: `${id}.wav` })
const tags = (rows: [number, number[], number[]][]): Map<number, TrackTagIds> =>
  new Map(rows.map(([trackId, genreIds, subgenreIds]) => [trackId, { trackId, genreIds, subgenreIds }]))
const ids = (list: { track: { id: number } }[]) => list.map((s) => s.track.id)

describe('findSimilarTracks', () => {
  it('finds the same key, a step round the wheel and the relative major/minor — nothing else', () => {
    const selected = t(1, 'A minor') // 8A
    const others = [t(2, 'A minor'), t(3, 'E minor'), t(4, 'D minor'), t(5, 'C major'), t(6, 'B minor'), t(7, 'G major'), t(8, null)]
    const found = findSimilarTracks(selected, [selected, ...others], new Map())
    expect(ids(found).sort()).toEqual([2, 3, 4, 5])
    expect(found[0].track.id).toBe(2)
    expect(found[0].key).toBe('same')
    expect(found.find((s) => s.track.id === 5)?.key).toBe('compatible')
  })

  it('finds tracks sharing a Tag or Subtag, a Subtag counting for more', () => {
    const tracks = [t(1, null), t(2, null), t(3, null), t(4, null)]
    const found = findSimilarTracks(tracks[0], tracks, tags([[1, [10], [20]], [2, [10], []], [3, [10], [20]], [4, [11], []]]))
    expect(ids(found)).toEqual([3, 2])
    expect(found[0].sharedSubgenreIds).toEqual([20])
    expect(found[1].sharedGenreIds).toEqual([10])
  })

  it('ranks key and tags together, then by the closer tempo (half time counts)', () => {
    const selected = t(1, 'A minor', 140)
    const tracks = [selected, t(2, 'A minor', 120), t(3, 'A minor', 70), t(4, 'E minor', 141), t(5, 'F major', 140)]
    const found = findSimilarTracks(selected, tracks, tags([[1, [10], []], [4, [10], []], [5, [10], []]]))
    // 4: compatible key + tag + tempo; 3: same key + tempo; then 5 (tag +
    // tempo) and 2 (same key) level, 5 at the closer tempo.
    expect(ids(found)).toEqual([4, 3, 5, 2])
    expect(found[0].bpmMixes).toBe(true)
  })

  it('can look at the key only, or the tags only', () => {
    const tracks = [t(1, 'A minor'), t(2, 'A minor'), t(3, 'F major')]
    const tagged = tags([[1, [10], []], [3, [10], []]])
    expect(ids(findSimilarTracks(tracks[0], tracks, tagged, { byKey: true, byTags: false }))).toEqual([2])
    expect(ids(findSimilarTracks(tracks[0], tracks, tagged, { byKey: false, byTags: true }))).toEqual([3])
    expect(findSimilarTracks(tracks[0], tracks, tagged, { byKey: false, byTags: false })).toEqual([])
  })

  it('has nothing to go on for a track with no key and no tags', () => {
    expect(findSimilarTracks(t(1, null), [t(1, null), t(2, 'A minor')], new Map())).toEqual([])
  })

  it('can count a tempo that mixes on its own (within 6 %, half/double time), closest first', () => {
    const selected = t(1, 'A minor', 140)
    const tracks = [selected, t(2, null, 146), t(3, null, 70), t(4, null, 120), t(5, null, null), t(6, 'A minor', 100)]
    expect(ids(findSimilarTracks(selected, tracks, new Map(), { byKey: false, byTags: false, byBpm: true }))).toEqual([3, 2])
    // With the key too: the key match first, the tempo-only ones after.
    expect(ids(findSimilarTracks(selected, tracks, new Map(), { byKey: true, byTags: false, byBpm: true }))).toEqual([6, 3, 2])
    // Off, a tempo alone isn't enough.
    expect(ids(findSimilarTracks(selected, tracks, new Map(), { byKey: true, byTags: false }))).toEqual([6])
  })

  it('has no tempo to go on for a track without a BPM', () => {
    const tracks = [t(1, null, null), t(2, null, 140)]
    expect(findSimilarTracks(tracks[0], tracks, new Map(), { byKey: true, byTags: true, byBpm: true })).toEqual([])
  })
})
