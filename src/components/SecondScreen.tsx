// src/components/SecondScreen.tsx
//
// "Show on a screen" (docs/features/second-screen.md, ADR 0046): while the
// store has a screen target, opens a same-origin child window (the main
// process puts it on that display, full screen) and renders the visualizer
// — or the now-playing screen (SecondScreenNowPlaying.tsx) — into it with
// a portal, sharing this page's audio engine and store, so it reacts with
// no lag. It draws from the engine's visual tap, held back by the Visual
// delay (ADR 0047), and the track info changes after the same delay.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FrameLimiter, VisualizerEngine, getVisualizerTheme, type ThemeInstance } from 'threejs-visualisers'
import { useCollectionStore } from '../state/store'
import { getAudioEngine } from '../audio/audioEngine'
import { decodeHtmlEntities } from '../format'
import { SecondScreenNowPlaying } from './SecondScreenNowPlaying'
import type { Track } from '../types'

// Copies the page's styles (fonts, theme variables) into the child, with
// absolute URLs (its about:blank base resolves nothing on its own).
function adoptStyles(child: Window): void {
  for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
    const copy = child.document.importNode(node, true) as HTMLElement
    if (node instanceof HTMLLinkElement) (copy as HTMLLinkElement).href = node.href
    child.document.head.appendChild(copy)
  }
  for (const attr of document.documentElement.attributes) child.document.documentElement.setAttribute(attr.name, attr.value)
}

export function SecondScreen() {
  const target = useCollectionStore((s) => s.screenTarget)
  const [screen, setScreen] = useState<{ child: Window; root: HTMLElement } | null>(null)

  useEffect(() => {
    if (target === null) return
    const store = useCollectionStore.getState()
    // A fresh name each time, so a window still closing isn't reused.
    const child = window.open('', `mco-screen-${Date.now()}`, `display=${target}`)
    if (!child) {
      store.showToast("Couldn't open the screen")
      store.setScreenTarget(null)
      return
    }
    child.document.title = 'MCO Screen'
    adoptStyles(child)
    Object.assign(child.document.body.style, { margin: '0', background: '#000', overflow: 'hidden', cursor: 'none' })
    const root = child.document.createElement('div')
    Object.assign(root.style, { position: 'fixed', inset: '0' })
    child.document.body.appendChild(root)
    setScreen({ child, root })
    // Closed from its side: Cmd+W, the display unplugged, the Apple TV gone.
    const watch = setInterval(() => {
      if (!child.closed) return
      clearInterval(watch)
      const current = useCollectionStore.getState()
      if (current.screenTarget === target) {
        current.setScreenTarget(null)
        current.showToast('The screen was closed')
      }
    }, 500)
    return () => {
      clearInterval(watch)
      setScreen(null)
      if (!child.closed) child.close()
    }
  }, [target])

  // Its display went away (unplugged, the Apple TV off): stop showing.
  const displays = useCollectionStore((s) => s.screenDisplays)
  useEffect(() => {
    if (typeof target !== 'number' || displays.length === 0 || displays.some((d) => d.id === target)) return
    const store = useCollectionStore.getState()
    store.setScreenTarget(null)
    store.showToast("The screen's display was disconnected")
  }, [target, displays])

  const nowPlaying = useCollectionStore((s) => s.screenNowPlaying)
  if (!screen) return null
  return createPortal(
    nowPlaying ? <SecondScreenNowPlaying child={screen.child} /> : <VisualizerView child={screen.child} />,
    screen.root,
  )
}

