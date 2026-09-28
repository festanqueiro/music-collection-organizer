// src/components/SecondScreenButton.tsx
//
// Player-bar button + popover for "Show on a screen"
// (docs/features/second-screen.md): pick a display (an Apple TV used as an
// AirPlay display, a projector, a monitor — or a window here), what it shows
// (the now-playing screen or a visualizer theme), track info and the Visual
// delay. Lit while showing.
import { useEffect, useRef, useState } from 'react'
import { VISUALIZER_THEMES, getVisualizerTheme, type VisualizerThemeId } from 'threejs-visualisers'
import { useCollectionStore } from '../state/store'
import { ToggleSwitch } from './ToggleSwitch'
import { VisualDelayControl } from './VisualDelayControl'
import { contextMenuIconStyle, contextMenuItemStyle } from './contextMenuStyles'
import { barButtonStyle } from './playerBarStyles'
import type { ScreenTarget } from '../types'

const POPOVER_WIDTH = 320
// The "Show" choice for the now-playing screen, next to the themes.
const NOW_PLAYING = 'now-playing'

export function SecondScreenButton() {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const target = useCollectionStore((s) => s.screenTarget)
  const setTarget = useCollectionStore((s) => s.setScreenTarget)
  const displays = useCollectionStore((s) => s.screenDisplays)
  const themeId = getVisualizerTheme(useCollectionStore((s) => s.screenTheme)).id
  const setTheme = useCollectionStore((s) => s.setScreenTheme)
  const nowPlaying = useCollectionStore((s) => s.screenNowPlaying)
  const setNowPlaying = useCollectionStore((s) => s.setScreenNowPlaying)
  const hideTrackInfo = useCollectionStore((s) => s.screenHideTrackInfo)
  const setHideTrackInfo = useCollectionStore((s) => s.setScreenHideTrackInfo)
  const otherDisplays = displays.filter((d) => !d.hasMainWindow)
  const showingOn = target === 'window' ? 'in a window' : target !== null ? `on ${displays.find((d) => d.id === target)?.label ?? 'a display'}` : null

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (!popoverRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false)
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

  const choices: { target: ScreenTarget; name: string; detail: string; icon: string }[] = [
    ...otherDisplays.map((d) => ({
      target: d.id as ScreenTarget,
      name: d.label,
      detail: `${d.width}×${d.height}${d.hz ? ` · ${d.hz} Hz` : ''}`,
      icon: d.internal ? 'laptop_mac' : 'tv',
    })),
    { target: 'window', name: 'A window on this display', detail: 'To try it, or to drag it somewhere', icon: 'select_window' },
  ]
  const sectionLabel = { fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-dim)' } as const

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        title={showingOn ? `Showing ${showingOn}` : 'Show the visualizer on another screen (Apple TV, projector, monitor)'}
        style={barButtonStyle(open, target !== null)}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
          {target !== null ? 'connected_tv' : 'tv'}
        </span>
        Screen
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 500, flex: 1 }}>{showingOn ? `Showing ${showingOn}` : 'Show on a screen'}</span>
            {target !== null && <button onClick={() => setTarget(null)}>Stop</button>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {choices.map((choice) => {
              const selected = target === choice.target
              return (
                <button
                  key={String(choice.target)}
                  onClick={(e) => {
                    setTarget(choice.target)
                    e.currentTarget.blur()
                  }}
                  style={{
                    ...contextMenuItemStyle,
                    borderRadius: '6px',
                    ...(selected ? { background: 'var(--color-surface)', color: 'var(--color-accent)' } : {}),
                  }}
                >
                  <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                    {choice.icon}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{choice.name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>{choice.detail}</span>
                  </span>
                  {selected && (
                    <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                      check
                    </span>
                  )}
                </button>
              )
            })}
            {otherDisplays.length === 0 && (
              <div style={{ fontSize: '11px', color: 'var(--color-text-dim)', padding: '4px 8px' }}>
                No other display. For an Apple TV: Control Center → Screen Mirroring → the Apple TV → Use As Separate
                Display. A projector or monitor shows up when it's plugged in.
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={sectionLabel}>On the screen</div>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', gap: '8px' }}>
              Show
              <select
                value={nowPlaying ? NOW_PLAYING : themeId}
                onChange={(e) => {
                  const value = e.target.value
                  setNowPlaying(value === NOW_PLAYING)
                  if (value !== NOW_PLAYING) setTheme(value as VisualizerThemeId)
                }}
                style={{ fontSize: '12px' }}
              >
                <option value={NOW_PLAYING}>Now playing (track details)</option>
                <optgroup label="Visualizer">
                  {VISUALIZER_THEMES.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            {!nowPlaying && (
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                Hide track info
                <ToggleSwitch checked={hideTrackInfo} onChange={setHideTrackInfo} title="Hide the track info on the screen" />
              </label>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={sectionLabel}>Visual delay</div>
            <VisualDelayControl />
            <div style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>
              If the sound plays on the Apple TV (AirPlay, ~1–2 s late), hold the visuals back to match. Also in
              Settings → Audio.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
