// Order by Harmonic Mixing: a playlist's songs put in the order whose key
// changes mix best. Pure — no store/DOM.
//
// Songs in the same key stay together, so the problem is the order of the
// keys present (24 at most). The order kept is the one with the most
// harmonic changes and, among those, the softest other changes
// (orderingCost). With up to EXACT_KEYS different keys every order is
// weighed (a dynamic programme over the sets of keys); beyond that, the
// best of a nearest-key walk from every start, improved until no reversal
// or move of a stretch helps.
import { toCamelot, type CamelotKey } from './harmonic'

export interface KeyedTrack {
  id: number
  musicalKey: string | null
  bpm: number | null
}

// How rough a change of key is, on the Camelot wheel. The first three are
// the moves areKeysCompatible allows (1 or less).
export function keyChangeCost(a: CamelotKey, b: CamelotKey): number {
  const apart = Math.abs(a.number - b.number)
  const steps = Math.min(apart, 12 - apart)
  const sameLetter = a.letter === b.letter
  if (steps === 0) return sameLetter ? 0 : 1 // the same key; its relative major/minor
  if (steps === 1) return sameLetter ? 1 : 3 // a step round the wheel; a diagonal one
  if (steps === 2 && sameLetter) return 4 // two steps: a lift, not a blend
  return 8 // a clash
}

// What an order is judged on: a change that isn't a harmonic move weighs
// more than every harmonic one put together (23 changes at most), so the
// lowest total has the most harmonic changes first, and only then the
// smoothest of the others. Roughness alone doesn't give that: one clash
// (8) can be cheaper than two diagonal steps (3 + 3) and leave one more
// change in key.
const NOT_HARMONIC = 100
export function orderingCost(a: CamelotKey, b: CamelotKey): number {
  const roughness = keyChangeCost(a, b)
  return roughness <= 1 ? roughness : NOT_HARMONIC + roughness
}

const EXACT_KEYS = 18

function pathCost(order: number[], cost: number[][]): number {
  let total = 0
  for (let i = 1; i < order.length; i++) total += cost[order[i - 1]][order[i]]
  return total
}

// Every order weighed: best[set of keys][last key] is the cheapest way to
// play exactly that set ending on that key. Flat arrays and bit tricks:
// with 18 keys this is 4.7 million entries, a tenth of a second.
function exactOrder(cost: number[][]): number[] {
  const n = cost.length
  const size = 1 << n
  const flat = new Uint16Array(n * n)
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) flat[i * n + j] = cost[i][j]
  const best = new Uint16Array(size * n).fill(0xffff)
  const from = new Int8Array(size * n).fill(-1)
  for (let i = 0; i < n; i++) best[(1 << i) * n + i] = 0
  const all = size - 1
  for (let set = 1; set < all; set++) {
    const row = set * n
    for (let lastBits = set; lastBits !== 0; lastBits &= lastBits - 1) {
      const last = 31 - Math.clz32(lastBits & -lastBits)
      const soFar = best[row + last]
      if (soFar === 0xffff) continue
      const costs = last * n
      for (let nextBits = all & ~set; nextBits !== 0; nextBits &= nextBits - 1) {
        const bit = nextBits & -nextBits
        const next = 31 - Math.clz32(bit)
        const at = (set | bit) * n + next
        const total = soFar + flat[costs + next]
        if (total < best[at]) {
          best[at] = total
          from[at] = last
        }
      }
    }
  }
  let last = 0
  for (let i = 1; i < n; i++) if (best[all * n + i] < best[all * n + last]) last = i
  const order: number[] = []
  for (let set = all; last !== -1; ) {
    order.unshift(last)
    const previous = from[set * n + last]
    set &= ~(1 << last)
    last = previous
  }
  return order
}

// An order with the fewest changes that aren't harmonic moves, found by
// walking the harmonic moves between the keys and allowing 0, then 1, then
// 2… other changes ("jumps"), the first number that works being the least.
// Each key has three harmonic neighbours at most, so the walks are few;
// dead ends are remembered. null if it takes more than `SEARCH_LIMIT` steps.
const SEARCH_LIMIT = 3_000_000

