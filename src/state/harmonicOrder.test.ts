import { describe, it, expect } from 'vitest'
import { harmonicChanges, keyChangeCost, orderByHarmonicMixing, orderOfKeys, orderingCost, type KeyedTrack } from './harmonicOrder'
import { areKeysCompatible, toCamelot } from './harmonic'

// Camelot code → the key name analysis stores.
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const ALL_KEYS = NAMES.flatMap((n) => [`${n} major`, `${n} minor`])
const keyOf = (code: string) => ALL_KEYS.find((k) => toCamelot(k)!.code === code)!
const track = (id: number, code: string | null, bpm: number | null = null): KeyedTrack => ({ id, musicalKey: code ? keyOf(code) : null, bpm })
const codes = (tracks: KeyedTrack[], order: number[]) => order.map((id) => toCamelot(tracks.find((t) => t.id === id)!.musicalKey)?.code ?? '—')
const cost = (tracks: KeyedTrack[], order: number[]) => {
  const keys = order.map((id) => toCamelot(tracks.find((t) => t.id === id)!.musicalKey)!)
  return keys.slice(1).reduce((sum, key, i) => sum + keyChangeCost(keys[i], key), 0)
}

describe('keyChangeCost', () => {
  it('is 1 or less exactly for the harmonic-mixing moves', () => {
    for (const a of ALL_KEYS) for (const b of ALL_KEYS) expect(keyChangeCost(toCamelot(a)!, toCamelot(b)!) <= 1).toBe(areKeysCompatible(a, b))
  })
  it('is the same both ways, and wraps round the wheel', () => {
    expect(keyChangeCost(toCamelot(keyOf('12A'))!, toCamelot(keyOf('1A'))!)).toBe(1)
    expect(keyChangeCost(toCamelot(keyOf('8A'))!, toCamelot(keyOf('3B'))!)).toBe(keyChangeCost(toCamelot(keyOf('3B'))!, toCamelot(keyOf('8A'))!))
  })
})

describe('orderByHarmonicMixing', () => {
  it('walks the wheel when the keys allow it, upwards', () => {
    const tracks = [track(1, '10A'), track(2, '8A'), track(3, '9A'), track(4, '7A')]
    expect(codes(tracks, orderByHarmonicMixing(tracks))).toEqual(['7A', '8A', '9A', '10A'])
  })

  it('makes as many changes in key as the keys allow', () => {
    // 8B hangs off 8A only, so one change can't be a harmonic move.
    const tracks = [track(1, '10A'), track(2, '8A'), track(3, '9A'), track(4, '7A'), track(5, '8B')]
    const order = orderByHarmonicMixing(tracks)
    expect(harmonicChanges(order.map((id) => tracks.find((t) => t.id === id)!))).toEqual({ inKey: 3, total: 4 })
    expect(cost(tracks, order)).toBe(6)
  })

  it('keeps every song, once', () => {
    const tracks = [track(5, '1A'), track(9, null), track(2, '6B'), track(7, '1A'), track(3, null), track(4, '12B')]
    expect([...orderByHarmonicMixing(tracks)].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 7, 9])
  })

  it('keeps songs in one key together, slowest first, then as they were', () => {
    const tracks = [track(1, '8A', 140), track(2, '9A', 128), track(3, '8A', 126), track(4, '8A', null), track(5, '8A', 126)]
    expect(orderByHarmonicMixing(tracks)).toEqual([3, 5, 1, 4, 2])
  })

  it('puts songs with no key last, in their order', () => {
    const tracks = [track(1, null), track(2, '4A'), track(3, null), track(4, '5A')]
    expect(orderByHarmonicMixing(tracks)).toEqual([2, 4, 1, 3])
  })

  it('gives the same order whatever order the songs came in', () => {
    const tracks = ['3A', '11B', '4A', '10B', '4B', '9A', '2A', '11A'].map((code, i) => track(i + 1, code, 120 + i))
    const shuffled = [5, 2, 7, 0, 3, 6, 1, 4].map((i) => tracks[i])
    expect(orderByHarmonicMixing(shuffled)).toEqual(orderByHarmonicMixing(tracks))
  })

  // Every order of seven keys, weighed one by one.
  it('finds the best order there is', () => {
    const tracks = ['1A', '8B', '3A', '9B', '2A', '8A', '5B'].map((code, i) => track(i + 1, code))
    const judged = (order: number[]) => {
      const keys = order.map((id) => toCamelot(tracks.find((t) => t.id === id)!.musicalKey)!)
      return keys.slice(1).reduce((sum, key, i) => sum + orderingCost(keys[i], key), 0)
    }
    let cheapest = Infinity
    const permute = (rest: number[], done: number[]) => {
      if (rest.length === 0) cheapest = Math.min(cheapest, judged(done))
      rest.forEach((id, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...done, id]))
    }
    permute(tracks.map((t) => t.id), [])
    expect(judged(orderByHarmonicMixing(tracks))).toBe(cheapest)
  })

  it('takes one more change in key over a smoother order with fewer', () => {
    // The smoothest order of these has 3 of 5 changes in key; 4 of 5 exists.
    const tracks = ['9A', '11B', '9B', '10B', '7B', '12B'].map((code, i) => track(i + 1, code))
    const order = orderByHarmonicMixing(tracks)
    expect(harmonicChanges(order.map((id) => tracks.find((t) => t.id === id)!))).toEqual({ inKey: 4, total: 5 })
  })

  // Past the keys every order is weighed for (18), the search is checked
  // against that exact answer — and below it too, where both can run.
  it('matches the exact answer with 13 to 19 keys', () => {
    const wheel = ALL_KEYS.map((key) => toCamelot(key)!)
    let seed = 99
    const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    for (const count of [13, 14, 16, 17, 17, 18, 19]) {
      const keys = [...wheel].sort(() => random() - 0.5).slice(0, count)
      const costs = keys.map((a) => keys.map((b) => orderingCost(a, b)))
      const total = (order: number[]) => order.slice(1).reduce((sum, key, i) => sum + costs[order[i]][key], 0)
      const searched = orderOfKeys(costs, 0)
      expect([...searched].sort((a, b) => a - b)).toEqual(keys.map((_, i) => i))
      expect(total(searched)).toBe(total(orderOfKeys(costs, 24)))
    }
  })

  it('orders all 24 keys with every change in key', () => {
    const tracks = ALL_KEYS.map((key, i) => ({ id: i + 1, musicalKey: key, bpm: null }))
    const order = orderByHarmonicMixing(tracks)
    expect(new Set(order).size).toBe(24)
    expect(harmonicChanges(order.map((id) => tracks[id - 1]))).toEqual({ inKey: 23, total: 23 })
  })

  it('copes with nothing, one song, and no keys at all', () => {
    expect(orderByHarmonicMixing([])).toEqual([])
    expect(orderByHarmonicMixing([track(1, '8A')])).toEqual([1])
    expect(orderByHarmonicMixing([track(2, null), track(1, null)])).toEqual([2, 1])
  })
})
