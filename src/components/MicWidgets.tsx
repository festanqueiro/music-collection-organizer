// src/components/MicWidgets.tsx
//
// Pieces of the mic's UI shared by the Mic popover (MicButton, player bar)
// and the Mic FX panel (MicPanel).
import { useEffect, useRef, useState } from 'react'
import { subscribeToMicLevels } from '../audio/micSession'

const METER_FLOOR_DB = -60
const CLIP_LEVEL = 0.99
const CLIP_HOLD_MS = 1500

export function useInputDevices(): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    const media = navigator.mediaDevices
    const refresh = () =>
      media
        .enumerateDevices()
        .then((all) => setDevices(all.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default')))
        .catch(() => setDevices([]))
    refresh()
    media.addEventListener('devicechange', refresh)
    return () => media.removeEventListener('devicechange', refresh)
  }, [])
  return devices
}

// Input level, drawn straight into the DOM ~50 times a second (no
// re-render), with a clip light that stays lit for a moment.
export function LevelMeter({ active }: { active: boolean }) {
  const barRef = useRef<HTMLDivElement>(null)
  const clipRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let clipUntil = 0
    const setLevel = (peak: number) => {
      const db = peak > 0 ? 20 * Math.log10(peak) : METER_FLOOR_DB
      const fraction = Math.min(1, Math.max(0, (db - METER_FLOOR_DB) / -METER_FLOOR_DB))
      if (barRef.current) barRef.current.style.width = `${fraction * 100}%`
      const now = performance.now()
      if (peak >= CLIP_LEVEL) clipUntil = now + CLIP_HOLD_MS
      if (clipRef.current) clipRef.current.style.opacity = now < clipUntil ? '1' : '0.15'
    }
    setLevel(0)
    return subscribeToMicLevels((levels) => setLevel(levels.peak))
  }, [])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: active ? 1 : 0.4 }} title="Input level (after Gain)">
      <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'var(--color-surface-raised)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
        <div
          ref={barRef}
          style={{ height: '100%', width: 0, background: 'linear-gradient(90deg, var(--color-accent) 70%, var(--color-cue) 88%, var(--color-error))' }}
        />
      </div>
      <div ref={clipRef} title="Clipping: turn the Gain down" style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-error)', opacity: 0.15 }} />
    </div>
  )
}

// A button that acts while held (pointer capture so releasing off the
// button still counts), mirroring the siren's trigger.
export function HoldButton({
  label,
  lit,
  disabled,
  title,
  onDown,
  onUp,
}: {
  label: string
  lit: boolean
  disabled?: boolean
  title: string
  onDown: () => void
  onUp: () => void
}) {
  const held = useRef(false)
  const release = () => {
    if (!held.current) return
    held.current = false
    onUp()
  }
  return (
    <button
      disabled={disabled}
      title={title}
      style={lit ? { background: 'var(--color-accent)', color: 'var(--color-on-accent)', borderColor: 'var(--color-accent)' } : undefined}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        held.current = true
        onDown()
      }}
      onPointerUp={release}
      onLostPointerCapture={release}
    >
      {label}
    </button>
  )
}
