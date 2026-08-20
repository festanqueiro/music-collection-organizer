// src/components/Player.tsx
import { useRef, useState } from 'react'

export function Player({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      audio.play()
    }
    setPlaying(!playing)
  }

  return (
    <div>
      <audio ref={audioRef} src={`file://${src}`} onEnded={() => setPlaying(false)} />
      <button onClick={toggle}>
        <span className="material-symbols-outlined">{playing ? 'pause' : 'play_arrow'}</span>
      </button>
      <input
        type="range"
        min={0}
        max={100}
        onChange={(e) => {
          const audio = audioRef.current
          if (audio && audio.duration) audio.currentTime = (Number(e.target.value) / 100) * audio.duration
        }}
      />
    </div>
  )
}
