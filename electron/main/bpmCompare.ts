// MCO's tempos against Rekordbox's, song by song (npm run bpm:compare,
// docs/research/bpm-accuracy.md): how often the analysis is right, a
// little out, or out by a known ratio — half, double, two thirds — so the
// rules in analysis/tempoRefine.ts can be judged on a whole collection and
// the tracks to fix found in one go.

export type BpmVerdict = 'same' | 'close' | 'two-thirds' | 'half' | 'double' | 'three-halves' | 'other'

export interface BpmComparison {
  path: string
  mco: number
  rekordbox: number
  verdict: BpmVerdict
}

// The same tempo within 0.05 BPM (Rekordbox keeps two decimals); close
// within 1 %; a ratio within 2 % of it.
export function bpmVerdict(mco: number, rekordbox: number): BpmVerdict {
  if (Math.abs(mco - rekordbox) < 0.05) return 'same'
  const ratio = mco / rekordbox
  const near = (target: number, tolerance: number) => Math.abs(ratio / target - 1) < tolerance
  if (near(1, 0.01)) return 'close'
  if (near(2 / 3, 0.02)) return 'two-thirds'
  if (near(1 / 2, 0.02)) return 'half'
  if (near(2, 0.02)) return 'double'
  if (near(3 / 2, 0.02)) return 'three-halves'
  return 'other'
}

// Paths are compared as Rekordbox's XML and MCO both know them: NFC, and
// then without regard to case.
const pathKey = (path: string) => path.normalize('NFC').toLowerCase()

export function compareBpms(
  mco: { path: string; bpm: number | null }[],
  rekordbox: { path: string; bpm: number | null }[]
): { compared: BpmComparison[]; counts: Record<BpmVerdict, number>; onlyMco: number; onlyRekordbox: number } {
  const theirs = new Map<string, number>()
  for (const t of rekordbox) if (t.bpm && t.bpm > 0) theirs.set(pathKey(t.path), t.bpm)
  const counts: Record<BpmVerdict, number> = { same: 0, close: 0, 'two-thirds': 0, half: 0, double: 0, 'three-halves': 0, other: 0 }
  const compared: BpmComparison[] = []
  const seen = new Set<string>()
  let onlyMco = 0
  for (const t of mco) {
    if (!t.bpm || !(t.bpm > 0)) continue
    const key = pathKey(t.path)
    const rb = theirs.get(key)
    if (rb === undefined) {
      onlyMco++
      continue
    }
    seen.add(key)
    const verdict = bpmVerdict(t.bpm, rb)
    counts[verdict]++
    compared.push({ path: t.path, mco: t.bpm, rekordbox: rb, verdict })
  }
  return { compared, counts, onlyMco, onlyRekordbox: [...theirs.keys()].filter((key) => !seen.has(key)).length }
}
