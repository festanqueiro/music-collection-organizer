// src/components/RefineBpmMenu.tsx
//
// "Refine BPM…" from a row's right-click menu (docs/features/dj-tools.md):
// the beat tracker can be an octave out, or report two thirds of the tempo
// on broken beats. Doubles it, halves it, multiplies it by one and a half,
// or sets the BPM typed — for one track, or every checked one.
import { useEffect, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { tracksById } from '../state/tracksById'
import { contextMenuIconStyle, contextMenuItemStyle } from './contextMenuStyles'
import type { BpmChange } from '../types'
import { ContextMenu } from './ContextMenu'

const show = (bpm: number) => String(Math.round(bpm * 100) / 100)

export function RefineBpmMenu({ x, y, trackIds, onClose }: { x: number; y: number; trackIds: number[]; onClose: () => void }) {
  const tracks = useCollectionStore((s) => s.tracks)
  const changeTracksBpm = useCollectionStore((s) => s.changeTracksBpm)
  const showToast = useCollectionStore((s) => s.showToast)
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [onClose])

  const chosen = trackIds.map((id) => tracksById(tracks).get(id)).filter((t) => !!t)
  const single = chosen.length === 1 ? chosen[0] : null
  const bpm = single?.bpm ?? null
  const withBpm = chosen.filter((t) => t.bpm).length
  const edited = chosen.some((t) => t.bpmEdited)

  function apply(change: BpmChange) {
    onClose()
    changeTracksBpm(trackIds, change).catch((err) => showToast(err instanceof Error ? err.message : String(err)))
  }

  // What a factor gives for one track; for several, just the operation.
  const factor = (icon: string, label: string, by: number, hint: string) => (
    <button key={label} onClick={() => apply({ kind: 'factor', factor: by })} disabled={withBpm === 0} title={hint} style={contextMenuItemStyle}>
      <span className="material-symbols-outlined" style={contextMenuIconStyle}>
        {icon}
      </span>
      <span>{label}</span>
      {bpm && <span style={{ color: 'var(--color-text-dim)', fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>≈ {show(bpm * by)}</span>}
    </button>
  )

  return (
    <ContextMenu x={x} y={y} onClose={onClose} style={{ minWidth: '220px' }}>
      <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--color-text-dim)' }}>
        {single ? `BPM ${bpm ? show(bpm) : '—'}${single.bpmEdited ? ' · set by you' : ''}` : `BPM of ${trackIds.length} tracks`}
      </div>
      {factor('keyboard_double_arrow_up', 'Double', 2, 'The tracker found half the tempo (85 for 170)')}
      {factor('keyboard_double_arrow_down', 'Halve', 0.5, 'The tracker found twice the tempo (140 for 70)')}
      {factor('timeline', 'Two-thirds fix (× 1.5)', 1.5, 'The tracker found two thirds of the tempo (108 for 162), as it can on broken beats')}
      {typing ? (
        <input
          autoFocus
          inputMode="decimal"
          placeholder={single ? 'BPM' : 'BPM for all of them'}
          defaultValue={bpm ? show(bpm) : ''}
          aria-label="BPM"
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            // Keep the table's shortcuts (Space, P…) out of the field.
            e.stopPropagation()
            if (e.key === 'Escape') onClose()
            if (e.key !== 'Enter') return
            const value = Number(e.currentTarget.value.replace(',', '.'))
            if (!(value > 0)) return
            apply({ kind: 'set', bpm: value })
          }}
          style={{ margin: '4px', width: 'calc(100% - 8px)', height: '24px', padding: '0 6px' }}
        />
      ) : (
        <button onClick={() => setTyping(true)} style={contextMenuItemStyle}>
          <span className="material-symbols-outlined" style={contextMenuIconStyle}>
            edit
          </span>
          Set the BPM…
        </button>
      )}
      {edited && (
        <button
          onClick={() => apply({ kind: 'detect' })}
          title="Forgets the BPM set by hand and analyses again"
          style={contextMenuItemStyle}
        >
          <span className="material-symbols-outlined" style={contextMenuIconStyle}>
            graphic_eq
          </span>
          Detect it again
        </button>
      )}
    </ContextMenu>
  )
}
