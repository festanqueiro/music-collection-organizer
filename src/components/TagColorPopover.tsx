// The tag tree's "Choose color…": the palette as swatches, a custom colour
// (the browser's own picker, opened from a visible swatch so it appears
// next to it) and "No colour". Opens where the tag was right-clicked.
import { useEffect, useRef, useState } from 'react'
import { TAG_COLORS } from '../tagColors'

const WIDTH = 188

export function TagColorPopover({
  x,
  y,
  current,
  onPick,
  onClose,
}: {
  x: number
  y: number
  current: string | null
  onPick: (color: string | null) => void
  onClose: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const customRef = useRef<HTMLInputElement>(null)
  const [custom, setCustom] = useState(current ?? '#888888')

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  // The picker fires 'input' continuously while dragging (shown on the
  // swatch) and 'change' once a colour is settled — only that is saved.
  useEffect(() => {
    const input = customRef.current
    if (!input) return
    const onChange = () => onPick(input.value)
    input.addEventListener('change', onChange)
    return () => input.removeEventListener('change', onChange)
  }, [onPick])

  const swatch = (color: string) => {
    const selected = current?.toLowerCase() === color
    return (
      <button
        key={color}
        onClick={() => onPick(color)}
        title={color}
        aria-label={`Colour ${color}`}
        aria-pressed={selected}
        style={{
          width: '22px',
          height: '22px',
          padding: 0,
          borderRadius: '50%',
          background: color,
          border: 'none',
          outline: selected ? '2px solid var(--color-text)' : 'none',
          outlineOffset: '2px',
        }}
      />
    )
  }

  return (
    <div
      ref={rootRef}
      style={{
        position: 'fixed',
        top: Math.min(y, window.innerHeight - 150),
        left: Math.min(x, window.innerWidth - WIDTH - 8),
        width: WIDTH,
        padding: '10px',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        zIndex: 21,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 22px)', justifyContent: 'space-between', rowGap: '8px' }}>
        {TAG_COLORS.map(swatch)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input
            ref={customRef}
            type="color"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            style={{ width: '22px', height: '22px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
          />
          Custom…
        </label>
        <button onClick={() => onPick(null)} disabled={!current} style={{ padding: '2px 8px' }}>
          No colour
        </button>
      </div>
    </div>
  )
}
