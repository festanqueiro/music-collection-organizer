// src/components/Visualizer.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { FPS_CHOICES, QUALITY_CHOICES, VISUALIZER_THEMES, getVisualizerTheme, type VisualizerQuality } from 'threejs-visualisers'
import { useCollectionStore } from '../state/store'
import { castingToAScreen } from '../cast/castSession'
import { decodeHtmlEntities } from '../format'
import { ToggleSwitch } from './ToggleSwitch'
import { resolveThemeOptions, visibleThemeOptions } from './visualizerQuality'
import { useVisualizerEngine } from './useVisualizerEngine'
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
  // The render loop's frame-rate cap (default 30: the themes look much the
  // same, at about half the GPU load and heat of 60).
  const fps = useCollectionStore((s) => s.visualizerFps)
  const setFps = useCollectionStore((s) => s.setVisualizerFps)
  // Render quality (Auto, Low, High, HD); under Auto, `autoQuality` is the
  // level it has settled on, shown on the picker as "Auto (Low)".
  const quality = useCollectionStore((s) => s.visualizerQuality)
  const setQuality = useCollectionStore((s) => s.setVisualizerQuality)
  const [autoQuality, setAutoQuality] = useState<VisualizerQuality>('high')
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
  const optionSlots = Math.max(
    ...VISUALIZER_THEMES.map((theme) => theme.options?.length ?? 0),
  )
  const selectedOptions = useMemo(() => resolveThemeOptions(activeTheme, storedOptions), [activeTheme, storedOptions])
  // Options that don't apply to the other choices (e.g. Sound System's Mode
  // off the Mais Baixo stack) are hidden; their slot stays empty.
  const themeOptions = visibleThemeOptions(activeTheme, selectedOptions)
  const fpsRef = useRef<HTMLSpanElement>(null)

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

  // FPS readout: written straight to the DOM once a second rather than
  // through React state, so it doesn't re-render the overlay.
  const fpsCount = useRef({ frames: 0, since: performance.now() })
  useVisualizerEngine({
    hostRef: canvasHostRef,
    win: window,
    themeId: activeThemeId,
    options: selectedOptions,
    onQualityChange: setAutoQuality,
    onFrame: (nowMs) => {
      const count = fpsCount.current
      count.frames++
      if (nowMs - count.since < 1000) return
      if (fpsRef.current) fpsRef.current.textContent = `${Math.round((count.frames * 1000) / (nowMs - count.since))} fps`
      count.frames = 0
      count.since = nowMs
    },
  })

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
            // The whole top row: the controls are along the bottom.
            maxWidth: 'calc(100% - 56px)',
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
          // Along the bottom, right of the fps readout, so they never cover
          // the track info; a narrow window wraps them upwards.
          position: 'absolute',
          bottom: '24px',
          left: '120px',
          right: '28px',
          display: 'flex',
          flexWrap: 'wrap-reverse',
          justifyContent: 'flex-end',
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
          shownName={(name) => name.replace(/^\d+\s+/, '')}
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
        <PickerSelect
          label="Frame rate"
          value={String(fps)}
          title="Lower rates keep the GPU cooler"
          options={FPS_CHOICES.map((choice) => ({ id: String(choice.fps), name: choice.label }))}
          onChange={(value) => setFps(Number(value))}
        />
        <PickerSelect
          label="Quality"
          value={quality}
          title="Auto starts at High and steps down if the GPU can't keep up"
          options={[
            { id: 'auto', name: `Auto (${QUALITY_CHOICES.find((c) => c.quality === autoQuality)?.label})` },
            ...QUALITY_CHOICES.map((choice) => ({ id: choice.quality, name: choice.label })),
          ]}
          onChange={(value) => setQuality(value as typeof quality)}
        />
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
  shownName = (name) => name,
}: {
  label: string
  value: string
  options: { id: string; name: string }[]
  onChange: (value: string) => void
  title?: string
  // The chosen option as shown on the pill (the theme menu's names start
  // with their shortcut key, which the pill leaves out).
  shownName?: (name: string) => string
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
        {shownName(options.find((option) => option.id === value)?.name ?? '')}
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
