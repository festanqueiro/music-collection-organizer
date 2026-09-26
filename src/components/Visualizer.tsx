// src/components/Visualizer.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { VISUALIZER_THEMES, VisualizerEngine, getVisualizerTheme, type ThemeInstance } from 'threejs-visualisers'
import { getActiveAnalyser } from '../audio/audioAnalysis'
import { useCollectionStore } from '../state/store'
import { castingToAScreen } from '../cast/castSession'
import { decodeHtmlEntities } from '../format'
import { ToggleSwitch } from './ToggleSwitch'
import type { Track } from '../types'

const UI_HIDE_DELAY_MS = 2500

// Full-screen audio-reactive overlay. This shell owns fullscreen, the
// render loop and the theme picker; the themes and VisualizerEngine
// (renderer + audio analysis) come from the threejs-visualisers package
// (github.com/festanqueiro/threejs-visualisers).
//
// Not used while casting to a screen: what the TV shows is picked in the
// Cast menu instead (see CastButton), and this closes if casting starts.
export function Visualizer({ track, onClose }: { track: Track | null; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const [uiVisible, setUiVisible] = useState(true)
  const themeId = useCollectionStore((s) => s.visualizerTheme)
  const setThemeId = useCollectionStore((s) => s.setVisualizerTheme)
  const hideTrackInfo = useCollectionStore((s) => s.visualizerHideTrackInfo)
  const setHideTrackInfo = useCollectionStore((s) => s.setVisualizerHideTrackInfo)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const castingToScreen = useCollectionStore((s) => castingToAScreen(s.castStatus))
  const showUi = uiVisible

  const activeThemeId = getVisualizerTheme(themeId).id
  const pickTheme = (id: string) => setThemeId(id as typeof themeId)
  const pickThemeRef = useRef(pickTheme)
  pickThemeRef.current = pickTheme

  // The active theme's options (e.g. Sound System's Colours/Background) —
  // a stored choice that's no longer valid falls back to the first value.
  const activeTheme = getVisualizerTheme(activeThemeId)
  const storedOptions = useCollectionStore((s) => s.visualizerThemeOptions[activeThemeId])
  const setThemeOption = useCollectionStore((s) => s.setVisualizerThemeOption)
  const themeOptions = activeTheme.options ?? []
  const optionSlots = Math.max(
    ...VISUALIZER_THEMES.map((theme) => theme.options?.length ?? 0),
  )
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
      const themes = VISUALIZER_THEMES
      if (Number.isInteger(index) && index >= 0 && index < themes.length) pickThemeRef.current(themes[index].id)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('keydown', onKeyDown)
    container.requestFullscreen().catch(() => {
      // Not fatal — the overlay still covers the whole window.
    })
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('keydown', onKeyDown)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [])

  // Casting to a screen started while open: the TV's picture is chosen in
  // the Cast menu, so this steps aside.
  useEffect(() => {
    if (castingToScreen) onCloseRef.current()
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
  // lifetime; themes are swapped underneath it.
  useEffect(() => {
    const host = canvasHostRef.current
    if (!host) return

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
  }, [])

  // Declared after the renderer effect so it runs after it on mount.
  useEffect(() => {
    const instance = getVisualizerTheme(activeThemeId).create()
    for (const [optionId, valueId] of Object.entries(selectedOptionsRef.current)) instance.setOption?.(optionId, valueId)
    rendererRef.current?.setTheme(instance)
    instanceRef.current = instance
    return () => {
      instanceRef.current = null
      instance.dispose()
    }
  }, [activeThemeId])

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
        background: '#000',
        cursor: showUi ? 'default' : 'none',
      }}
    >
      <div ref={canvasHostRef} style={{ position: 'absolute', inset: 0 }} />
      {track && (
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
          gap: '10px',
          color: '#fff',
          opacity: showUi ? 1 : 0,
          transition: 'opacity 600ms ease',
          pointerEvents: showUi ? 'auto' : 'none',
          textShadow: '0 1px 8px rgba(0,0,0,0.8)',
        }}
      >
        <PickerSelect
          label="Visualizer"
          value={activeThemeId}
          title="Keys 1–9 pick one directly"
          options={VISUALIZER_THEMES.map((theme, i) => ({ id: theme.id, name: i < 9 ? `${i + 1}  ${theme.name}` : theme.name }))}
          onChange={pickTheme}
        />
        {/* As many slots as the theme with the most options, unused ones kept
            empty, so switching theme doesn't shift the bar. */}
        {Array.from({ length: optionSlots }, (_, i) => {
          const option = themeOptions[i]
          return option ? (
            <PickerSelect
              key={option.id}
              label={option.name}
              value={selectedOptions[option.id]}
              options={option.values}
              onChange={(value) => setThemeOption(activeThemeId, option.id, value)}
            />
          ) : (
            <div key={`empty-${i}`} style={{ width: PICKER_WIDTH, flexShrink: 0 }} />
          )
        })}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            cursor: 'pointer',
            height: '40px',
            padding: '0 12px',
            borderRadius: '12px',
            background: PICKER_BACKGROUND,
          }}
        >
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
          opacity: showUi ? 1 : 0,
          transition: 'opacity 600ms ease',
          pointerEvents: 'none',
        }}
      >
        — fps
      </span>
    </div>
  )
}

// Dark, so the controls stay readable over bright (daylight) scenes.
const PICKER_BACKGROUND = 'rgba(0,0,0,0.45)'
const PICKER_WIDTH = '150px'

// A labelled dropdown in the visualizer's control bar: the label small
// above the chosen value, a native menu underneath.
function PickerSelect({
  label,
  value,
  options,
  onChange,
  title,
}: {
  label: string
  value: string
  options: { id: string; name: string }[]
  onChange: (value: string) => void
  title?: string
}) {
  return (
    <label
      title={title}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        height: '40px',
        // Fixed, so a longer or shorter choice doesn't shift the bar.
        width: PICKER_WIDTH,
        flexShrink: 0,
        boxSizing: 'border-box',
        padding: '0 30px 0 12px',
        borderRadius: '12px',
        background: PICKER_BACKGROUND,
        cursor: 'pointer',
        textShadow: 'none',
      }}
    >
      <span style={{ fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6 }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {options.find((option) => option.id === value)?.name.replace(/^\d+\s+/, '') ?? ''}
      </span>
      <span
        className="material-symbols-outlined"
        style={{ position: 'absolute', right: '8px', top: '50%', marginTop: '-9px', fontSize: '18px', opacity: 0.7 }}
      >
        expand_more
      </span>
      {/* The native menu, invisible over the whole pill, so a click anywhere
          opens it. */}
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          // Otherwise the focused menu swallows Space (play/pause) and the
          // number keys.
          e.currentTarget.blur()
        }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  )
}
