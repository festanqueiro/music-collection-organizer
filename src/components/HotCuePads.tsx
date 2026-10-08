// Hot cue pads A–H, on their own row under the player (docs/features/hot-cues.md): an empty pad
// sets a cue where the track is; a set pad jumps there and plays. Right-click
// (or Shift-click) a set pad to name, recolour or delete it. Keys 1–8 and
// MIDI pads do the same as clicking. After the pads, suggested cues at bars
// 8/16/24/32/40/48/56/64: click one to put it in the first empty pad (or jump to it
// once set); right-click to pick which pad, A–H.
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { TrackCue } from '../types'
import { HOT_CUE_DEFAULT_COLORS, HOT_CUE_LETTERS, HOT_CUE_PALETTE, HOT_CUE_SLOTS, cueColor, firstEmptySlot, hotCueSlots, snapToBeat, type SuggestedCue, START_COLOR, START_SLOT } from '../state/hotCues'
import { CueZoom, zoomSpan } from './CueZoom'
import { formatDuration } from '../format'
import { contextMenuIconStyle, contextMenuItemStyle, contextMenuStyle } from './contextMenuStyles'
import { MidiLearnBadge } from './MidiLearnBadge'
import type { MidiControlKey } from '../types'

const cueTime = (s: number) => `${formatDuration(Math.floor(s))}.${String(Math.floor((s % 1) * 10))}`

