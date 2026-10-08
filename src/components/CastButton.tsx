// src/components/CastButton.tsx
import { useEffect } from 'react'
import { useToolbarPopover } from './useToolbarPopover'
import { useCollectionStore } from '../state/store'
import { castingToAScreen, isCastActive, startCasting, stopCasting } from '../cast/castSession'
import { TV_VISUALIZERS, type CastScreen } from '../cast/tvVisualizers'
import { ToggleSwitch } from './ToggleSwitch'
import { contextMenuItemStyle, contextMenuIconStyle } from './contextMenuStyles'
import { barIconButtonStyle } from './playerBarStyles'

const POPOVER_WIDTH = 300

// What the TV can show: the now-playing screen (the track's details, the
// queue) or one of its own visualizers.
const SCREEN_CHOICES: { id: CastScreen; name: string; icon: string }[] = [
  { id: 'now-playing', name: 'Now playing (track details)', icon: 'info' },
  ...TV_VISUALIZERS.map((v) => ({ id: v.id, name: `Visualizer: ${v.name}`, icon: 'graphic_eq' })),
]

// Player-bar button + popover for casting to a Google Cast device (Google
// TV, Chromecast, Nest). Devices are only searched for while the popover
// is open.
export function CastButton() {
  const { open, anchor, buttonRef, popoverRef, toggleOpen: togglePopover } = useToolbarPopover(POPOVER_WIDTH)
  const status = useCollectionStore((s) => s.castStatus)
  const devices = useCollectionStore((s) => s.castDevices)
  const muteLocal = useCollectionStore((s) => s.castMuteLocal)
  const setMuteLocal = useCollectionStore((s) => s.setCastMuteLocal)
  const active = isCastActive(status)
  // Recording and casting never run together (docs/features/recording.md).
  const recording = useCollectionStore((s) => s.recordingState !== 'idle')
  const showToast = useCollectionStore((s) => s.showToast)
  const toScreen = castingToAScreen(status)
  const castScreen = useCollectionStore((s) => s.castScreen)
  const setCastScreen = useCollectionStore((s) => s.setCastScreen)
  const hideTrackInfo = useCollectionStore((s) => s.visualizerHideTrackInfo)
  const setHideTrackInfo = useCollectionStore((s) => s.setVisualizerHideTrackInfo)

  // Devices are looked for only while the popover is open.
  useEffect(() => {
    if (!open) return
    window.api.startCastDiscovery()
    return () => {
      void window.api.stopCastDiscovery()
    }
  }, [open])

  function toggleOpen(e: React.MouseEvent<HTMLButtonElement>) {
    if (recording && !active) {
      showToast('Stop recording to cast')
      e.currentTarget.blur()
      return
    }
    togglePopover(e)
  }

  const statusText =
    status.state === 'connecting'
      ? `Connecting to ${status.deviceName}…`
      : status.state === 'casting'
        ? `Casting to ${status.deviceName}`
        : null

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        title={active ? (statusText ?? 'Casting') : recording ? 'Stop recording to cast' : 'Cast to a TV or speaker'}
        aria-label="Cast"
        // Looks off while recording, but still clicks, to say why.
        style={{ ...barIconButtonStyle(open, status.state === 'casting'), ...(recording && !active ? { opacity: 0.45 } : {}) }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
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

          {active && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {status.state !== 'casting' && (
                <span className="material-symbols-outlined spin" style={{ fontSize: '16px', color: 'var(--color-text-dim)' }}>
                  progress_activity
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{statusText}</span>
              <button onClick={() => stopCasting()}>Stop</button>
            </div>
          )}
          {!active && (
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

          {toScreen && (
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-dim)' }}>
                On the TV
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {SCREEN_CHOICES.map((choice) => {
                  const selected = castScreen === choice.id
                  return (
                    <button
                      key={choice.id}
                      onClick={(e) => {
                        setCastScreen(choice.id)
                        // Otherwise the focused button swallows Space (play/pause).
                        e.currentTarget.blur()
                      }}
                      style={{
                        ...contextMenuItemStyle,
                        borderRadius: '6px',
                        ...(selected ? { background: 'var(--color-surface)', color: 'var(--color-accent)' } : {}),
                      }}
                    >
                      <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                        {selected ? 'radio_button_checked' : 'radio_button_unchecked'}
                      </span>
                      <span style={{ flex: 1 }}>{choice.name}</span>
                      <span className="material-symbols-outlined" style={{ ...contextMenuIconStyle, opacity: 0.5 }}>
                        {choice.icon}
                      </span>
                    </button>
                  )
                })}
              </div>
              {castScreen !== 'now-playing' && (
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', padding: '0 8px' }}>
                  Hide track info
                  <ToggleSwitch checked={hideTrackInfo} onChange={setHideTrackInfo} title="Hide the track info over the TV visualizer" />
                </label>
              )}
            </div>
          )}

          {status.state === 'error' && (
            <div style={{ fontSize: '12px', color: 'var(--color-secondary)' }}>
              Casting stopped: {status.error}
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
              Mute this Mac while casting
              <ToggleSwitch checked={muteLocal} onChange={setMuteLocal} title="Mute this Mac while casting" />
            </label>
            <div style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>
              The TV or speaker plays the tracks itself in MCO&apos;s app, with your effects and siren. On a TV,
              pick above whether it shows the track&apos;s details or a visualizer.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
