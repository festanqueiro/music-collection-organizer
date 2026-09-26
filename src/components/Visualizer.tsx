// src/components/Visualizer.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { VISUALIZER_THEMES, VisualizerEngine, getVisualizerTheme, type ThemeInstance } from 'threejs-visualisers'
import { TV_VISUALIZERS, getTvVisualizer, isTvVisualizer } from '../cast/tvVisualizers'
import { getActiveAnalyser } from '../audio/audioAnalysis'
import { useCollectionStore } from '../state/store'
import { isCastActive } from '../cast/castSession'
import { decodeHtmlEntities } from '../format'
import { ToggleSwitch } from './ToggleSwitch'
import type { Track } from '../types'

const UI_HIDE_DELAY_MS = 2500

// Full-screen audio-reactive overlay. This shell owns fullscreen, the
// render loop and the theme picker; the themes and VisualizerEngine
// (renderer + audio analysis) come from the threejs-visualisers package
// (github.com/festanqueiro/threejs-visualisers).
//
// While casting the visualizer to a TV, nothing is rendered here — the
// TV's picture comes from its own off-screen renderer (src/cast/), so this
// shows just the controls (theme, options, track info), which drive it.
export function Visualizer({ track, onClose }: { track: Track | null; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const [uiVisible, setUiVisible] = useState(true)
  const themeId = useCollectionStore((s) => s.visualizerTheme)
  const setThemeId = useCollectionStore((s) => s.setVisualizerTheme)
  const castThemeId = useCollectionStore((s) => s.castVisualizerTheme)
  const setCastThemeId = useCollectionStore((s) => s.setCastVisualizerTheme)
  const hideTrackInfo = useCollectionStore((s) => s.visualizerHideTrackInfo)
  const setHideTrackInfo = useCollectionStore((s) => s.setVisualizerHideTrackInfo)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const castStatus = useCollectionStore((s) => s.castStatus)
  // Casting to a screen in MCO's own app: opening the visualizer shows it
  // on the TV (see receiverSync.ts), rendered there.
  const castingToScreen = isCastActive(castStatus) && castStatus.mode === 'receiver' && !castStatus.audioOnly
  const showUi = uiVisible || castingToScreen

  // The theme this Mac renders, and the one the picker shows as chosen:
  // while casting to a screen the picker offers only the TV's own themes
  // (drawn without the GPU), otherwise only this Mac's.
  const desktopThemeId = getVisualizerTheme(themeId).id
  const activeThemeId = castingToScreen ? castThemeId : desktopThemeId
  // The themes on offer, and how to pick one.
  const pickerThemes: { id: typeof activeThemeId; name: string }[] = castingToScreen ? TV_VISUALIZERS : VISUALIZER_THEMES
  const pickTheme = (id: string) => {
    if (isTvVisualizer(id)) setCastThemeId(id)
    else setThemeId(id as typeof themeId)
  }
  const pickThemeRef = useRef(pickTheme)
  pickThemeRef.current = pickTheme
  const pickerThemesRef = useRef(pickerThemes)
  pickerThemesRef.current = pickerThemes

  // The active theme's options (e.g. Sound System's Colours/Background) —
  // a stored choice that's no longer valid falls back to the first value.
  const activeTheme = isTvVisualizer(activeThemeId) ? getTvVisualizer(activeThemeId) : getVisualizerTheme(activeThemeId)
  const storedOptions = useCollectionStore((s) => s.visualizerThemeOptions[activeThemeId])
  const setThemeOption = useCollectionStore((s) => s.setVisualizerThemeOption)
  const themeOptions = activeTheme.options ?? []
  const selectedOptions = useMemo(
    () =>
      Object.fromEntries(
        themeOptions.map((option) => {
          const stored = storedOptions?.[option.id]
          return [option.id, option.values.some((v) => v.id === stored) ? stored! : option.values[0].id]
        }),
      ),
    [themeOptions, storedOptions]
  )
  const selectedOptionsRef = useRef(selectedOptions)
  selectedOptionsRef.current = selectedOptions
  const instanceRef = useRef<ThemeInstance | null>(null)
  const fpsRef = useRef<HTMLSpanElement>(null)
  // Set by the renderer effect; the theme effect swaps what it renders.
  const rendererRef = useRef<VisualizerEngine | null>(null)

  // Fullscreen + exit handling. Esc while fullscreen is swallowed by the
  // browser to exit fullscreen (no keydown reaches us), so leaving
  // fullscreen by any means is treated as closing the visualizer.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let enteredFullscreen = false
    function onFullscreenChange() {
      if (document.fullscreenElement) enteredFullscreen = true
      else if (enteredFullscreen) onCloseRef.current()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      // 1..N pick a theme directly.
      const index = Number(e.key) - 1
      const themes = pickerThemesRef.current
      if (Number.isInteger(index) && index >= 0 && index < themes.length) pickThemeRef.current(themes[index].id)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('keydown', onKeyDown)
    // Just the controls while casting — no need to take over the screen.
    if (!castingToScreen) {
      container.requestFullscreen().catch(() => {
        // Not fatal — the overlay still covers the whole window.
      })
    }
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('keydown', onKeyDown)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [castingToScreen])

  // The theme picker, hide switch and close button fade out (and the
  // cursor hides) after a moment without mouse movement. Track info is
  // separate — it stays up unless visualizerHideTrackInfo is on.
  useEffect(() => {
    let timeout = setTimeout(() => setUiVisible(false), UI_HIDE_DELAY_MS)
    function onMouseMove() {
      setUiVisible(true)
      clearTimeout(timeout)
      timeout = setTimeout(() => setUiVisible(false), UI_HIDE_DELAY_MS)
    }
    window.addEventListener('mousemove', onMouseMove)
    return () => {
      clearTimeout(timeout)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [])

  // Renderer, bloom and render loop — created once for the overlay's
  // lifetime (or until casting starts); themes are swapped underneath it.
  useEffect(() => {
    const host = canvasHostRef.current
    if (!host || castingToScreen) return

    const engine = new VisualizerEngine({
      width: host.clientWidth,
      height: host.clientHeight,
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      // Re-read every frame: Player swaps the analyser per track.
      analyser: getActiveAnalyser,
    })
    host.appendChild(engine.canvas)
    rendererRef.current = engine

    const resizeObserver = new ResizeObserver(() => engine.setSize(host.clientWidth, host.clientHeight))
    resizeObserver.observe(host)

    let raf = 0
    // FPS readout: written straight to the DOM once a second rather than
    // through React state, so it doesn't re-render the overlay.
    let fpsFrames = 0
    let fpsSince = performance.now()

    function tick() {
      raf = requestAnimationFrame(tick)
      const nowMs = performance.now()
      fpsFrames++
      if (nowMs - fpsSince >= 1000) {
        if (fpsRef.current) fpsRef.current.textContent = `${Math.round((fpsFrames * 1000) / (nowMs - fpsSince))} fps`
        fpsFrames = 0
        fpsSince = nowMs
      }
      engine.render(nowMs)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      rendererRef.current = null
      engine.dispose()
    }
  }, [castingToScreen])

  // Declared after the renderer effect so it runs after it on mount.
  useEffect(() => {
    if (castingToScreen) return
    const instance = getVisualizerTheme(desktopThemeId).create()
    for (const [optionId, valueId] of Object.entries(selectedOptionsRef.current)) instance.setOption?.(optionId, valueId)
    rendererRef.current?.setTheme(instance)
    instanceRef.current = instance
    return () => {
      instanceRef.current = null
      instance.dispose()
    }
  }, [desktopThemeId, castingToScreen])

  // Changing an option updates the live instance in place. Themes make
  // re-applying an unchanged value cheap, so this just re-sends them all.
  useEffect(() => {
    for (const [optionId, valueId] of Object.entries(selectedOptions)) instanceRef.current?.setOption?.(optionId, valueId)
  }, [selectedOptions])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: castingToScreen ? 'rgba(0,0,0,0.85)' : '#000',
        cursor: showUi ? 'default' : 'none',
      }}
    >
      <div ref={canvasHostRef} style={{ position: 'absolute', inset: 0 }} />
      {castingToScreen && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            color: '#fff',
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '48px', opacity: 0.8 }}>
            cast_connected
          </span>
          <div style={{ fontSize: '20px', fontWeight: 500 }}>Visualizer showing on {castStatus.deviceName}</div>
          <div style={{ fontSize: '13px', opacity: 0.6 }}>
            Changes here show up on the TV after a few seconds.
          </div>
        </div>
      )}
      {track && !castingToScreen && (
        <div
          style={{
            position: 'absolute',
            top: '24px',
            left: '28px',
            // Leaves room for the controls on the right.
            maxWidth: 'max(200px, calc(100% - 920px))',
            color: '#fff',
            opacity: hideTrackInfo ? 0 : 1,
            transition: 'opacity 400ms ease',
            pointerEvents: 'none',
            textShadow: '0 1px 8px rgba(0,0,0,0.8)',
          }}
        >
          <div style={{ fontSize: '22px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {decodeHtmlEntities(track.title ?? track.filename)}
          </div>
          {track.artist && (
            <div style={{ fontSize: '14px', opacity: 0.7, marginTop: '4px' }}>{decodeHtmlEntities(track.artist)}</div>
          )}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: '24px',
          right: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          color: '#fff',
          opacity: showUi ? 1 : 0,
          transition: 'opacity 600ms ease',
          pointerEvents: showUi ? 'auto' : 'none',
          textShadow: '0 1px 8px rgba(0,0,0,0.8)',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
          Hide track info
          <ToggleSwitch
            checked={hideTrackInfo}
            onChange={(checked) => {
              setHideTrackInfo(checked)
              // Otherwise the focused switch swallows Space (play/pause).
              ;(document.activeElement as HTMLElement | null)?.blur()
            }}
            title="Hide track info"
          />
        </label>
        <div
          style={{
            display: 'flex',
            gap: '4px',
            padding: '4px',
            borderRadius: '20px',
            // Dark, so the labels stay readable over bright (daylight) scenes.
            background: 'rgba(0,0,0,0.35)',
          }}
        >
          {pickerThemes.map((theme, i) => (
            <button
              key={theme.id}
              onClick={(e) => {
                pickTheme(theme.id)
                // Otherwise the focused button swallows Space (play/pause).
                e.currentTarget.blur()
              }}
              title={castingToScreen ? `${theme.name} (${i + 1}) — drawn without the GPU, for the TV` : `${theme.name} (${i + 1})`}
              style={{
                border: 'none',
                borderRadius: '16px',
                padding: '6px 14px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#fff',
                background: theme.id === activeThemeId ? 'rgba(255,255,255,0.25)' : 'transparent',
              }}
            >
              {theme.name}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          title="Close visualizer (Esc)"
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            cursor: 'pointer',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <span
        ref={fpsRef}
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '28px',
          padding: '4px 10px',
          borderRadius: '12px',
          background: 'rgba(0,0,0,0.35)',
          color: '#fff',
          fontSize: '12px',
          fontVariantNumeric: 'tabular-nums',
          opacity: showUi && !castingToScreen ? 1 : 0,
          transition: 'opacity 600ms ease',
          pointerEvents: 'none',
        }}
      >
        — fps
      </span>
      {themeOptions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '28px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '8px',
            color: '#fff',
            opacity: showUi ? 1 : 0,
            transition: 'opacity 600ms ease',
            pointerEvents: showUi ? 'auto' : 'none',
          }}
        >
          {themeOptions.map((option) => (
            <div key={option.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>{option.name}</span>
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  padding: '4px',
                  borderRadius: '20px',
                  background: 'rgba(0,0,0,0.35)',
                }}
              >
                {option.values.map((value) => (
                  <button
                    key={value.id}
                    onClick={(e) => {
                      setThemeOption(activeThemeId, option.id, value.id)
                      // Otherwise the focused button swallows Space (play/pause).
                      e.currentTarget.blur()
                    }}
                    style={{
                      border: 'none',
                      borderRadius: '16px',
                      padding: '6px 14px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#fff',
                      background: value.id === selectedOptions[option.id] ? 'rgba(255,255,255,0.3)' : 'transparent',
                    }}
                  >
                    {value.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
