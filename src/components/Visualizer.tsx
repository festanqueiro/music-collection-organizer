// src/components/Visualizer.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { getActiveAnalyser, computeBands, BeatDetector, follow } from '../audio/audioAnalysis'
import { availableThemes, getVisualizerTheme } from '../visualizer/themes'
import { trackTagNames } from '../visualizer/tagMatch'
import type { AudioFrame, ThemeInstance } from '../visualizer/types'
import { useCollectionStore } from '../state/store'
import { decodeHtmlEntities } from '../format'
import { ToggleSwitch } from './ToggleSwitch'
import type { Track } from '../types'

const UI_HIDE_DELAY_MS = 2500

// Full-screen audio-reactive overlay. This shell owns everything shared
// across themes — fullscreen, the WebGL renderer + bloom, the render
// loop, and per-frame audio analysis (bands, beats, hue drift) — and
// hands each frame to the active theme (src/visualizer/themes/), which
// owns its own scene and camera. Reads the current track's AnalyserNode
// every frame (getActiveAnalyser) rather than capturing one, so it keeps
// running seamlessly across track changes and idles gently when nothing
// is playing.
export function Visualizer({ track, onClose }: { track: Track | null; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const [uiVisible, setUiVisible] = useState(true)
  const themeId = useCollectionStore((s) => s.visualizerTheme)
  const setThemeId = useCollectionStore((s) => s.setVisualizerTheme)
  const regularThemeId = useCollectionStore((s) => s.visualizerRegularTheme)
  const trackTags = useCollectionStore((s) => s.trackTags)
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const hideTrackInfo = useCollectionStore((s) => s.visualizerHideTrackInfo)
  const setHideTrackInfo = useCollectionStore((s) => s.setVisualizerHideTrackInfo)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Special themes (e.g. Sound System for Dub) only show for tracks whose
  // tags qualify. The chosen theme is kept as the preference either way:
  // on a track that doesn't qualify, the last regular theme plays instead,
  // and the special one comes back on the next track that does.
  const themes = useMemo(
    () => availableThemes(track ? trackTagNames(track.id, trackTags, genres, subgenres) : []),
    [track, trackTags, genres, subgenres]
  )
  const activeThemeId = themes.some((t) => t.id === themeId)
    ? themeId
    : themes.some((t) => t.id === regularThemeId)
      ? regularThemeId
      : themes[0].id
  const themesRef = useRef(themes)
  themesRef.current = themes

  // The active theme's variant (e.g. Sound System's colour scheme) — a
  // stored choice that's no longer a valid variant falls back to the first.
  const activeTheme = getVisualizerTheme(activeThemeId)
  const storedVariantId = useCollectionStore((s) => s.visualizerThemeVariants[activeThemeId])
  const setThemeVariant = useCollectionStore((s) => s.setVisualizerThemeVariant)
  const variants = activeTheme.variants ?? []
  const variantId = variants.some((v) => v.id === storedVariantId) ? storedVariantId : variants[0]?.id
  const variantIdRef = useRef(variantId)
  variantIdRef.current = variantId
  const instanceRef = useRef<ThemeInstance | null>(null)
  // Set by the renderer effect; the theme effect swaps what it renders.
  const rendererRef = useRef<{ renderPass: RenderPass; setTheme: (instance: ThemeInstance) => void } | null>(null)

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
      // 1..N pick a theme directly, numbered over the available ones.
      const index = Number(e.key) - 1
      const available = themesRef.current
      if (Number.isInteger(index) && index >= 0 && index < available.length) {
        useCollectionStore.getState().setVisualizerTheme(available[index].id)
      }
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

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, host.clientHeight)
    renderer.setClearColor(0x000000, 1)
    renderer.shadowMap.type = THREE.PCFShadowMap
    host.appendChild(renderer.domElement)

    // The composer renders into its own off-screen targets, so the
    // renderer's `antialias` never applies — without a multisampled
    // target every edge is aliased and crawls as the camera drifts.
    // Sized in device pixels; later composer.setSize() calls (CSS pixels)
    // are scaled by the renderer's pixel ratio.
    const pixelRatio = renderer.getPixelRatio()
    const composer = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(host.clientWidth * pixelRatio, host.clientHeight * pixelRatio, {
        samples: 4,
        type: THREE.HalfFloatType,
      }),
    )
    const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera())
    composer.addPass(renderPass)
    const bloom = new UnrealBloomPass(new THREE.Vector2(host.clientWidth, host.clientHeight), 1, 0.5, 0.3)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

    let theme: ThemeInstance | null = null
    function fitCamera() {
      if (!host || !theme) return
      theme.camera.aspect = host.clientWidth / host.clientHeight
      theme.camera.updateProjectionMatrix()
    }
    function setTheme(instance: ThemeInstance) {
      theme = instance
      renderer.shadowMap.enabled = !!instance.shadows
      renderer.toneMapping = instance.toneMapping ?? THREE.NoToneMapping
      renderPass.scene = instance.scene
      renderPass.camera = instance.camera
      fitCamera()
    }
    rendererRef.current = { renderPass, setTheme }

    const resizeObserver = new ResizeObserver(() => {
      renderer.setSize(host.clientWidth, host.clientHeight)
      composer.setSize(host.clientWidth, host.clientHeight)
      fitCamera()
    })
    resizeObserver.observe(host)

    const beatDetector = new BeatDetector()
    const frame: AudioFrame = {
      t: 0,
      dt: 0,
      bass: 0,
      mid: 0,
      high: 0,
      energy: 0,
      beat: false,
      flash: 0,
      hue: Math.random(),
      freq: new Uint8Array(0),
      sampleRate: 48000,
    }
    let freq: Uint8Array<ArrayBuffer> = new Uint8Array(0)
    const silent = new Uint8Array(0)
    let lastMs = performance.now()
    let raf = 0

    function tick() {
      raf = requestAnimationFrame(tick)
      const nowMs = performance.now()
      frame.dt = Math.min(0.05, (nowMs - lastMs) / 1000)
      frame.t = nowMs / 1000
      lastMs = nowMs

      const analyser = getActiveAnalyser()
      let bands = { bass: 0, mid: 0, high: 0 }
      if (analyser) {
        if (freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(freq)
        frame.freq = freq
        frame.sampleRate = analyser.context.sampleRate
        bands = computeBands(freq, frame.sampleRate)
      } else {
        frame.freq = silent
      }
      frame.bass = follow(frame.bass, bands.bass)
      frame.mid = follow(frame.mid, bands.mid)
      frame.high = follow(frame.high, bands.high)
      frame.energy = (frame.bass + frame.mid + frame.high) / 3
      frame.beat = beatDetector.update(bands.bass, nowMs)
      if (frame.beat) {
        frame.flash = 1
        frame.hue = (frame.hue + 0.06) % 1
      }
      frame.flash = Math.max(0, frame.flash - frame.dt * 3)
      frame.hue = (frame.hue + frame.dt * 0.01) % 1

      if (!theme) return
      bloom.strength = theme.update(frame)
      composer.render()
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      rendererRef.current = null
      composer.dispose()
      bloom.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  // Declared after the renderer effect so it runs after it on mount.
  useEffect(() => {
    const instance = getVisualizerTheme(activeThemeId).create()
    if (variantIdRef.current) instance.setVariant?.(variantIdRef.current)
    rendererRef.current?.setTheme(instance)
    instanceRef.current = instance
    return () => {
      instanceRef.current = null
      instance.dispose()
    }
  }, [activeThemeId])

  // Switching variant recolours the live instance in place.
  useEffect(() => {
    if (variantId) instanceRef.current?.setVariant?.(variantId)
  }, [variantId])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: '#000',
        cursor: uiVisible ? 'default' : 'none',
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
            maxWidth: 'calc(100% - 520px)',
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
          opacity: uiVisible ? 1 : 0,
          transition: 'opacity 600ms ease',
          pointerEvents: uiVisible ? 'auto' : 'none',
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
          {themes.map((theme, i) => (
            <button
              key={theme.id}
              onClick={(e) => {
                setThemeId(theme.id)
                // Otherwise the focused button swallows Space (play/pause).
                e.currentTarget.blur()
              }}
              title={`${theme.name} (${i + 1})`}
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
      {variants.length > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '28px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#fff',
            opacity: uiVisible ? 1 : 0,
            transition: 'opacity 600ms ease',
            pointerEvents: uiVisible ? 'auto' : 'none',
          }}
        >
          <span style={{ fontSize: '13px', textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>Colours</span>
          <div
            style={{
              display: 'flex',
              gap: '4px',
              padding: '4px',
              borderRadius: '20px',
              background: 'rgba(0,0,0,0.35)',
            }}
          >
            {variants.map((variant) => (
              <button
                key={variant.id}
                onClick={(e) => {
                  setThemeVariant(activeThemeId, variant.id)
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
                  background: variant.id === variantId ? 'rgba(255,255,255,0.3)' : 'transparent',
                }}
              >
                {variant.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
