// Hot cue pads A–H, on their own row under the player (docs/features/hot-cues.md): an empty pad
// sets a cue where the track is; a set pad jumps there and plays. Right-click
// (or Shift-click) a set pad to name, recolour or delete it. Keys 1–8 and
// MIDI pads do the same as clicking.
import { useEffect, useState } from 'react'
import type { TrackCue } from '../types'
import { HOT_CUE_LETTERS, HOT_CUE_PALETTE, HOT_CUE_SLOTS, cueColor, hotCueSlots } from '../state/hotCues'
import { formatDuration } from '../format'
import { contextMenuIconStyle, contextMenuItemStyle, contextMenuStyle } from './contextMenuStyles'
import { MidiLearnBadge } from './MidiLearnBadge'
import type { MidiControlKey } from '../types'

const cueTime = (s: number) => `${formatDuration(s)}.${String(Math.floor((s % 1) * 10))}`

export function HotCuePads({
  cues,
  onPad,
  onDelete,
  onChange,
  disabled,
}: {
  cues: TrackCue[]
  onPad: (slot: number) => void
  onDelete: (slot: number) => void
  onChange: (slot: number, changes: { color?: string | null; name?: string }) => void
  disabled?: boolean
}) {
  const slots = hotCueSlots(cues)
  const [menu, setMenu] = useState<{ slot: number; x: number; y: number } | null>(null)
  const [naming, setNaming] = useState(false)

  useEffect(() => {
    if (!menu) return
    const close = () => {
      setMenu(null)
      setNaming(false)
    }
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

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
// letter for each hot cue, a thin line for memory cues, a band for loops.
export function CueMarkers({ cues, duration }: { cues: TrackCue[]; duration: number }) {
  if (!duration) return null
  const pct = (s: number) => `${Math.min(100, Math.max(0, (s / duration) * 100))}%`
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {cues.map((c) =>
        c.kind === 'loop' && c.end !== null ? (
          <div
            key={c.id}
            style={{ position: 'absolute', top: 0, bottom: 0, left: pct(c.start), width: `calc(${pct(c.end)} - ${pct(c.start)})`, background: 'rgba(255,255,255,0.08)' }}
          />
        ) : (
          <div key={c.id} style={{ position: 'absolute', top: 0, bottom: 0, left: pct(c.start), width: '2px', background: c.kind === 'hot' ? cueColor(c) : 'var(--color-cue)', opacity: c.kind === 'hot' ? 1 : 0.6 }}>
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
      )}
    </div>
  )
}