export function HotCuePads({
  cues,
  onPad,
  onDelete,
  onChange,
  disabled,
  suggestions = [],
  onSuggest,
}: {
  cues: TrackCue[]
  onPad: (slot: number) => void
  onDelete: (slot: number) => void
  onChange: (slot: number, changes: { color?: string | null; name?: string }) => void
  disabled?: boolean
  suggestions?: SuggestedCue[]
  // Puts a suggestion on `slot`; `from` is the pad it was on, which is cleared.
  onSuggest?: (slot: number, time: number, from?: number) => void
}) {
  const slots = hotCueSlots(cues)
  const [menu, setMenu] = useState<{ slot: number; x: number; y: number } | null>(null)
  const [naming, setNaming] = useState(false)
  const [assign, setAssign] = useState<{ suggestion: SuggestedCue; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!menu && !assign) return
    const close = () => {
      setMenu(null)
      setAssign(null)
      setNaming(false)
    }
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [menu, assign])

  const menuCue = menu ? slots[menu.slot] : undefined

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }} aria-label="Hot cues">
      <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginRight: '2px' }}>Hot cues</span>
      {Array.from({ length: HOT_CUE_SLOTS }, (_, slot) => {
        const cue = slots[slot]
        const color = cue ? cueColor(cue) : undefined
        return (
          <span key={slot} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
            <button
              disabled={disabled}
              onClick={(e) => {
                if (e.shiftKey && cue) {
                  setMenu({ slot, x: e.clientX, y: e.clientY })
                  e.stopPropagation()
                  return
                }
                onPad(slot)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setAssign(null)
                if (cue) setMenu({ slot, x: e.clientX, y: e.clientY })
              }}
              // Keeps focus off the pad so Space/1–8 still reach the window.
              onMouseDown={(e) => e.preventDefault()}
              title={
                cue
                  ? `Hot cue ${HOT_CUE_LETTERS[slot]}${cue.name ? ` — ${cue.name}` : ''} at ${cueTime(cue.start)} (${slot + 1}): jump and play. Right-click to name, recolour or delete.`
                  : `Hot cue ${HOT_CUE_LETTERS[slot]} (${slot + 1}): set it here`
              }
              aria-label={`Hot cue ${HOT_CUE_LETTERS[slot]}${cue ? ' (set)' : ''}`}
              style={{
                width: '22px',
                height: '22px',
                padding: 0,
                fontSize: '11px',
                fontWeight: 700,
                borderRadius: '4px',
                border: `1px solid ${color ?? 'var(--color-border)'}`,
                background: color ?? 'transparent',
                color: cue ? '#0d0f12' : 'var(--color-text-dim)',
              }}
            >
              {HOT_CUE_LETTERS[slot]}
            </button>
            {/* Shown only with Settings → MIDI → Show MIDI mapping buttons on. */}
            <MidiLearnBadge control={`player.hotCue${slot + 1}` as MidiControlKey} />
          </span>
        )
      })}


      {suggestions.length > 0 && (
        <>
          <span
            style={{ fontSize: '11px', color: 'var(--color-text-dim)', margin: '0 2px 0 10px' }}
            title="Suggested hot cues every 8 bars from the start of the tune."
          >
            Suggested
          </span>
          {suggestions.map((sug) => {
            const setColor = sug.slot !== null ? cueColor(slots[sug.slot]!) : undefined
            const empty = firstEmptySlot(cues)
            return (
              <button
                key={sug.bar}
                disabled={disabled}
                onClick={(e) => {
                  if (sug.slot !== null) return onPad(sug.slot)
                  if (empty === null) {
                    setAssign({ suggestion: sug, x: e.clientX, y: e.clientY })
                    e.stopPropagation()
                    return
                  }
                  onSuggest?.(empty, sug.time)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenu(null)
                  setAssign({ suggestion: sug, x: e.clientX, y: e.clientY })
                }}
                onMouseDown={(e) => e.preventDefault()}
                title={
                  sug.slot !== null
                    ? `Bar ${sug.bar} from the start (${cueTime(sug.time)}) is hot cue ${HOT_CUE_LETTERS[sug.slot]}: jump and play. Right-click to put it on another pad.`
                    : `Bar ${sug.bar} from the start (${cueTime(sug.time)}): click to set it on ${empty === null ? 'a pad' : `pad ${HOT_CUE_LETTERS[empty]}`}; right-click to pick the pad.`
                }
                aria-label={`Suggested cue at bar ${sug.bar}${sug.slot !== null ? ` (set on ${HOT_CUE_LETTERS[sug.slot]})` : ''}`}
                style={{
                  height: '22px',
                  padding: '0 6px',
                  fontSize: '11px',
                  borderRadius: '4px',
                  border: `1px dashed ${setColor ?? 'var(--color-border)'}`,
                  background: 'transparent',
                  color: setColor ?? 'var(--color-text-dim)',
                  fontWeight: setColor ? 700 : 400,
                }}
              >
                {sug.slot !== null ? `${HOT_CUE_LETTERS[sug.slot]}·` : ''}
                {sug.bar}
              </button>
            )
          })}
        </>
      )}

      {assign && (
        <div onClick={(e) => e.stopPropagation()} style={{ ...contextMenuStyle, left: assign.x, top: assign.y - 8, transform: 'translateY(-100%)', minWidth: '200px' }}>
          <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--color-text-dim)' }}>
            Bar {assign.suggestion.bar} · {cueTime(assign.suggestion.time)} —{' '}
            {assign.suggestion.slot !== null ? `move it from ${HOT_CUE_LETTERS[assign.suggestion.slot]} to` : 'put it on'}
          </div>
          {Array.from({ length: HOT_CUE_SLOTS }, (_, slot) => {
            const cue = slots[slot]
            return (
              <button
                key={slot}
                disabled={assign.suggestion.slot === slot}
                onClick={() => {
                  onSuggest?.(slot, assign.suggestion.time, assign.suggestion.slot ?? undefined)
                  setAssign(null)
                }}
                style={contextMenuItemStyle}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '14px',
                    height: '14px',
                    borderRadius: '3px',
                    marginRight: '8px',
                    background: cue ? cueColor(cue) : 'transparent',
                    border: `1px solid ${cue ? cueColor(cue) : HOT_CUE_DEFAULT_COLORS[slot]}`,
                  }}
                />
                Pad {HOT_CUE_LETTERS[slot]}
                <span style={{ marginLeft: 'auto', paddingLeft: '12px', fontSize: '11px', color: 'var(--color-text-dim)' }}>
                  {assign.suggestion.slot === slot ? 'already here' : cue ? `replaces ${cueTime(cue.start)}` : 'empty'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {menu && menuCue && (
        <div onClick={(e) => e.stopPropagation()} style={{ ...contextMenuStyle, left: menu.x, top: menu.y - 8, transform: 'translateY(-100%)', minWidth: '200px' }}>
          <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--color-text-dim)' }}>
            Hot cue {HOT_CUE_LETTERS[menu.slot]} · {cueTime(menuCue.start)}
          </div>
          {naming ? (
            <input
              autoFocus
              defaultValue={menuCue.name}
              placeholder="Name (e.g. Drop)"
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Escape') setMenu(null)
                if (e.key === 'Enter') {
                  onChange(menu.slot, { name: e.currentTarget.value })
                  setMenu(null)
                  setNaming(false)
                }
              }}
              style={{ margin: '4px', width: 'calc(100% - 8px)', height: '24px', padding: '0 6px' }}
            />
          ) : (
            <button onClick={() => setNaming(true)} style={contextMenuItemStyle}>
              <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                edit
              </span>
              {menuCue.name ? 'Rename…' : 'Name…'}
            </button>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '6px 8px' }}>
            {HOT_CUE_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => {
                  onChange(menu.slot, { color: c })
                  setMenu(null)
                }}
                title={c}
                aria-label={`Colour ${c}`}
                style={{
                  width: '18px',
                  height: '18px',
                  padding: 0,
                  borderRadius: '50%',
                  background: c,
                  border: cueColor(menuCue).toLowerCase() === c ? '2px solid var(--color-text)' : '1px solid transparent',
                }}
              />
            ))}
          </div>
          <button
            onClick={() => {
              onDelete(menu.slot)
              setMenu(null)
            }}
            style={contextMenuItemStyle}
          >
            <span className="material-symbols-outlined" style={contextMenuIconStyle}>
              delete
            </span>
            Delete hot cue {HOT_CUE_LETTERS[menu.slot]}
          </button>
        </div>
      )}
    </div>
  )
}

