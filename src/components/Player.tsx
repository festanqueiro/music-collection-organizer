// src/components/Player.tsx
import { useEffect, useRef, useState } from 'react'
import { trackPathToMediaUrl } from '../media'

export function Player({ src, peaks }: { src: string; peaks: number[] | null }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1 fraction of duration played

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      // audio.play() can reject (missing/blocked file, unsupported format) —
      // only flip to "playing" once it actually starts, so a failed play
      // doesn't leave the button showing pause while nothing plays.
      audio.play().then(
        () => setPlaying(true),
        () => setPlaying(false)
      )
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (e.key === ' ') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  function seekToClientX(clientX: number, target: HTMLElement | SVGSVGElement) {
    const audio = audioRef.current
    if (!audio || !audio.duration || !isFinite(audio.duration)) return
    const rect = target.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    audio.currentTime = ratio * audio.duration
    setProgress(ratio)
  }

  return (
    <div>
      <audio
        ref={audioRef}
        src={trackPathToMediaUrl(src)}
        onEnded={() => setPlaying(false)}
        onError={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const audio = e.currentTarget
          if (audio.duration && isFinite(audio.duration)) setProgress(audio.currentTime / audio.duration)
        }}
      />
      <button onClick={toggle}>
        <span className="material-symbols-outlined">{playing ? 'pause' : 'play_arrow'}</span>
      </button>

      {peaks && peaks.length > 0 && (
        <svg
          width="100%"
          height="60"
          viewBox={`0 0 ${peaks.length} 100`}
          preserveAspectRatio="none"
          onClick={(e) => seekToClientX(e.clientX, e.currentTarget)}
          style={{ cursor: 'pointer', display: 'block', marginTop: '8px' }}
        >
          {peaks.map((peak, i) => (
            <rect
              key={i}
              x={i}
              y={50 - peak * 50}
              width={1}
              height={peak * 100}
              fill={i / peaks.length <= progress ? 'var(--color-accent)' : 'var(--color-border)'}
            />
          ))}
          <rect x={progress * peaks.length} y={0} width={Math.max(1, peaks.length / 400)} height={100} fill="var(--color-secondary)" />
        </svg>
      )}
    </div>
  )
}
