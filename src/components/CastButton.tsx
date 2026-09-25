// src/components/CastButton.tsx
import { useEffect, useRef, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { isCastActive, restartCastingToScreen, startCasting, stopCasting } from '../cast/castSession'
import { ToggleSwitch } from './ToggleSwitch'
import { contextMenuItemStyle, contextMenuIconStyle } from './contextMenuStyles'

const POPOVER_WIDTH = 300

// Player-bar button + popover for casting to a Google Cast device (Google
// TV, Chromecast, Nest). Devices are only searched for while the popover
// is open.
export function CastButton() {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const status = useCollectionStore((s) => s.castStatus)
  const devices = useCollectionStore((s) => s.castDevices)
  const showVisualizer = useCollectionStore((s) => s.castShowVisualizer)
  const setShowVisualizer = useCollectionStore((s) => s.setCastShowVisualizer)
  const muteLocal = useCollectionStore((s) => s.castMuteLocal)
  const setMuteLocal = useCollectionStore((s) => s.setCastMuteLocal)
  const lowLatency = useCollectionStore((s) => s.castLowLatency)
  const setLowLatency = useCollectionStore((s) => s.setCastLowLatency)
  const active = isCastActive(status)

  useEffect(() => {
    if (!open) return
    window.api.startCastDiscovery()
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
      window.api.stopCastDiscovery()
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

  const statusText =
    status.state === 'connecting'
      ? `Connecting to ${status.deviceName}…`
      : status.state === 'buffering'
        ? `Starting the stream on ${status.deviceName}…`
        : status.state === 'casting'
          ? `Casting to ${status.deviceName}`
          : null

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        title={active ? (statusText ?? 'Casting') : 'Cast to a TV or speaker'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0, display: 'flex' }}
      >
        <span
          className="material-symbols-outlined"
          style={{ color: status.state === 'casting' ? 'var(--color-accent)' : undefined }}
        >
          {active ? 'cast_connected' : 'cast'}
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
            gap: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontWeight: 500 }}>Cast</div>

          {active ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {status.state !== 'casting' && (
                <span className="material-symbols-outlined spin" style={{ fontSize: '16px', color: 'var(--color-text-dim)' }}>
                  progress_activity
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{statusText}</span>
              <button onClick={() => stopCasting()}>Stop</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {devices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => startCasting(device)}
                  style={contextMenuItemStyle}
                  title={device.model ?? undefined}
                >
                  <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                    {device.audioOnly ? 'speaker' : 'tv'}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{device.name}</span>
                </button>
              ))}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  color: 'var(--color-text-dim)',
                }}
              >
                <span className="material-symbols-outlined spin" style={{ fontSize: '14px' }}>
                  progress_activity
                </span>
                {devices.length === 0 ? 'Looking for devices on your network…' : 'Looking for more devices…'}
              </div>
            </div>
          )}

          {status.state === 'error' && (
            <div style={{ fontSize: '12px', color: 'var(--color-secondary)' }}>
              Casting stopped: {status.error}
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
              Show visualizer on the TV
              <ToggleSwitch checked={showVisualizer} onChange={setShowVisualizer} title="Show visualizer on the TV" />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
              Mute this Mac while casting
              <ToggleSwitch checked={muteLocal} onChange={setMuteLocal} title="Mute this Mac while casting" />
            </label>
            <label
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}
              title="About 3–5 s behind instead of 6–10 s. May stutter on weak Wi-Fi. TVs only."
            >
              Lower delay on TVs
              <ToggleSwitch
                checked={lowLatency}
                onChange={(checked) => {
                  setLowLatency(checked)
                  // Changes the stream itself, so a running cast restarts.
                  restartCastingToScreen()
                }}
                title="Lower delay on TVs"
              />
            </label>
            <div style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>
              Plays everything you hear in MCO, effects included, a few seconds behind ({lowLatency ? 'about 3–5 s' : 'about 6–10 s'} on
              TVs). Lower delay can stutter on weak Wi-Fi.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