// The cues drawn over the player's waveform: a coloured line with its
// letter for each hot cue, a thin line for memory cues, a band for loops,
// and a dashed line for each suggested cue not set yet. With `drag`, a hot
// cue can be dragged along the waveform (a click without moving jumps to
// it): the zoom (CueZoom) opens above while dragging; ⌥ moves it finely, at
// the zoom's scale; Shift snaps it to the beat; Esc puts it back.
export interface CueDragOptions {
  trackId: number
  bpm: number | null
  // Where the beat grid starts (bar 0).
  gridStart: number
  // `slot` is START_SLOT for the start marker.
  onMove: (slot: number, time: number) => void
  onJump: (slot: number) => void
}

interface DragState {
  slot: number
  origin: number
  time: number
  fine: boolean
  snapping: boolean
}

export function CueMarkers({
  cues,
  duration,
  suggestions = [],
  drag: dragOptions,
  start = null,
  audioRef,
}: {
  cues: TrackCue[]
  duration: number
  // With it, a marker pulses as the track plays through it.
  audioRef?: RefObject<HTMLAudioElement | null>
  suggestions?: SuggestedCue[]
  drag?: CueDragOptions
  // The start of the tune (bar 0), once the user has moved it off 0:00: a
  // marker like a hot cue's, dragged the same way, as slot START_SLOT.
  start?: number | null
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<(DragState & { startX: number; lastX: number; moved: boolean; pointerId: number }) | null>(null)

  // A marker swells for a moment as the track plays through it (or starts
  // from it, after a jump). Outside React (ADR 0023): one loop reads the
  // audio's time and animates the marker's own element — no render.
  useEffect(() => {
    if (!audioRef || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let last = audioRef.current?.currentTime ?? 0
    const tick = () => {
      const audio = audioRef.current
      const root = rootRef.current
      if (audio && root) {
        const now = audio.currentTime
        // Playing through only: a seek moves further than this in a frame.
        if (!audio.paused && now > last && now - last < 0.5) {
          for (const el of root.querySelectorAll<HTMLElement>('[data-cue-time]')) {
            const t = Number(el.dataset.cueTime)
            if (t >= last && t < now) {
              el.animate(
                [
                  { transform: 'scale(1)', filter: 'brightness(1)' },
                  { transform: 'scale(3, 1.2)', filter: 'brightness(1.6)', offset: 0.25 },
                  { transform: 'scale(1)', filter: 'brightness(1)' },
                ],
                { duration: 500, easing: 'ease-out' }
              )
            }
          }
        }
        last = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [audioRef])

  useEffect(() => {
    if (!drag) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      dragRef.current = null
      setDrag(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [drag !== null])

  if (!duration) return null
  const pct = (s: number) => `${Math.min(100, Math.max(0, (s / duration) * 100))}%`

  function timeAt(e: React.PointerEvent): number {
    const d = dragRef.current!
    const rect = rootRef.current!.getBoundingClientRect()
    const fine = e.altKey
    let t = fine
      ? d.time + ((e.clientX - d.lastX) * zoomSpan(dragOptions!.bpm)) / rect.width
      : ((e.clientX - rect.left) / rect.width) * duration
    // The start is what the beats are counted from: nothing to snap it to.
    const snapping = e.shiftKey && !!dragOptions!.bpm && d.slot !== START_SLOT
    if (snapping) t = snapToBeat(t, dragOptions!.bpm!, dragOptions!.gridStart)
    t = Math.min(Math.max(0, duration - 0.01), Math.max(0, t))
    d.fine = fine
    d.snapping = snapping
    return Math.round(t * 1000) / 1000
  }

  // A marker that can be dragged along the waveform: a hot cue, or the start.
  function draggable(key: number | string, slot: number, origin: number, at: number, dragging: boolean, title: string, line: React.ReactNode) {
    const options = dragOptions!
    return (
      <div
        key={key}
        title={title}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          dragRef.current = { slot, origin, time: origin, fine: false, snapping: false, startX: e.clientX, lastX: e.clientX, moved: false, pointerId: e.pointerId }
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (!d || d.pointerId !== e.pointerId) return
          if (!d.moved && Math.abs(e.clientX - d.startX) < 3) return
          if (!d.moved) {
            // Grabbing a line a few pixels off shouldn't make it jump.
            d.moved = true
            d.lastX = e.clientX
            setDrag({ slot: d.slot, origin: d.origin, time: d.time, fine: false, snapping: false })
            return
          }
          d.time = timeAt(e)
          d.lastX = e.clientX
          setDrag({ slot: d.slot, origin: d.origin, time: d.time, fine: d.fine, snapping: d.snapping })
        }}
        onPointerUp={(e) => {
          const d = dragRef.current
          dragRef.current = null
          setDrag(null)
          if (!d) return
          if (!d.moved) options.onJump(d.slot)
          else if (Math.abs(d.time - d.origin) > 0.0005) options.onMove(d.slot, d.time)
          e.stopPropagation()
        }}
        onPointerCancel={() => {
          dragRef.current = null
          setDrag(null)
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: pct(at),
          width: '12px',
          marginLeft: '-5px',
          paddingLeft: '5px',
          boxSizing: 'border-box',
          pointerEvents: 'auto',
          cursor: dragging ? 'grabbing' : 'ew-resize',
          touchAction: 'none',
          zIndex: dragging ? 2 : 1,
        }}
      >
        <div style={{ position: 'relative', height: '100%' }}>{line}</div>
      </div>
    )
  }

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* Suggested cues not set yet: a faint dashed line. */}
      {suggestions
        .filter((s) => s.slot === null)
        .map((s) => (
          <div key={`s${s.bar}`} style={{ position: 'absolute', top: 0, bottom: 0, left: pct(s.time), borderLeft: '1px dashed var(--color-text-dim)', opacity: 0.6 }} />
        ))}
      {start !== null &&
        (() => {
          const dragging = drag?.slot === START_SLOT
          // Its label goes under a hot cue's when one sits on the start.
          const shared = cues.some((c) => c.kind === 'hot' && Math.abs(c.start - start) < duration * 0.012)
          const line = (
            <div data-cue-time={start} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '2px', background: START_COLOR, transformOrigin: 'left center' }}>
              <span
                style={{
                  position: 'absolute',
                  ...(shared ? { bottom: '-1px' } : { top: '-1px' }),
                  left: 0,
                  fontSize: '9px',
                  fontWeight: 700,
                  lineHeight: '11px',
                  padding: '0 2px',
                  background: START_COLOR,
                  color: '#0d0f12',
                  borderRadius: '0 2px 2px 0',
                }}
              >
                0
              </span>
            </div>
          )
          const at = dragging ? drag.time : start
          if (!dragOptions) return <div style={{ position: 'absolute', top: 0, bottom: 0, left: pct(at), width: 0 }}>{line}</div>
          return draggable('start', START_SLOT, start, at, !!dragging, 'Start of the tune — bar 0: drag to move it (⌥ fine, Esc cancels); click to jump there; right-click to put it back at 0:00', line)
        })()}
      {cues.map((c) => {
        if (c.kind === 'loop' && c.end !== null) {
          return (
            <div
              key={c.id}
              style={{ position: 'absolute', top: 0, bottom: 0, left: pct(c.start), width: `calc(${pct(c.end)} - ${pct(c.start)})`, background: 'rgba(255,255,255,0.08)' }}
            />
          )
        }
        const dragging = drag && c.kind === 'hot' && drag.slot === c.slot
        const at = dragging ? drag.time : c.start
        const line = (
          <div data-cue-time={c.start} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '2px', background: c.kind === 'hot' ? cueColor(c) : 'var(--color-cue)', opacity: c.kind === 'hot' ? 1 : 0.6, transformOrigin: 'left center' }}>
            {c.kind === 'hot' && (
              <span
                style={{
                  position: 'absolute',
                  top: '-1px',
                  left: 0,
                  fontSize: '9px',
                  fontWeight: 700,
                  lineHeight: '11px',
                  padding: '0 2px',
                  background: cueColor(c),
                  color: '#0d0f12',
                  borderRadius: '0 2px 2px 0',
                }}
              >
                {HOT_CUE_LETTERS[c.slot]}
              </span>
            )}
          </div>
        )
        if (c.kind !== 'hot' || !dragOptions) {
          return (
            <div key={c.id} style={{ position: 'absolute', top: 0, bottom: 0, left: pct(at), width: 0 }}>
              {line}
            </div>
          )
        }
        return draggable(c.id, c.slot, c.start, at, !!dragging, `Hot cue ${HOT_CUE_LETTERS[c.slot]}: drag to move it (⌥ fine, Shift snaps to the beat, Esc cancels); click to jump there`, line)
      })}
      {drag && dragOptions && (
        <CueZoom
          trackId={dragOptions.trackId}
          slot={drag.slot}
          time={drag.time}
          origin={drag.origin}
          duration={duration}
          bpm={dragOptions.bpm}
          // Dragging the start: the grid is drawn from where it is held.
          start={drag.slot === START_SLOT ? drag.time : dragOptions.gridStart}
          cues={cues}
          fine={drag.fine}
          snapping={drag.snapping}
        />
      )}
    </div>
  )
}
