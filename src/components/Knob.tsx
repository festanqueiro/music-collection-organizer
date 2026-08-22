// src/components/Knob.tsx
import { useRef, useState } from 'react'

const MIN_ANGLE = -135 // degrees — knob's fully-counterclockwise (min value) position
const MAX_ANGLE = 135 // degrees — knob's fully-clockwise (max value) position
// Vertical pixels of drag to sweep the knob's entire min..max range —
// matches the feel of a typical DAW/synth knob (drag up to increase,
// down to decrease; horizontal movement is ignored).
const DRAG_RANGE_PX = 150

export function Knob({
  value,
  min,
  max,
  step = 0,
  onChange,
  size = 32,
  bipolar = false,
  formatValue,
  defaultValue,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  size?: number
  // Draws a center tick mark — for controls like filter.position where 0
  // (dead center) is a meaningful "off"/bypass value, not just the
  // minimum.
  bipolar?: boolean
  formatValue?: (value: number) => string
  // Double-click resets to this value. Falls back to 0 for bipolar knobs
  // (their natural center/bypass) or `min` otherwise, so callers that
  // don't have a more meaningful default (e.g. a track-specific delay
  // time) still get sane double-click behavior for free.
  defaultValue?: number
}) {
  const dragState = useRef<{ startY: number; startValue: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  function clamp(v: number): number {
    const stepped = step > 0 ? Math.round(v / step) * step : v
    return Math.min(max, Math.max(min, stepped))
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragState.current = { startY: e.clientY, startValue: value }
    setDragging(true)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return
    const deltaY = dragState.current.startY - e.clientY // dragging up increases
    const deltaValue = (deltaY / DRAG_RANGE_PX) * (max - min)
    onChange(clamp(dragState.current.startValue + deltaValue))
  }

  function endDrag() {
    dragState.current = null
    setDragging(false)
  }

  // Fine adjustment without a drag — one wheel notch moves one step (or
  // 1% of the range if step isn't set).
  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault()
    const increment = step > 0 ? step : (max - min) / 100
    onChange(clamp(value + (e.deltaY < 0 ? increment : -increment)))
  }

  function handleDoubleClick() {
    onChange(clamp(defaultValue ?? (bipolar ? 0 : min)))
  }

  const ratio = (value - min) / (max - min)
  const angle = MIN_ANGLE + ratio * (MAX_ANGLE - MIN_ANGLE)

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onLostPointerCapture={endDrag}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      title={formatValue ? formatValue(value) : String(value)}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--color-surface-raised)',
        border: `1px solid ${dragging ? 'var(--color-accent)' : 'var(--color-border)'}`,
        position: 'relative',
        cursor: 'ns-resize',
        touchAction: 'none',
        flexShrink: 0,
        transform: `rotate(${angle}deg)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '2px',
          left: '50%',
          width: '2px',
          height: size * 0.35,
          background: 'var(--color-accent)',
          transform: 'translateX(-50%)',
          borderRadius: '1px',
        }}
      />
      {bipolar && (
        <div
          style={{
            position: 'absolute',
            top: '2px',
            left: '50%',
            width: '1px',
            height: '3px',
            background: 'var(--color-text-dim)',
            transform: `translateX(-50%) rotate(${-angle}deg)`,
            transformOrigin: `50% ${size / 2 - 2}px`,
          }}
        />
      )}
    </div>
  )
}
