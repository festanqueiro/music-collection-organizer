import { useEffect, useRef, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { trackPathToMediaUrl } from '../media'
import { decodeHtmlEntities, formatDuration } from '../format'
import { formatKey } from '../state/harmonic'
import type { Track } from '../types'

// Headphone pre-listen: a slim bar above the main player that plays the
// cued track on the cue output device (Settings → Audio → Cue output),
// so the next track can be auditioned while the main output keeps
// playing. Deliberately plain: a bare <audio> element with setSinkId —
// no FX graph, no queue, no analysis side effects. Remounted per track
// (keyed in App.tsx).
export function CuePlayer({ track }: { track: Track }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const cueOutputDeviceId = useCollectionStore((s) => s.cueOutputDeviceId)
  const cueVolume = useCollectionStore((s) => s.cueVolume)
  const setCueVolume = useCollectionStore((s) => s.setCueVolume)
  const stopPreview = useCollectionStore((s) => s.stopPreview)
  const keyNotation = useCollectionStore((s) => s.keyNotation)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(track.duration ?? 0)
  const [outputError, setOutputError] = useState<string | null>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const sink = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
    if (typeof sink.setSinkId !== 'function') return
    sink
      .setSinkId(cueOutputDeviceId ?? '')
      .then(() => setOutputError(null))
      .catch((err) => {
        // Typically the device was unplugged — fall back to the default
        // output rather than going silent.
        console.error('cue setSinkId failed', err)
        setOutputError('Cue output unavailable — using the default output')
        sink.setSinkId?.('').catch(() => {})
      })
  }, [cueOutputDeviceId])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = cueVolume
  }, [cueVolume])

  // Starts on mount: cueing a track is an explicit "let me hear this".
  useEffect(() => {
    audioRef.current?.play().catch(() => {})
  }, [])

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(() => {})
    else audio.pause()
  }

  const title = decodeHtmlEntities(track.title ?? track.filename)
  const key = formatKey(track.musicalKey, keyNotation)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 12px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        fontSize: '12px',
      }}
    >
      <audio
        ref={audioRef}
        src={trackPathToMediaUrl(track.path)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration)
        }}
      />
      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-accent)' }} title="Pre-listen (cue output)">
        headphones
      </span>
      <button
        onClick={toggle}
        title={playing ? 'Pause preview' : 'Play preview'}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
          {playing ? 'pause' : 'play_arrow'}
        </span>
      </button>
      <span style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={title}>
        {title}
        {track.artist && <span style={{ color: 'var(--color-text-dim)' }}> — {decodeHtmlEntities(track.artist)}</span>}
      </span>
      {(key || track.bpm) && (
        <span style={{ color: 'var(--color-text-dim)', whiteSpace: 'nowrap' }}>
          {[key, track.bpm ? `${Math.round(track.bpm)} BPM` : null].filter(Boolean).join(' · ')}
        </span>
      )}
      <span style={{ color: 'var(--color-text-dim)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
        {formatDuration(position)} / {formatDuration(duration)}
      </span>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(position, duration || 0)}
        onChange={(e) => {
          if (audioRef.current) audioRef.current.currentTime = Number(e.target.value)
        }}
        title="Seek preview"
        style={{ flex: '0 1 280px', minWidth: '80px' }}
      />
      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-text-dim)' }}>
        volume_up
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={cueVolume}
        onChange={(e) => setCueVolume(Number(e.target.value))}
        title="Preview volume"
        style={{ width: '70px' }}
      />
      {outputError && <span style={{ color: 'var(--color-secondary)' }}>{outputError}</span>}
      <button
        onClick={stopPreview}
        title="Stop preview"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
          close
        </span>
      </button>
    </div>
  )
}
