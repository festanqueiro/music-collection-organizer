// The Stats view's numbers (docs/features/stats.md): counts, quality,
// tempo, keys, top lists, years and when songs were added, for a set of
// tracks. Pure — no store/DOM — so it's unit-testable.
import type { Genre, Track } from '../types'
import type { TrackTagIds } from './tagFilter'
import { formatKey, keySortValue, type KeyNotation } from './harmonic'

// Lossy formats, as in the table's Bitrate column; anything else (WAV,
// AIFF, FLAC…) is lossless. Lossy files below LOW_BITRATE_KBPS are flagged —
// 192 kbps is the usual floor for playing out on a club system.
export const LOSSY_FORMATS = new Set(['mp3', 'm4a', 'aac', 'ogg', 'opus'])
export const LOW_BITRATE_KBPS = 192

// lossless; lossy at LOW_BITRATE_KBPS or more; lossy below it; lossy with
// no bitrate yet (it comes from analysis).
export type QualityVerdict = 'lossless' | 'lossy' | 'low' | 'unknown'

export function qualityVerdict(track: Pick<Track, 'format' | 'bitrate'>): QualityVerdict {
  if (!LOSSY_FORMATS.has(track.format.toLowerCase())) return 'lossless'
  if (!track.bitrate) return 'unknown'
  return track.bitrate < LOW_BITRATE_KBPS ? 'low' : 'lossy'
}

export interface Count {
  label: string
  count: number
}

export interface CollectionStats {
  songs: number
  playtimeSeconds: number
  noLength: number
  sizeBytes: number
  artists: number
  albums: number
  genres: number
  quality: Record<QualityVerdict, number>
  formats: Count[]
  // 5-BPM bins from the slowest to the fastest, empty ones included.
  bpmBins: Count[]
  bpmMin: number | null
  bpmMax: number | null
  bpmMedian: number | null
  noBpm: number
  // Round the Camelot wheel, in the chosen notation.
  keys: Count[]
  noKey: number
  topGenres: Count[]
  topArtists: Count[]
  // Every year from the first to the last, empty ones included.
  years: Count[]
  decades: Count[]
  noYear: number
  // "YYYY-MM", every month from the first to the last.
  addedPerMonth: Count[]
  noAddedDate: number
  analysed: number
  tagged: number
  missing: number
  cloudOnly: number
}

const TOP = 10
const BPM_BIN = 5

// The same name in any case (and spacing) counts once, shown as it's most
// often written.
function countNames(names: (string | null)[]): Count[] {
  const groups = new Map<string, Map<string, number>>()
  for (const raw of names) {
    const name = raw?.trim().replace(/\s+/g, ' ')
    if (!name) continue
    const key = name.toLocaleLowerCase()
    const spellings = groups.get(key) ?? new Map<string, number>()
    spellings.set(name, (spellings.get(name) ?? 0) + 1)
    groups.set(key, spellings)
  }
  return [...groups.values()].map((spellings) => {
    let label = ''
    let best = -1
    let count = 0
    for (const [spelling, n] of spellings) {
      count += n
      if (n > best) [label, best] = [spelling, n]
    }
    return { label, count }
  })
}