// A value that follows `value` `delayMs` late (at once when 0).
function useDelayed<T>(value: T, delayMs: number): T {
  const [shown, setShown] = useState(value)
  useEffect(() => {
    if (delayMs <= 0) {
      setShown(value)
      return
    }
    const timer = setTimeout(() => setShown(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return delayMs <= 0 ? value : shown
}

function VisualizerView({ child }: { child: Window }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<VisualizerEngine | null>(null)
  const instanceRef = useRef<ThemeInstance | null>(null)
  const themeId = getVisualizerTheme(useCollectionStore((s) => s.screenTheme)).id
  const storedOptions = useCollectionStore((s) => s.visualizerThemeOptions[themeId])
  const hideTrackInfo = useCollectionStore((s) => s.screenHideTrackInfo)
  const fps = useCollectionStore((s) => s.visualizerFps)
  const visualDelayMs = useCollectionStore((s) => s.visualDelayMs)
  const limiterRef = useRef(new FrameLimiter(fps))
  useEffect(() => {
    limiterRef.current.fps = fps
  }, [fps])

  const selectedOptions = useMemo(() => {
    const options = getVisualizerTheme(themeId).options ?? []
    return Object.fromEntries(
      options.map((option) => {
        const stored = storedOptions?.[option.id]
        return [option.id, option.values.some((v) => v.id === stored) ? stored! : option.values[0].id]
      })
    )
  }, [themeId, storedOptions])
  const selectedOptionsRef = useRef(selectedOptions)
  selectedOptionsRef.current = selectedOptions

  // The engine and the render loop, on the child's own animation frames and
  // size (its display's refresh rate and resolution).
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const engine = new VisualizerEngine({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      pixelRatio: Math.min(child.devicePixelRatio, 2),
      analyser: getAudioEngine().getVisualAnalyser(),
    })
    Object.assign(engine.canvas.style, { display: 'block', width: '100%', height: '100%' })
    host.appendChild(engine.canvas)
    engineRef.current = engine
    // The child's own ResizeObserver (not in TypeScript's Window type).
    const ChildResizeObserver = (child as Window & { ResizeObserver: typeof ResizeObserver }).ResizeObserver
    const resize = new ChildResizeObserver(() => engine.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight)))
    resize.observe(host)
    let frame = 0
    // This page's clock, not the child's rAF timestamp: the child's clock
    // starts when it opens, so the engine (created on this page's clock)
    // would see time jump backwards and its smoothing blow up (a black or
    // white screen).
    const tick = () => {
      frame = child.requestAnimationFrame(tick)
      const now = performance.now()
      if (limiterRef.current.shouldRender(now)) engine.render(now)
    }
    frame = child.requestAnimationFrame(tick)
    return () => {
      child.cancelAnimationFrame(frame)
      resize.disconnect()
      engineRef.current = null
      engine.dispose()
    }
  }, [child])

  // Declared after the engine's effect, so it runs after it on mount.
  useEffect(() => {
    const instance = getVisualizerTheme(themeId).create()
    for (const [optionId, valueId] of Object.entries(selectedOptionsRef.current)) instance.setOption?.(optionId, valueId)
    engineRef.current?.setTheme(instance)
    instanceRef.current = instance
    return () => {
      instanceRef.current = null
      instance.dispose()
    }
  }, [themeId])

  useEffect(() => {
    for (const [optionId, valueId] of Object.entries(selectedOptions)) instanceRef.current?.setOption?.(optionId, valueId)
  }, [selectedOptions])

  // The track info follows the music as the room hears it.
  const playlist = useCollectionStore((s) => s.playlist)
  const tracks = useCollectionStore((s) => s.tracks)
  const liveCurrentId = playlist[0] ?? null
  const liveNextId = playlist[1] ?? null
  const currentId = useDelayed(liveCurrentId, visualDelayMs)
  const nextId = useDelayed(liveNextId, visualDelayMs)
  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks])
  const current = currentId !== null ? (byId.get(currentId) ?? null) : null
  const next = nextId !== null ? (byId.get(nextId) ?? null) : null

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      {current && !hideTrackInfo && <TrackInfo track={current} next={next} />}
    </div>
  )
}

function TrackInfo({ track, next }: { track: Track; next: Track | null }) {
  const meta = next ? [`Next: ${decodeHtmlEntities(next.title ?? next.filename)}${next.artist ? ` — ${decodeHtmlEntities(next.artist)}` : ''}`] : []
  return (
    <div
      style={{
        position: 'absolute',
        left: '4vw',
        right: '4vw',
        bottom: '5vh',
        pointerEvents: 'none',
        textShadow: '0 0.1vw 1.2vw rgba(0,0,0,0.85)',
      }}
    >
      <div style={{ fontSize: '3.4vw', fontWeight: 700, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {decodeHtmlEntities(track.title ?? track.filename)}
      </div>
      {track.artist && (
        <div style={{ fontSize: '2vw', opacity: 0.8, marginTop: '0.6vh', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {decodeHtmlEntities(track.artist)}
        </div>
      )}
      {meta.length > 0 && (
        <div style={{ fontSize: '1.3vw', opacity: 0.6, marginTop: '1vh', fontVariantNumeric: 'tabular-nums' }}>{meta.join('  ·  ')}</div>
      )}
    </div>
  )
}
