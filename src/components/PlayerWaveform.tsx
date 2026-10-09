// src/components/PlayerWaveform.tsx
//
// The player's whole-track waveform (docs/features/player.md, ADR 0065),
// which is also the seek bar: the bars in the chosen style, the beat grid,
// the playhead and the cue point. Drawn in one SVG stretched to the width
// — a slice is one unit wide and the height is 0–100.
import { useId, useMemo } from 'react'
import { formatDuration } from '../format'
import { waveformGridLines } from '../state/waveformGrid'
import type { WaveformBands, WaveformStyle } from '../types'

// The three bands of the 'bands' style. Mids and highs are quieter than
// bass in most music: lifted so they can be seen.
const BAND_LAYERS: { key: keyof WaveformBands; color: string; gain: number }[] = [
  { key: 'low', color: '#2a6cff', gain: 1 },
  { key: 'mid', color: '#ff9a2e', gain: 1.2 },
  { key: 'high', color: '#f4f6fa', gain: 2.4 },
]

// A slice's colour in the 'rgb' style: red for its bass, green for its
// mids, blue for its highs, by their share — brightened, since an even mix
// would otherwise be a dull grey.
export function rgbFor(low: number, mid: number, high: number): string {
  const top = Math.max(low, mid * 1.2, high * 2.4)
  if (!(top > 0)) return 'rgb(90, 96, 108)'
  const part = (v: number) => Math.round(255 * Math.pow(Math.min(1, v / top), 0.6))
  return `rgb(${part(low)}, ${part(mid * 1.2)}, ${part(high * 2.4)})`
}

export function PlayerWaveform({
  peaks,
  bands,
  style,
  showGrid,
  height,
  progress,
  duration,
  cuePoint,
  bpm,
  gridStart,
  onSeek,
}: {
  peaks: number[]
  // Null until read (or for a file that's gone): drawn as 'classic' meanwhile.
  bands: WaveformBands | null
  style: WaveformStyle
  showGrid: boolean
  height: number
  // 0–1 through the track.
  progress: number
  duration: number
  cuePoint: number
  bpm: number | null
  gridStart: number
  onSeek: (clientX: number, element: SVGSVGElement) => void
}) {
  const count = peaks.length
  const coloured = style !== 'classic' && !!bands && bands.low.length === count
  // The coloured bars don't change as the track plays (a shade is laid over
  // what hasn't played yet), so they're built once per track and style.
  const bars = useMemo(() => {
    if (!coloured || !bands) return null
    if (style === 'rgb') {
      return peaks.map((peak, i) => <rect key={i} x={i} y={50 - peak * 50} width={1} height={peak * 100} fill={rgbFor(bands.low[i], bands.mid[i], bands.high[i])} />)
    }
    // In each slice the tallest band goes at the back, so none hides another.
    return peaks.flatMap((_, i) =>
      BAND_LAYERS.map(({ key, color, gain }) => ({ key, color, h: Math.min(1, bands[key][i] * gain) * 100 }))
        .filter((band) => band.h > 0)
        .sort((a, b) => b.h - a.h)
        .map((band) => <rect key={`${i}-${band.key}`} x={i} y={50 - band.h / 2} width={1} height={band.h} fill={band.color} />)
    )
  }, [coloured, bands, peaks, style])
  // Classic: the bars once in the dim colour and once lit, the lit ones
  // shown only as far as the track has played — so playback moves one
  // clip edge, not the colour of 800 bars.
  const classicBars = useMemo(
    () => (coloured ? null : peaks.map((peak, i) => <rect key={i} x={i} y={50 - peak * 50} width={1} height={peak * 100} />)),
    [coloured, peaks]
  )
  const playedClip = useId()
  const grid = useMemo(() => (showGrid ? waveformGridLines(duration, bpm, gridStart) : []), [showGrid, duration, bpm, gridStart])
  const marker = Math.max(1, count / 400)
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${count} 100`}
      preserveAspectRatio="none"
      onClick={(e) => onSeek(e.clientX, e.currentTarget)}
      // Short/quiet-passage bars leave plenty of transparent gaps in the
      // waveform — without this, clicks landing in those gaps (rather than
      // exactly on a painted bar) are silently dropped, since SVG only
      // hit-tests painted areas by default. pointerEvents: 'all' makes the
      // whole box clickable regardless of what's actually drawn there.
      style={{ cursor: 'pointer', display: 'block', pointerEvents: 'all' }}
    >
      {coloured ? (
        <>
          {bars}
          {/* What hasn't played yet, shaded. */}
          <rect x={progress * count} y={0} width={Math.max(0, count - progress * count)} height={100} fill="var(--color-bg)" opacity={0.55} />
        </>
      ) : (
        <>
          <clipPath id={playedClip}>
            <rect x={0} y={0} width={Math.min(count, Math.floor(progress * count) + 1)} height={100} />
          </clipPath>
          <g fill="var(--color-border)">{classicBars}</g>
          <g fill="var(--color-accent)" clipPath={`url(#${playedClip})`}>
            {classicBars}
          </g>
        </>
      )}
      {duration > 0 &&
        grid.map((line) => (
          // One pixel wide however far the SVG is stretched.
          <line
            key={line.bar}
            x1={(line.time / duration) * count}
            x2={(line.time / duration) * count}
            y1={0}
            y2={100}
            stroke="var(--color-text)"
            strokeWidth={1}
            opacity={line.strong ? 0.45 : 0.16}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      <rect x={progress * count} y={0} width={marker} height={100} fill="var(--color-secondary)" />
      {duration > 0 && (
        <rect x={(cuePoint / duration) * count} y={0} width={marker} height={100} fill="var(--color-cue)">
          <title>Cue point {formatDuration(cuePoint)}</title>
        </rect>
      )}
    </svg>
  )
}
