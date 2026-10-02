// The zoom shown above the player's waveform while a hot cue is dragged
// (docs/features/hot-cues.md): a detailed waveform of the bars around the
// cue, which stays in the middle while the music slides under it, with the
// beat grid (bars numbered like the suggestions: bars since the first
// beat), where the cue started, the other cues nearby, and a readout of
// the time, the bar and beat, and how far it has moved.
import { useEffect, useRef, useState } from 'react'
import type { TrackCue, WaveformSection } from '../types'
import { HOT_CUE_LETTERS, SUGGESTED_CUE_BARS, cueColor, gridPosition } from '../state/hotCues'
import { formatDuration } from '../format'

// How much is fetched around the cue at a time; refetched when the view
// gets near the edge of what's there.
const FETCH_SPAN = 80

const preciseTime = (s: number) => `${formatDuration(s)}.${String(Math.floor((Math.max(0, s) % 1) * 1000)).padStart(3, '0')}`

// Seconds the zoom shows: four bars either side, or 12 s without a BPM.
export function zoomSpan(bpm: number | null): number {
  return bpm && bpm > 0 ? (8 * 4 * 60) / bpm : 12
}

export function CueZoom({
  trackId,
  slot,
  time,
  origin,
  duration,
  bpm,
  start,
  cues,
  fine,
  snapping,
}: {
  trackId: number
  slot: number
  time: number
  origin: number
  duration: number
  bpm: number | null
  // Where the beat grid starts (the first beat).
  start: number
  cues: TrackCue[]
  fine: boolean
  snapping: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [section, setSection] = useState<WaveformSection | null>(null)
  const loading = useRef<number | null>(null)
  const span = zoomSpan(bpm)
  const color = cueColor({ color: cues.find((c) => c.kind === 'hot' && c.slot === slot)?.color ?? null, slot })

  // Fetch the section around the cue; again when the view nears its edge.
  useEffect(() => {
    const have = section && time - span / 2 >= section.start && time + span / 2 <= section.start + section.peaks.length / section.perSecond
    const atStart = section && section.start === 0 && time - span / 2 < 0
    if ((have || atStart) && section) return
    const from = Math.max(0, time - FETCH_SPAN / 2)
    if (loading.current === from) return
    loading.current = from
    let live = true
    window.api
      .getWaveformSection(trackId, from, FETCH_SPAN)
      .then((s) => {
        if (live && s) setSection(s)
      })
      .catch(() => {})
      .finally(() => {
        if (loading.current === from) loading.current = null
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, Math.round(time / 5)])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)
    const css = getComputedStyle(canvas)
    const accent = css.getPropertyValue('--color-accent').trim() || '#2dd4bf'
    const dim = css.getPropertyValue('--color-text-dim').trim() || '#8a93a3'
    const left = time - span / 2
    const xOf = (t: number) => ((t - left) / span) * w
    const top = 16
    const mid = top + (h - top) / 2
    const half = (h - top) / 2 - 2

    // Beat grid: bars brighter and numbered, beats faint.
    if (bpm && bpm > 0) {
      const beat = 60 / bpm
      const first = Math.ceil((left - start) / beat)
      ctx.font = '10px system-ui, sans-serif'
      ctx.textBaseline = 'top'
      for (let n = first; start + n * beat <= left + span; n++) {
        const t = start + n * beat
        const x = Math.round(xOf(t)) + 0.5
        const bar = n % 4 === 0
        const suggested = bar && SUGGESTED_CUE_BARS.includes(n / 4)
        ctx.strokeStyle = dim
        ctx.globalAlpha = suggested ? 0.9 : bar ? 0.5 : 0.18
        ctx.beginPath()
        ctx.moveTo(x, top)
        ctx.lineTo(x, h)
        ctx.stroke()
        if (bar) {
          ctx.globalAlpha = suggested ? 1 : 0.75
          ctx.fillStyle = dim
          ctx.fillText(String(n / 4), x + 3, 2)
        }
      }
      ctx.globalAlpha = 1
    }

    // The waveform, each pixel the loudest peak under it.
    if (section) {
      ctx.fillStyle = accent
      ctx.globalAlpha = 0.85
      for (let x = 0; x < w; x++) {
        const t0 = left + (x / w) * span
        const t1 = left + ((x + 1) / w) * span
        if (t1 < 0 || t0 > duration) continue
        const i0 = Math.max(0, Math.floor((t0 - section.start) * section.perSecond))
        const i1 = Math.min(section.peaks.length, Math.max(i0 + 1, Math.ceil((t1 - section.start) * section.perSecond)))
        let p = 0
        for (let i = i0; i < i1; i++) p = Math.max(p, section.peaks[i])
        const bar = Math.max(0.5, p * half)
        ctx.fillRect(x, mid - bar, 1, bar * 2)
      }
      ctx.globalAlpha = 1
    }

    // The other hot cues in view, then where this one started.
    for (const c of cues) {
      if (c.kind !== 'hot' || c.slot === slot) continue
      const x = xOf(c.start)
      if (x < 0 || x > w) continue
      ctx.fillStyle = cueColor(c)
      ctx.fillRect(Math.round(x), top, 2, h - top)
      ctx.fillText(HOT_CUE_LETTERS[c.slot], Math.round(x) + 3, top + 2)
    }
    if (Math.abs(origin - time) > 0.0005) {
      const x = Math.round(xOf(origin)) + 0.5
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.6
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, h)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }
    // The cue, in the middle.
    const cx = Math.round(w / 2)
    ctx.fillStyle = color
    ctx.fillRect(cx - 1, top - 2, 3, h - top + 2)
    ctx.font = 'bold 10px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillRect(cx - 1, top - 2, 13, 13)
    ctx.fillStyle = '#0d0f12'
    ctx.fillText(HOT_CUE_LETTERS[slot], cx + 2, top)
  }, [section, time, origin, span, bpm, start, cues, slot, color, duration])

  const moved = time - origin
  const pos = bpm && bpm > 0 ? gridPosition(time, bpm, start) : null
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 'calc(100% + 10px)',
        zIndex: 50,
        background: 'var(--color-surface, #14171c)',
        border: `1px solid ${color}`,
        borderRadius: '6px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        padding: '6px 8px 8px',
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: '14px', alignItems: 'baseline', fontSize: '12px', marginBottom: '4px', fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ fontWeight: 700, color }}>Hot cue {HOT_CUE_LETTERS[slot]}</span>
        <span>{preciseTime(time)}</span>
        {pos && (
          <span>
            bar <b>{pos.bars}</b>
            {pos.beats > 0 ? ` + ${pos.beats} beat${pos.beats === 1 ? '' : 's'}` : ''}
          </span>
        )}
        <span style={{ color: 'var(--color-text-dim)' }}>
          {moved >= 0 ? '+' : '−'}
          {Math.abs(moved).toFixed(3)} s{bpm && bpm > 0 ? ` (${moved >= 0 ? '+' : '−'}${(Math.abs(moved) / (60 / bpm)).toFixed(2)} beats)` : ''} from{' '}
          {preciseTime(origin)}
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--color-text-dim)', fontSize: '11px' }}>
          {fine ? <b>Fine</b> : 'Hold ⌥ for fine'} · {snapping ? <b>Snapped to beat</b> : 'Shift snaps to beat'} · Esc cancels
        </span>
      </div>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '96px' }} />
    </div>
  )
}