const byCount = (a: Count, b: Count) => b.count - a.count || a.label.localeCompare(b.label)

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function monthKey(epochMs: number): string {
  const d = new Date(epochMs)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function computeStats(
  tracks: Track[],
  missingTracks: Track[],
  trackTags: Map<number, TrackTagIds>,
  genres: Genre[],
  keyNotation: KeyNotation,
): CollectionStats {
  const quality: Record<QualityVerdict, number> = { lossless: 0, lossy: 0, low: 0, unknown: 0 }
  const formats = new Map<string, number>()
  const bpms: number[] = []
  const keys = new Map<string, { count: number; sort: number }>()
  const genreCounts = new Map<number, number>()
  const years = new Map<number, number>()
  const months = new Map<string, number>()
  let playtimeSeconds = 0
  let noLength = 0
  let sizeBytes = 0
  let noKey = 0
  let analysed = 0
  let tagged = 0
  let cloudOnly = 0
  let noAddedDate = 0

  for (const t of tracks) {
    if (t.duration && t.duration > 0) playtimeSeconds += t.duration
    else noLength++
    sizeBytes += t.size
    quality[qualityVerdict(t)]++
    // .aif and .aiff are the same format.
    const format = t.format.toUpperCase() === 'AIF' ? 'AIFF' : t.format.toUpperCase()
    formats.set(format, (formats.get(format) ?? 0) + 1)
    if (t.bpm && t.bpm > 0) bpms.push(t.bpm)
    const key = formatKey(t.musicalKey, keyNotation)
    if (key) keys.set(key, { count: (keys.get(key)?.count ?? 0) + 1, sort: keySortValue(t.musicalKey) })
    else noKey++
    const genreIds = new Set(trackTags.get(t.id)?.genreIds ?? [])
    if (genreIds.size > 0) tagged++
    for (const id of genreIds) genreCounts.set(id, (genreCounts.get(id) ?? 0) + 1)
    if (t.year && t.year > 0) years.set(t.year, (years.get(t.year) ?? 0) + 1)
    if (t.birthtime) {
      const month = monthKey(t.birthtime)
      months.set(month, (months.get(month) ?? 0) + 1)
    } else noAddedDate++
    if (t.analysisStatus === 'done') analysed++
    if (t.cloudStatus === 'cloud_only') cloudOnly++
  }

  bpms.sort((a, b) => a - b)
  const bpmBins: Count[] = []
  if (bpms.length > 0) {
    const perBin = new Map<number, number>()
    for (const bpm of bpms) {
      const bin = Math.floor(bpm / BPM_BIN) * BPM_BIN
      perBin.set(bin, (perBin.get(bin) ?? 0) + 1)
    }
    const last = Math.floor(bpms[bpms.length - 1] / BPM_BIN) * BPM_BIN
    for (let bin = Math.floor(bpms[0] / BPM_BIN) * BPM_BIN; bin <= last; bin += BPM_BIN)
      bpmBins.push({ label: `${bin}–${bin + BPM_BIN - 1}`, count: perBin.get(bin) ?? 0 })
  }

  const yearList = [...years.keys()].sort((a, b) => a - b)
  const yearCounts: Count[] = []
  const decades = new Map<number, number>()
  if (yearList.length > 0) {
    for (let y = yearList[0]; y <= yearList[yearList.length - 1]; y++) {
      const count = years.get(y) ?? 0
      yearCounts.push({ label: String(y), count })
      const decade = Math.floor(y / 10) * 10
      decades.set(decade, (decades.get(decade) ?? 0) + count)
    }
  }

  const monthList = [...months.keys()].sort()
  const addedPerMonth: Count[] = []
  if (monthList.length > 0) {
    let [y, m] = monthList[0].split('-').map(Number)
    const end = monthList[monthList.length - 1]
    for (;;) {
      const label = `${y}-${String(m).padStart(2, '0')}`
      addedPerMonth.push({ label, count: months.get(label) ?? 0 })
      if (label === end) break
      if (++m > 12) [y, m] = [y + 1, 1]
    }
  }

  const genreNames = new Map(genres.map((g) => [g.id, g.name]))
  const artists = countNames(tracks.map((t) => t.artist))

  return {
    songs: tracks.length,
    playtimeSeconds,
    noLength,
    sizeBytes,
    artists: artists.length,
    albums: countNames(tracks.map((t) => t.album)).length,
    genres: genreCounts.size,
    quality,
    formats: [...formats].map(([label, count]) => ({ label, count })).sort(byCount),
    bpmBins,
    bpmMin: bpms[0] ?? null,
    bpmMax: bpms[bpms.length - 1] ?? null,
    bpmMedian: median(bpms),
    noBpm: tracks.length - bpms.length,
    keys: [...keys].sort((a, b) => a[1].sort - b[1].sort).map(([label, { count }]) => ({ label, count })),
    noKey,
    topGenres: [...genreCounts]
      .map(([id, count]) => ({ label: genreNames.get(id) ?? '?', count }))
      .sort(byCount)
      .slice(0, TOP),
    topArtists: artists.sort(byCount).slice(0, TOP),
    years: yearCounts,
    decades: [...decades].map(([d, count]) => ({ label: `${d}s`, count })),
    noYear: tracks.length - [...years.values()].reduce((a, b) => a + b, 0),
    addedPerMonth,
    noAddedDate,
    analysed,
    tagged,
    missing: missingTracks.length,
    cloudOnly,
  }
}
