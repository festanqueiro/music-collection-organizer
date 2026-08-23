// src/components/Player.tsx
import { useEffect, useRef, useState } from 'react'
import { trackPathToMediaUrl } from '../media'
import { useCollectionStore } from '../state/store'
import { EffectsChain } from '../audio/effectsChain'
import { MidiLearnBadge } from './MidiLearnBadge'
import { sendMidiFeedback } from '../audio/midi'
import { formatDuration, decodeHtmlEntities } from '../format'
import type { Track } from '../types'

// Renders as the app's footer player bar: track name + BPM, play/pause,
// waveform (doubles as the seek bar), and volume. The delay/reverb FX
// controls live in FxPanel instead, inside the full-screen queue view —
// they need real screen space (and will grow further once the Dub Siren
// module lands), which the compact footer strip can't spare. All other
// track detail (artist, tags, full ID3) lives in DetailPanel instead —
// this component is deliberately just the now-playing strip.
export function Player({ track }: { track: Track }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  // Remembers the volume to restore on unmute — a plain ref, not state,
  // since it's write-only from the mute button's own perspective (never
  // rendered) and shouldn't trigger a re-render on every volume change.
  const lastVolumeRef = useRef(1)
  const effectsChainRef = useRef<EffectsChain | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1 fraction of duration played
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showTimeLeft, setShowTimeLeft] = useState(false)
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null)
  const modalOpen = useCollectionStore((s) => s.modalOpen)
  const effectsSettings = useCollectionStore((s) => s.effectsSettings)
  const playerVolume = useCollectionStore((s) => s.playerVolume)
  const audioOutputDeviceId = useCollectionStore((s) => s.audioOutputDeviceId)
  const setPlayerVolume = useCollectionStore((s) => s.setPlayerVolume)
  const continuousPlay = useCollectionStore((s) => s.continuousPlay)
  const advanceToNext = useCollectionStore((s) => s.advanceToNext)
  const playerExpanded = useCollectionStore((s) => s.playerExpanded)
  const setPlayerExpanded = useCollectionStore((s) => s.setPlayerExpanded)
  const setPlaybackProgress = useCollectionStore((s) => s.setPlaybackProgress)
  const playlist = useCollectionStore((s) => s.playlist)
  const hasNext = playlist.length > 1
  const setPlaybackControls = useCollectionStore((s) => s.setPlaybackControls)
  const midiMappings = useCollectionStore((s) => s.midiMappings)

  // Player remounts fresh per track, so this also resets the shared
  // progress back to 0 as soon as a new track takes over, rather than
  // leaving the previous track's leftover fraction showing in the queue.
  useEffect(() => {
    setPlaybackProgress(0)
    return () => setPlaybackProgress(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Player remounts fresh per track (see above), so this only ever runs
  // once per track — no need to key off track.id separately.
  useEffect(() => {
    let cancelled = false
    setArtworkUrl(null)
    window.api.getTrackArtwork(track.id).then((url) => {
      if (!cancelled) setArtworkUrl(url)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      // AudioContext starts suspended until a user gesture resumes it —
      // this click is that gesture.
      effectsChainRef.current?.resume()
      // audio.play() can reject (missing/blocked file, unsupported format) —
      // only flip to "playing" once it actually starts, so a failed play
      // doesn't leave the button showing pause while nothing plays.
      audio.play().then(
        () => setPlaying(true),
        () => setPlaying(false)
      )
    }
  }

  // Registers this mount's toggle as the store's imperative playback
  // control, so a MIDI-bound player.playPause can reach it — toggle is
  // redefined every render (it closes over `playing`), so a ref keeps the
  // registered function pointing at the latest one without re-registering
  // (and re-triggering the effect) on every render.
  const toggleRef = useRef(toggle)
  toggleRef.current = toggle
  useEffect(() => {
    setPlaybackControls({ toggle: () => toggleRef.current() })
    return () => setPlaybackControls(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mirrors playing/paused to a bound player.playPause button's LED,
  // same convention as delay.enabled/reverb.enabled.
  useEffect(() => {
    const binding = midiMappings['player.playPause']
    if (binding) sendMidiFeedback(binding, playing)
  }, [playing, midiMappings])

  // Player remounts fresh per track (keyed by track id in App.tsx), so
  // this runs once per track — matches createMediaElementSource's
  // requirement of being called at most once per <audio> element.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const chain = new EffectsChain(audio)
    chain.update(effectsSettings)
    chain.setVolume(playerVolume)
    effectsChainRef.current = chain
    return () => {
      chain.close()
      effectsChainRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Player only ever mounts fresh when a track is explicitly loaded (the
  // play-circle icon or "Load track in Player") — so autoplaying on mount
  // is exactly "click play in the track list plays instantly", not a
  // surprise autoplay on some unrelated re-render.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    effectsChainRef.current?.resume()
    audio.play().then(
      () => setPlaying(true),
      () => setPlaying(false)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    effectsChainRef.current?.update(effectsSettings)
  }, [effectsSettings])

  // playerVolume lives in the global store (not local state) so a MIDI
  // binding can drive it regardless of which track's Player is currently
  // mounted — this effect applies it to the dry-path gain node (see
  // effectsChain.ts) on every external change after mount. Setting
  // HTMLMediaElement.volume directly doesn't reliably work once the
  // element's output is captured by the Web Audio graph — only nodes
  // inside the graph itself actually control what reaches destination.
  useEffect(() => {
    effectsChainRef.current?.setVolume(playerVolume)
  }, [playerVolume])

  // Same store-driven pattern as playerVolume above, for the chosen audio
  // output device — also runs on mount (Player remounts fresh per track,
  // so a newly created EffectsChain otherwise defaults to the system
  // output until this fires).
  useEffect(() => {
    effectsChainRef.current?.setSinkId(audioOutputDeviceId)
  }, [audioOutputDeviceId])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (modalOpen) return
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return
      if (e.key === ' ') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, modalOpen])

  function seekToClientX(clientX: number, target: HTMLElement | SVGSVGElement) {
    const audio = audioRef.current
    if (!audio || !audio.duration || !isFinite(audio.duration)) return
    const rect = target.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    audio.currentTime = ratio * audio.duration
    setProgress(ratio)
    setCurrentTime(audio.currentTime)
    setPlaybackProgress(ratio)
  }

  const peaks = track.waveformPeaks

  return (
    <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <audio
        ref={audioRef}
        src={trackPathToMediaUrl(track.path)}
        // Without this, the media load is a "no-cors" request and its
        // response is unconditionally opaque/tainted for Web Audio
        // purposes regardless of the media:// scheme's own corsEnabled
        // registration or any response headers — createMediaElementSource
        // (the delay/reverb FX graph) would silently output silence.
        crossOrigin="anonymous"
        onEnded={() => {
          if (continuousPlay) advanceToNext()
          else setPlaying(false)
        }}
        onError={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const audio = e.currentTarget
          setCurrentTime(audio.currentTime)
          if (audio.duration && isFinite(audio.duration)) {
            const ratio = audio.currentTime / audio.duration
            setProgress(ratio)
            setPlaybackProgress(ratio)
            setDuration(audio.duration)
          }
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center' }}>
        {artworkUrl && (
          <img
            src={artworkUrl}
            alt=""
            style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '3px', marginRight: '8px', flexShrink: 0 }}
          />
        )}
        {track.analysisStatus === 'analyzing' && (
          <span
            className="material-symbols-outlined spin"
            style={{ fontSize: '16px', marginRight: '4px', color: 'var(--color-text-dim)', flexShrink: 0 }}
            title="Analyzing…"
          >
            progress_activity
          </span>
        )}
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 500,
            minWidth: 0,
            flexShrink: 1,
          }}
        >
          {decodeHtmlEntities(track.title ?? track.filename)}
          {track.artist && (
            <span style={{ fontWeight: 400, color: 'var(--color-text-dim)' }}> — {decodeHtmlEntities(track.artist)}</span>
          )}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginLeft: '8px', flexShrink: 0 }}>
          {track.bpm ? `${Math.round(track.bpm)} BPM` : '— BPM'}
        </span>
        {(duration || track.duration) && (
          <span
            onClick={() => setShowTimeLeft((v) => !v)}
            title={showTimeLeft ? 'Showing time left — click to show elapsed / total' : 'Click to show time left'}
            style={{
              fontSize: '11px',
              color: 'var(--color-text-dim)',
              marginLeft: '8px',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            {showTimeLeft
              ? `-${formatDuration(Math.max(0, (duration || track.duration!) - currentTime))} / ${formatDuration(duration || track.duration!)}`
              : `${formatDuration(currentTime)} / ${formatDuration(duration || track.duration!)}`}
          </span>
        )}
        {track.cloudStatus === 'local' && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginLeft: '8px', flexShrink: 0 }}>
            Synced locally
          </span>
        )}
        {track.analysisStatus === 'done' && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginLeft: '8px', flexShrink: 0 }}>
            Analysed
          </span>
        )}
        <button
          onClick={() => setPlayerExpanded(!playerExpanded)}
          title={playerExpanded ? 'Collapse queue' : 'Expand queue'}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
        >
          <span className="material-symbols-outlined">
            {playerExpanded ? 'keyboard_arrow_down' : 'keyboard_arrow_up'}
          </span>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={toggle}>
          <span className="material-symbols-outlined">{playing ? 'pause' : 'play_arrow'}</span>
        </button>
        <MidiLearnBadge control="player.playPause" />

        <button onClick={() => advanceToNext()} disabled={!hasNext} title="Play next">
          <span className="material-symbols-outlined">skip_next</span>
        </button>
        <MidiLearnBadge control="player.playNext" />

        <div style={{ flex: 1, minWidth: 0 }}>
          {peaks && peaks.length > 0 ? (
            <svg
              width="100%"
              height="40"
              viewBox={`0 0 ${peaks.length} 100`}
              preserveAspectRatio="none"
              onClick={(e) => seekToClientX(e.clientX, e.currentTarget)}
              // Short/quiet-passage bars leave plenty of transparent gaps
              // in the waveform — without this, clicks landing in those
              // gaps (rather than exactly on a painted bar) are silently
              // dropped, since SVG only hit-tests painted areas by
              // default. pointerEvents: 'all' makes the whole box
              // clickable regardless of what's actually drawn there.
              style={{ cursor: 'pointer', display: 'block', pointerEvents: 'all' }}
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
              <rect
                x={progress * peaks.length}
                y={0}
                width={Math.max(1, peaks.length / 400)}
                height={100}
                fill="var(--color-secondary)"
              />
            </svg>
          ) : (
            // No waveform data yet (track not analyzed) — still seekable,
            // just without the visualization.
            <div
              onClick={(e) => seekToClientX(e.clientX, e.currentTarget)}
              style={{ height: '40px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
            />
          )}
          <div style={{ marginTop: '4px', height: '2px', background: 'var(--color-border)', borderRadius: '1px' }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--color-accent)' }} />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Volume">
          <button
            onClick={() => {
              if (playerVolume > 0) {
                lastVolumeRef.current = playerVolume
                setPlayerVolume(0)
              } else {
                setPlayerVolume(lastVolumeRef.current || 1)
              }
            }}
            title={playerVolume > 0 ? 'Mute' : 'Unmute'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              {playerVolume === 0 ? 'volume_off' : playerVolume < 0.5 ? 'volume_down' : 'volume_up'}
            </span>
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={playerVolume}
            onChange={(e) => setPlayerVolume(Number(e.target.value))}
            style={{ width: '80px' }}
          />
          <MidiLearnBadge control="volume" />
        </label>
      </div>
    </div>
  )
}
