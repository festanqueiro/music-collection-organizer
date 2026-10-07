// The player's bar counter (docs/features/player.md): which bar the track
// is in, the beat within it, and how far through the 16-bar phrase — from
// the analysed tempo and first beat (src/state/hotCues.ts).
//
// Drawn outside React: an animation-frame loop runs only while the track
// plays and touches the DOM only when the beat changes, so the player isn't
// re-rendered several times a second for it.
import { useEffect, useRef, type RefObject } from 'react'
import { barCounter, PHRASE_BARS } from '../state/hotCues'

const DOT = { width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-border)' }

export function BarCounter({
  audioRef,
  bpm,
  start,
}: {
  audioRef: RefObject<HTMLAudioElement | null>
  bpm: number | null
  // Where the beat grid starts (seconds).
  start: number
}) {
  const labelRef = useRef<HTMLSpanElement>(null)
  const dotsRef = useRef<HTMLSpanElement>(null)
  const fillRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !bpm) return
    let raf = 0
    let shown = ''
    const draw = () => {
      const at = barCounter(audio.currentTime, bpm, start)
      const key = at ? `${at.bar}.${at.beat}` : '–'
      if (key === shown) return
      shown = key
      if (labelRef.current) labelRef.current.textContent = at ? String(at.bar) : '–'
      dotsRef.current?.childNodes.forEach((dot, i) => {
        // The first beat of the bar in the accent colour, the others plain.
        ;(dot as HTMLElement).style.background = !at || i !== at.beat ? 'var(--color-border)' : i === 0 ? 'var(--color-accent)' : 'var(--color-text)'
      })
      if (fillRef.current) fillRef.current.style.width = `${(at?.phrase ?? 0) * 100}%`
    }
    const tick = () => {
      draw()
      raf = requestAnimationFrame(tick)
    }
    const run = () => {
      cancelAnimationFrame(raf)
      if (!audio.paused) raf = requestAnimationFrame(tick)
      else draw()
    }
    audio.addEventListener('play', run)
    audio.addEventListener('pause', run)
    // Seeking while paused still moves the counter.
    audio.addEventListener('seeked', draw)
    run()
    return () => {
      cancelAnimationFrame(raf)
      audio.removeEventListener('play', run)
      audio.removeEventListener('pause', run)
      audio.removeEventListener('seeked', draw)
    }
  }, [audioRef, bpm, start])

  if (!bpm) return null
  return (
    <span
      title={`Bars since the start of the tune (bar 0), the beat in the bar, and progress through the ${PHRASE_BARS}-bar phrase`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--color-text-dim)', marginLeft: '8px', flexShrink: 0 }}
    >
      <span>
        Bar{' '}
        <span ref={labelRef} style={{ color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', display: 'inline-block', minWidth: '22px' }}>
          –
        </span>
      </span>
      <span ref={dotsRef} style={{ display: 'inline-flex', gap: '3px' }}>
        <span style={DOT} />
        <span style={DOT} />
        <span style={DOT} />
        <span style={DOT} />
      </span>
      <span style={{ width: '48px', height: '3px', borderRadius: '2px', background: 'var(--color-border)', overflow: 'hidden' }}>
        <span ref={fillRef} style={{ display: 'block', width: 0, height: '100%', background: 'var(--color-accent)' }} />
      </span>
    </span>
  )
}