function fewestJumpsOrder(cost: number[][]): number[] | null {
  const n = cost.length
  const near = cost.map((row, i) => row.map((c, j) => (j !== i && c < NOT_HARMONIC ? j : -1)).filter((j) => j !== -1))
  const all = n === 32 ? -1 : (1 << n) - 1
  let steps = 0
  for (let jumps = 0; jumps < n; jumps++) {
    const dead = new Set<number>()
    const path: number[] = []
    const walk = (at: number, seen: number, left: number): boolean => {
      path.push(at)
      if (seen === all) return true
      if (++steps > SEARCH_LIMIT) return false
      const state = (seen * 32 + at) * 32 + left
      if (!dead.has(state)) {
        for (const next of near[at]) if (!(seen & (1 << next)) && walk(next, seen | (1 << next), left)) return true
        if (left > 0) {
          for (let next = 0; next < n; next++) {
            if (seen & (1 << next) || cost[at][next] < NOT_HARMONIC) continue
            if (walk(next, seen | (1 << next), left - 1)) return true
          }
        }
        if (steps > SEARCH_LIMIT) return false
        dead.add(state)
      }
      path.pop()
      return false
    }
    for (let start = 0; start < n; start++) {
      path.length = 0
      if (walk(start, 1 << start, jumps)) return [...path]
      if (steps > SEARCH_LIMIT) return null
    }
  }
  return null
}

// For more keys than can be weighed exhaustively: walk to the nearest key
// from each start, then keep reversing stretches, and moving stretches of
// one to three keys anywhere (either way round), while that lowers the total.
const LONGEST_MOVED = 3

function neighbours(order: number[]): number[][] {
  const n = order.length
  const out: number[][] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) out.push([...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)])
    for (let length = 1; length <= LONGEST_MOVED && i + length <= n; length++) {
      const stretch = order.slice(i, i + length)
      const rest = [...order.slice(0, i), ...order.slice(i + length)]
      for (let at = 0; at <= rest.length; at++) {
        if (at === i) continue
        out.push([...rest.slice(0, at), ...stretch, ...rest.slice(at)])
        if (length > 1) out.push([...rest.slice(0, at), ...[...stretch].reverse(), ...rest.slice(at)])
      }
    }
  }
  return out
}

function settle(order: number[], cost: number[][]): { order: number[]; cost: number } {
  let current = order
  let currentCost = pathCost(current, cost)
  for (let improved = true; improved; ) {
    improved = false
    for (const candidate of neighbours(current)) {
      const candidateCost = pathCost(candidate, cost)
      if (candidateCost < currentCost) {
        current = candidate
        currentCost = candidateCost
        improved = true
        break
      }
    }
  }
  return { order: current, cost: currentCost }
}

// Rounds of shaking the best order found and settling it again, which gets
// out of the orders no single reversal or move improves.
const SHAKES = 150

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
    const settled = settle(order, cost)
    if (settled.cost < bestCost) {
      best = settled.order
      bestCost = settled.cost
    }
  }
  // The order with the fewest changes out of key, its other changes then
  // softened: with it the count of harmonic changes is the most there can be.
  const fewest = fewestJumpsOrder(cost)
  if (fewest) {
    const settled = settle(fewest, cost)
    if (settled.cost < bestCost) {
      best = settled.order
      bestCost = settled.cost
    }
  }
  // The same shakes every time (a fixed seed), so the same playlist always
  // comes out in the same order.
  let seed = 12345
  const random = (below: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed % below
  }
  for (let shake = 0; shake < SHAKES; shake++) {
    // Cut in four and swap the two middle pieces: a change no reversal or
    // short move undoes in one go.
    const cuts = [1 + random(n - 1), 1 + random(n - 1), 1 + random(n - 1)].sort((x, y) => x - y)
    const shaken = [...best.slice(0, cuts[0]), ...best.slice(cuts[1], cuts[2]), ...best.slice(cuts[0], cuts[1]), ...best.slice(cuts[2])]
    const settled = settle(shaken, cost)
    if (settled.cost < bestCost) {
      best = settled.order
      bestCost = settled.cost
    }
  }
  return best
}

// The cheapest order of the keys (indexes into `cost`), or close to it
// past EXACT_KEYS. `exactUpTo` is for tests, which weigh the heuristic
// against the exact answer.
export function orderOfKeys(cost: number[][], exactUpTo = EXACT_KEYS): number[] {
  if (cost.length <= 1) return cost.map((_, i) => i)
  return cost.length <= exactUpTo ? exactOrder(cost) : improvedOrder(cost)
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
  const cost = keys.map((a) => keys.map((b) => orderingCost(a.key, b.key)))
  let order = orderOfKeys(cost)
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
