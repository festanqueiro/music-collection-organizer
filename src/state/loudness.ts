// The LUFS and Volume Score columns: each track's integrated loudness
// (EBU R128, from analysis) and how far it is from the rest of the
// collection — the gain in dB that would bring it to the collection's
// median loudness, like a DJ matching levels between tracks.

// The median of the analysed tracks' loudness, or null with none analysed.
export function medianLoudness(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b)
  if (known.length === 0) return null
  const mid = Math.floor(known.length / 2)
  const median = known.length % 2 ? known[mid] : (known[mid - 1] + known[mid]) / 2
  return Math.round(median * 10) / 10
}

// dB to add (positive: turn it up) to reach `target`, to 0.1 dB.
export function gainToMatch(loudness: number | null, target: number | null): number | null {
  if (loudness === null || target === null) return null
  const gain = Math.round((target - loudness) * 10) / 10
  return Object.is(gain, -0) ? 0 : gain
}

export function formatGain(gain: number): string {
  return `${gain > 0 ? '+' : gain < 0 ? '−' : '±'}${Math.abs(gain).toFixed(1)} dB`
}

export function formatLufs(loudness: number): string {
  return `${loudness < 0 ? '−' : ''}${Math.abs(loudness).toFixed(1)}`
}
