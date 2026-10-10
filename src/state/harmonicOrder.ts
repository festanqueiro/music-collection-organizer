// Order by Harmonic Mixing: a playlist's songs put in the order whose key
// changes mix best. Pure — no store/DOM.
//
// Songs in the same key stay together, so the problem is the order of the
// keys present (24 at most): each change from one key to the next has a
// cost, and the order with the lowest total is the answer. With up to
// EXACT_KEYS different keys every order is weighed (a dynamic programme
// over the sets of keys); beyond that, the best of a nearest-key walk from
// every start, improved until no swap helps.
import { toCamelot, type CamelotKey } from './harmonic'

export interface KeyedTrack {
  id: number
  musicalKey: string | null
  bpm: number | null
}

// What a change of key costs, on the Camelot wheel. The first three are
// the moves areKeysCompatible allows; any order has the same number of
// changes, so the lowest total is also the one with the most of them.
export function keyChangeCost(a: CamelotKey, b: CamelotKey): number {
  const apart = Math.abs(a.number - b.number)
  const steps = Math.min(apart, 12 - apart)
  const sameLetter = a.letter === b.letter
  if (steps === 0) return sameLetter ? 0 : 1 // the same key; its relative major/minor
  if (steps === 1) return sameLetter ? 1 : 3 // a step round the wheel; a diagonal one
  if (steps === 2 && sameLetter) return 4 // two steps: a lift, not a blend
  return 8 // a clash
}

const EXACT_KEYS = 16

function pathCost(order: number[], cost: number[][]): number {
  let total = 0
  for (let i = 1; i < order.length; i++) total += cost[order[i - 1]][order[i]]
  return total
}

// Every order weighed: best[set of keys][last key] is the cheapest way to
// play exactly that set ending on that key.
function exactOrder(cost: number[][]): number[] {
  const n = cost.length
  const size = 1 << n
  const best = new Uint16Array(size * n).fill(0xffff)
  const from = new Int8Array(size * n).fill(-1)
  for (let i = 0; i < n; i++) best[(1 << i) * n + i] = 0
  for (let set = 1; set < size; set++) {
    for (let last = 0; last < n; last++) {
      const soFar = best[set * n + last]
      if (soFar === 0xffff) continue
      for (let next = 0; next < n; next++) {
        if (set & (1 << next)) continue
        const at = (set | (1 << next)) * n + next
        const total = soFar + cost[last][next]
        if (total < best[at]) {
          best[at] = total
          from[at] = last
        }
      }
    }
  }
  let last = 0
  for (let i = 1; i < n; i++) if (best[(size - 1) * n + i] < best[(size - 1) * n + last]) last = i
  const order: number[] = []
  for (let set = size - 1; last !== -1; ) {
    order.unshift(last)
    const previous = from[set * n + last]
    set &= ~(1 << last)
    last = previous
  }
  return order
}

// For more keys than can be weighed exhaustively: walk to the nearest key
// from each start, then keep reversing stretches and moving single keys
// while that lowers the total.
function improvedOrder(cost: number[][]): number[] {
  const n = cost.length
  let best: number[] = []
  let bestCost = Infinity
  for (let start = 0; start < n; start++) {
    const order = [start]
    const left = new Set(Array.from({ length: n }, (_, i) => i).filter((i) => i !== start))
    while (left.size > 0) {
      const last = order[order.length - 1]
      let nearest = -1
      for (const i of left) if (nearest === -1 || cost[last][i] < cost[last][nearest]) nearest = i
      order.push(nearest)
      left.delete(nearest)
    }
    let current = order
    let currentCost = pathCost(current, cost)
    for (let improved = true; improved; ) {
      improved = false
      for (let i = 0; i < n && !improved; i++) {
        for (let j = i + 1; j < n && !improved; j++) {
          const reversed = [...current.slice(0, i), ...current.slice(i, j + 1).reverse(), ...current.slice(j + 1)]
          const without = current.filter((_, at) => at !== i)
          const moved = [...without.slice(0, j), current[i], ...without.slice(j)]
          for (const candidate of [reversed, moved]) {
            const candidateCost = pathCost(candidate, cost)
            if (candidateCost < currentCost) {
              current = candidate
              currentCost = candidateCost
              improved = true
              break
            }
          }
        }
      }
    }
    if (currentCost < bestCost) {
      best = current
      bestCost = currentCost
    }
  }
  return best
}

// The ids in harmonic order. Songs in one key go by tempo, slowest first
// (then as they were); songs with no key keep their order, at the end.
// Of an order and its reverse — the same changes — the one that goes up
// the wheel more than down is kept.
export function orderByHarmonicMixing(tracks: KeyedTrack[]): number[] {
  const groups = new Map<string, { key: CamelotKey; tracks: KeyedTrack[] }>()
  const unkeyed: KeyedTrack[] = []
  for (const track of tracks) {
    const key = toCamelot(track.musicalKey)
    if (!key) {
      unkeyed.push(track)
      continue
    }
    const group = groups.get(key.code)
    if (group) group.tracks.push(track)
    else groups.set(key.code, { key, tracks: [track] })
  }
  // Round the wheel, minor before major: the same start whatever order the songs came in.
  const keys = [...groups.values()].sort((a, b) => a.key.number - b.key.number || a.key.letter.localeCompare(b.key.letter))
  const cost = keys.map((a) => keys.map((b) => keyChangeCost(a.key, b.key)))
  let order = keys.length <= 1 ? keys.map((_, i) => i) : keys.length <= EXACT_KEYS ? exactOrder(cost) : improvedOrder(cost)
  let up = 0
  for (let i = 1; i < order.length; i++) {
    const step = (keys[order[i]].key.number - keys[order[i - 1]].key.number + 12) % 12
    if (step === 1) up++
    if (step === 11) up--
  }
  if (up < 0) order = [...order].reverse()
  const position = new Map(tracks.map((t, i) => [t.id, i]))
  const byTempo = (a: KeyedTrack, b: KeyedTrack) => (a.bpm ?? Infinity) - (b.bpm ?? Infinity) || position.get(a.id)! - position.get(b.id)!
  return [...order.flatMap((i) => [...keys[i].tracks].sort(byTempo)), ...unkeyed].map((t) => t.id)
}

// How many of an order's key changes are harmonic-mixing moves, of those
// between two songs that both have a key.
export function harmonicChanges(tracks: KeyedTrack[]): { inKey: number; total: number } {
  let inKey = 0
  let total = 0
  for (let i = 1; i < tracks.length; i++) {
    const a = toCamelot(tracks[i - 1].musicalKey)
    const b = toCamelot(tracks[i].musicalKey)
    if (!a || !b) continue
    total++
    if (keyChangeCost(a, b) <= 1) inKey++
  }
  return { inKey, total }
}
