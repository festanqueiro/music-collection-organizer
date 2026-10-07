// src/components/AudioButton.tsx
//
// Player-bar button + popover for where MCO plays, like the Mic's: the main
// output (device and volume) and the headphones for pre-listen (device and
// volume). The same choices as Settings → Audio.
import { useEffect, useRef, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { OutputSelect, sameOutput, useAudioOutputs } from './audioOutputs'
import { barIconButtonStyle } from './playerBarStyles'

const POPOVER_WIDTH = 320

function VolumeRow({ value, onChange, title }: { value: number; onChange: (v: number) => void; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-text-dim)' }}>
        {value === 0 ? 'volume_off' : 'volume_up'}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => e.currentTarget.blur()}
        title={title}
        style={{ flex: 1, minWidth: 0 }}
      />
      <span style={{ width: '36px', textAlign: 'right', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(value * 100)}%
      </span>
    </div>
  )
}

export function AudioButton() {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const mainId = useCollectionStore((s) => s.audioOutputDeviceId)
  const setMainId = useCollectionStore((s) => s.setAudioOutputDeviceId)
  const cueId = useCollectionStore((s) => s.cueOutputDeviceId)
  const setCueId = useCollectionStore((s) => s.setCueOutputDeviceId)
  const volume = useCollectionStore((s) => s.playerVolume)
  const setVolume = useCollectionStore((s) => s.setPlayerVolume)
  const cueVolume = useCollectionStore((s) => s.cueVolume)
  const setCueVolume = useCollectionStore((s) => s.setCueVolume)
  const { devices, error } = useAudioOutputs()
  const nameOf = (id: string | null) => (id ? (devices.find((d) => d.deviceId === id)?.label ?? "a device that's not connected") : 'System default')

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (!popoverRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function toggleOpen(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    setAnchor({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8)),
      bottom: window.innerHeight - rect.top + 8,
    })
    setOpen((v) => !v)
    // Otherwise the focused button swallows Space (play/pause).
    e.currentTarget.blur()
  }

  const sectionTitle = { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 } as const
  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        title={`Audio output — Main: ${nameOf(mainId)} · Headphones: ${nameOf(cueId)}`}
        aria-label="Audio output"
        style={barIconButtonStyle(open)}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
          speaker
        </span>
      </button>
      {open && anchor && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            left: anchor.left,
            bottom: anchor.bottom,
            width: POPOVER_WIDTH,
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '10px',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <div style={sectionTitle}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              speaker
            </span>
            Main output
          </div>
          <OutputSelect value={mainId} onChange={setMainId} devices={devices} title="Where the tracks, effects and siren play" />
          <VolumeRow value={volume} onChange={setVolume} title="Main volume" />

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '10px', ...sectionTitle }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              headphones
            </span>
            Headphones (pre-listen)
          </div>
          <OutputSelect value={cueId} onChange={setCueId} devices={devices} title="Where pre-listen plays (the headphones icon, or P)" />
          <VolumeRow value={cueVolume} onChange={setCueVolume} title="Pre-listen volume" />
          {sameOutput(cueId, mainId) && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>
              Same as the main output: pre-listen will be heard on the main speakers too.
            </div>
          )}
          {error && <div style={{ fontSize: '11px', color: 'var(--color-error)' }}>{error}</div>}
        </div>
      )}
    </>
  )
}
