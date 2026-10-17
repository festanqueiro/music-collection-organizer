// src/components/useVisualizerEngine.ts
import { useEffect, useRef, type RefObject } from 'react'
import { FrameLimiter, VisualizerEngine, getVisualizerTheme, type ThemeInstance, type VisualizerQuality, type VisualizerThemeId } from 'threejs-visualisers'
import { getAudioEngine } from '../audio/audioEngine'
import { useCollectionStore } from '../state/store'
import { EngineQuality } from './visualizerQuality'

// A threejs-visualisers engine rendering `themeId` into `hostRef`, shared by
// the full-screen Visualizer and the second screen: the canvas, its size,
// the render loop (capped at the stored frame rate), the stored quality,
// and the theme instance with its options applied in place.
//
// `win` is the window the host lives in — the second screen's child window
// has its own animation frames (its display's refresh rate), resolution
// and ResizeObserver.
export function useVisualizerEngine({
  hostRef,
  win,
  themeId,
  options,
  onFrame,
  onQualityChange,
}: {
  hostRef: RefObject<HTMLDivElement | null>
  win: Window
  themeId: VisualizerThemeId
  options: Record<string, string>
  // After every frame rendered (e.g. an fps readout).
  onFrame?: (nowMs: number) => void
  // The quality in use, including Auto stepping down.
  onQualityChange?: (quality: VisualizerQuality) => void
}): void {
  const fps = useCollectionStore((s) => s.visualizerFps)
  const quality = useCollectionStore((s) => s.visualizerQuality)
  const limiterRef = useRef(new FrameLimiter(fps))
  const engineRef = useRef<VisualizerEngine | null>(null)
  const qualityRef = useRef<EngineQuality | null>(null)
  const instanceRef = useRef<ThemeInstance | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  const onQualityChangeRef = useRef(onQualityChange)
  onQualityChangeRef.current = onQualityChange

  useEffect(() => {
    limiterRef.current.fps = fps
    qualityRef.current?.reset()
  }, [fps])
  useEffect(() => {
    qualityRef.current?.set(quality)
  }, [quality])

  // Created once per window; themes are swapped underneath it.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const pixelRatio = Math.min(win.devicePixelRatio, 2)
    const engine = new VisualizerEngine({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      pixelRatio,
      // The engine's visual tap: the music (track + siren), held back by the
      // Visual delay (ADR 0047).
      analyser: getAudioEngine().getVisualAnalyser(),
    })
    Object.assign(engine.canvas.style, { display: 'block', width: '100%', height: '100%' })
    host.appendChild(engine.canvas)
    engineRef.current = engine
    const engineQuality = new EngineQuality(engine, pixelRatio, (q) => onQualityChangeRef.current?.(q))
    engineQuality.set(useCollectionStore.getState().visualizerQuality)
    qualityRef.current = engineQuality
    // The window's own ResizeObserver (a child window's isn't in
    // TypeScript's Window type).
    const WinResizeObserver = (win as Window & { ResizeObserver: typeof ResizeObserver }).ResizeObserver
    const resize = new WinResizeObserver(() => engine.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight)))
    resize.observe(host)
    let frame = 0
    // This page's clock, not the window's rAF timestamp: a child window's
    // clock starts when it opens, so the engine (created on this page's
    // clock) would see time jump backwards and its smoothing blow up (a
    // black or white screen).
    const tick = () => {
      frame = win.requestAnimationFrame(tick)
      const now = performance.now()
      if (!limiterRef.current.shouldRender(now)) return
      engine.render(now)
      engineQuality.frame(now, limiterRef.current.fps)
      onFrameRef.current?.(now)
    }
    frame = win.requestAnimationFrame(tick)
    return () => {
      win.cancelAnimationFrame(frame)
      resize.disconnect()
      qualityRef.current = null
      engineRef.current = null
      engine.dispose()
    }
  }, [hostRef, win])

  // Declared after the engine's effect, so it runs after it on mount.
  useEffect(() => {
    const instance = getVisualizerTheme(themeId).create()
    for (const [optionId, valueId] of Object.entries(optionsRef.current)) instance.setOption?.(optionId, valueId)
    engineRef.current?.setTheme(instance)
    // New shaders compile on the first frames; that isn't stutter.
    qualityRef.current?.reset()
    instanceRef.current = instance
    return () => {
      instanceRef.current = null
      instance.dispose()
    }
  }, [themeId])

  // Changing an option updates the live instance in place. Themes make
  // re-applying an unchanged value cheap, so this just re-sends them all.
  useEffect(() => {
    for (const [optionId, valueId] of Object.entries(options)) instanceRef.current?.setOption?.(optionId, valueId)
  }, [options])
}
