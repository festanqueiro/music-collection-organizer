// src/components/VisualDelayControl.tsx
//
// The Visual delay setting (ADR 0047): a slider in 10 ms steps with its
// value, used in Settings → Audio and the Screen popover.
import { MAX_VISUAL_DELAY_MS, useCollectionStore } from '../state/store'

export function VisualDelayControl() {
  const delayMs = useCollectionStore((s) => s.visualDelayMs)
  const setDelayMs = useCollectionStore((s) => s.setVisualDelayMs)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input
        type="range"
        min={0}
        max={MAX_VISUAL_DELAY_MS}
        step={10}
        value={delayMs}
        onChange={(e) => setDelayMs(Number(e.target.value))}
        onPointerUp={(e) => e.currentTarget.blur()}
        title="Hold the visuals back to match sound that arrives late (AirPlay, Bluetooth)"
        style={{ flex: 1, minWidth: 0 }}
      />
      <span style={{ width: '64px', textAlign: 'right', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
        {delayMs === 0 ? 'Off' : `${delayMs} ms`}
      </span>
      <button onClick={() => setDelayMs(0)} disabled={delayMs === 0} title="No delay">
        Reset
      </button>
    </div>
  )
}
