// src/components/Player.tsx
import { useEffect, useRef, useState } from 'react'
import { trackPathToMediaUrl } from '../media'
import { useCollectionStore } from '../state/store'
import { EffectsChain } from '../audio/effectsChain'
import { getActiveAnalyser, setActiveAnalyser } from '../audio/audioAnalysis'
import { MidiLearnBadge } from './MidiLearnBadge'
import { CastButton } from './CastButton'
import { registerCastSource } from '../cast/castMixer'
import { castTimeline } from '../cast/castTimeline'
import { ConfirmDialog } from './ConfirmDialog'
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
export function Player({
  track,
  onShowDetails,
  onFilterByArtist,
}: {
  track: Track
  onShowDetails: (track: Track) => void
  onFilterByArtist: (artist: string) => void
}) {
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
  const [confirmArtistFilter, setConfirmArtistFilter] = useState(false)
  // CDJ-style cue point, in seconds. Starts at the top of the track and
  // lives only as long as this mount (Player remounts per track). The ref
  // mirrors it so MIDI/keyboard handlers registered once see the latest.
  const [cuePoint, setCuePoint] = useState(0)
  const cuePointRef = useRef(0)
  // True while CUE is held and previewing from the cue point; releasing
  // snaps back to the cue point unless Play was pressed meanwhile.
  const cuePreviewingRef = useRef(false)
  const [cueHeld, setCueHeld] = useState(false)
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
  const setVisualizerOpen = useCollectionStore((s) => s.setVisualizerOpen)

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
    // Play pressed while holding CUE: keep playing past the release, like
    // a CDJ.
    if (cuePreviewingRef.current) {
      cuePreviewingRef.current = false
      return
    }
    if (playing) {
      audio.pause()
    } else {
      // AudioContext starts suspended until a user gesture resumes it —
      // this click is that gesture.
      effectsChainRef.current?.resume()
      // Rejection (missing/blocked file, unsupported format) just means no
      // 'play' event fires below, so `playing` correctly never flips true.
      audio.play().catch(() => {})
    }
  }

  // CUE button: plays for as long as it's held, from the cue point;
  // releasing snaps back to the cue point and pauses.
  // - paused → wherever the track is paused becomes the cue point, so
  //   pausing (or seeking while paused) is how a cue point gets placed;
  // - playing → jumps back to the cue point.
  function cueDown() {
    const audio = audioRef.current
    if (!audio) return
    setCueHeld(true)
    if (audio.paused) {
      cuePointRef.current = audio.currentTime
      setCuePoint(audio.currentTime)
    } else {
      audio.currentTime = cuePointRef.current
    }
    cuePreviewingRef.current = true
    effectsChainRef.current?.resume()
    audio.play().catch(() => {})
  }

  function cueUp() {
    setCueHeld(false)
    if (!cuePreviewingRef.current) return
    cuePreviewingRef.current = false
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = cuePointRef.current
  }

  // `playing` mirrors the <audio> element's own play/pause events rather
  // than being set directly inside toggle() — playback can also start or
  // stop from outside a click on this button: OS media keys, a Bluetooth
  // headset's remote (AirPods pause button), or Media Session action
  // handlers below. Without this, those external changes silently paused
  // the audio while the UI kept showing the "playing" state.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
    }
  }, [])

  // Registers this mount's toggle as the store's imperative playback
  // control, so a MIDI-bound player.playPause can reach it — toggle is
  // redefined every render (it closes over `playing`), so a ref keeps the
  // registered function pointing at the latest one without re-registering
  // (and re-triggering the effect) on every render.
  const toggleRef = useRef(toggle)
  toggleRef.current = toggle
  const cueDownRef = useRef(cueDown)
  cueDownRef.current = cueDown
  const cueUpRef = useRef(cueUp)
  cueUpRef.current = cueUp
  useEffect(() => {
    setPlaybackControls({
      toggle: () => toggleRef.current(),
      cueDown: () => cueDownRef.current(),
      cueUp: () => cueUpRef.current(),
    })
    return () => setPlaybackControls(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setPlayerPlaying = useCollectionStore((s) => s.setPlayerPlaying)
  useEffect(() => {
    setPlayerPlaying(playing)
  }, [playing, setPlayerPlaying])
  useEffect(() => () => setPlayerPlaying(false), [setPlayerPlaying])

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
    const analyser = chain.getAnalyser()
    setActiveAnalyser(analyser)
    const unregisterCastSource = registerCastSource(chain.getCastStream())
    return () => {
      unregisterCastSource()
      // Only clear it if the next track's Player hasn't already registered
      // its own — don't depend on React's unmount/mount ordering.
      if (getActiveAnalyser() === analyser) setActiveAnalyser(null)
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
    audio.play().catch(() => {})
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

  // While the TV is playing (a few seconds behind), optionally silence
  // this Mac so the two don't echo — the cast tap is upstream of this.
  const castPlaying = useCollectionStore((s) => s.castStatus.state === 'casting')
  const castMuteLocal = useCollectionStore((s) => s.castMuteLocal)
  useEffect(() => {
    effectsChainRef.current?.setLocalMuted(castPlaying && castMuteLocal)
  }, [castPlaying, castMuteLocal])

  // While casting, the device plays castDelaySeconds behind MCO. MCO's
  // playback is logged continuously (castTimeline), and when you're
  // listening to the device (this Mac muted) the seekbar and time show
  // what it's playing now rather than what MCO is at — so a pause, seek
  // or track change shows up when you hear it. The play button spins
  // until the latest change has reached the device.
  const castDelaySeconds = useCollectionStore((s) => s.castStatus.delaySeconds ?? null)
  const delayMs = castPlaying && castMuteLocal && castDelaySeconds !== null ? castDelaySeconds * 1000 : null
  const [delayedView, setDelayedView] = useState<{ time: number; pending: boolean } | null>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const sample = () =>
      castTimeline.record({ at: performance.now(), trackId: track.id, time: audio.currentTime, playing: !audio.paused })
    const change = () => {
      sample()
      castTimeline.markChange(performance.now())
    }
    // Loading this track is itself a change the device hasn't heard yet.
    change()
    const timer = setInterval(sample, 100)
    audio.addEventListener('play', change)
    audio.addEventListener('pause', change)
    audio.addEventListener('seeked', change)
    return () => {
      clearInterval(timer)
      audio.removeEventListener('play', change)
      audio.removeEventListener('pause', change)
      audio.removeEventListener('seeked', change)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (delayMs === null) {
      setDelayedView(null)
      return
    }
    const update = () => {
      const now = performance.now()
      const position = castTimeline.positionAt(now, delayMs)
      // Still on an earlier track (or from before this cast) on the
      // device: this track hasn't started there yet.
      const time = position && position.trackId === track.id ? position.time : 0
      setDelayedView({ time, pending: castTimeline.hasPendingChange(now, delayMs) })
    }
    update()
    const timer = setInterval(update, 100)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delayMs])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (modalOpen) return
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return
      if (e.key === ' ') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault()
        advanceToNext()
      } else if ((e.key === 'c' || e.key === 'C') && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        cueDownRef.current()
      }
    }
    // Release isn't guarded by modal/focus: a C held down before a modal
    // opened must still let go of the preview.
    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === 'c' || e.key === 'C') cueUpRef.current()
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, modalOpen, hasNext])

  // Wires OS-level media controls (keyboard media keys, Touch Bar,
  // Bluetooth headset remotes like AirPods) to this track's transport —
  // without a registered Media Session, those controls have nothing to
  // call into and silently no-op (or, for a headset's pause button, act
  // directly on the <audio> element while this UI has no way to know).
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: decodeHtmlEntities(track.title ?? track.filename),
      artist: track.artist ? decodeHtmlEntities(track.artist) : undefined,
      artwork: artworkUrl ? [{ src: artworkUrl }] : [],
    })
    navigator.mediaSession.setActionHandler('play', () => toggleRef.current())
    navigator.mediaSession.setActionHandler('pause', () => toggleRef.current())
    navigator.mediaSession.setActionHandler('nexttrack', hasNext ? () => advanceToNext() : null)
    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, artworkUrl, hasNext])

  // Keeps the OS Now Playing indicator (and AirPods' own play/pause state)
  // in sync with in-app changes, same event source as the `playing` state
  // sync effect above.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
  }, [playing])

  function seekToClientX(clientX: number, target: HTMLElement | SVGSVGElement) {
    const audio = audioRef.current
    if (!audio || !audio.duration || !isFinite(audio.duration)) return
    const rect = target.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    audio.currentTime = ratio * audio.duration
    // Seeking while paused is how the cue point gets placed.
    if (audio.paused) {
      cuePointRef.current = audio.currentTime
      setCuePoint(audio.currentTime)
    }
    setProgress(ratio)
    setCurrentTime(audio.currentTime)
    setPlaybackProgress(ratio)
  }

  const peaks = track.waveformPeaks
  const trackDuration = duration || track.duration || 0
  const shownTime = delayedView ? Math.min(delayedView.time, trackDuration || Infinity) : currentTime
  const shownProgress = delayedView ? (trackDuration > 0 ? Math.min(1, shownTime / trackDuration) : 0) : progress
  const waitingForCast = delayedView?.pending ?? false

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
        <button
          onClick={(e) => {
            setVisualizerOpen(true)
            // Otherwise focus stays on this button behind the overlay, and
            // the Space shortcut (which ignores focused buttons) stops
            // toggling play/pause while the visualizer is up.
            e.currentTarget.blur()
          }}
          title="Open visualizer (full screen)"
          style={{ background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0, display: 'flex' }}
        >
          <span className="material-symbols-outlined">graphic_eq</span>
        </button>
        <span style={{ width: '10px', flexShrink: 0 }} />
        <CastButton />
        <span
          style={{ width: '1px', height: '20px', background: 'var(--color-border)', margin: '0 10px', flexShrink: 0 }}
        />
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
          <span onClick={() => onShowDetails(track)} style={{ cursor: 'pointer' }} title="Show track details">
            {decodeHtmlEntities(track.title ?? track.filename)}
          </span>
          {track.artist && (
            <span style={{ fontWeight: 400, color: 'var(--color-text-dim)' }}>
              {' — '}
              <span
                onClick={() => setConfirmArtistFilter(true)}
                style={{ cursor: 'pointer' }}
                title="Filter the collection by this artist"
              >
                {decodeHtmlEntities(track.artist)}
              </span>
            </span>
          )}
        </span>
        {confirmArtistFilter && track.artist && (
          <ConfirmDialog
            title="Filter by artist"
            icon="filter_list"
            confirmLabel="Filter"
            onConfirm={() => {
              setConfirmArtistFilter(false)
              onFilterByArtist(decodeHtmlEntities(track.artist!))
            }}
            onCancel={() => setConfirmArtistFilter(false)}
          >
            Do you want to filter the collection by this artist?
            <div style={{ marginTop: '6px', color: 'var(--color-text)', fontWeight: 500 }}>
              {decodeHtmlEntities(track.artist)}
            </div>
          </ConfirmDialog>
        )}
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
              ? `-${formatDuration(Math.max(0, (duration || track.duration!) - shownTime))} / ${formatDuration(duration || track.duration!)}`
              : `${formatDuration(shownTime)} / ${formatDuration(duration || track.duration!)}`}
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
        <button
          // Pointer events, not click: CUE acts on press and on release.
          // preventDefault keeps focus off the button so Space/C still
          // reach the window shortcuts; pointer capture guarantees the
          // release arrives even if the pointer slides off.
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            cueDown()
          }}
          onPointerUp={cueUp}
          onPointerCancel={cueUp}
          title="Cue (C): hold to play, release to return to the cue point. Paused → the cue point is set where the track is paused."
          style={{
            fontWeight: 700,
            fontSize: '11px',
            letterSpacing: '0.05em',
            color: 'var(--color-cue)',
            borderColor: cueHeld ? 'var(--color-cue)' : undefined,
          }}
        >
          CUE
        </button>
        <MidiLearnBadge control="player.cue" />

        <button
          onClick={toggle}
          title={waitingForCast ? 'Waiting for the TV to catch up…' : undefined}
        >
          {waitingForCast ? (
            <span className="material-symbols-outlined spin">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined">{playing ? 'pause' : 'play_arrow'}</span>
          )}
        </button>
        <MidiLearnBadge control="player.playPause" />

        <button onClick={() => advanceToNext()} disabled={!hasNext} title="Play next in queue">
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
                  fill={i / peaks.length <= shownProgress ? 'var(--color-accent)' : 'var(--color-border)'}
                />
              ))}
              <rect
                x={shownProgress * peaks.length}
                y={0}
                width={Math.max(1, peaks.length / 400)}
                height={100}
                fill="var(--color-secondary)"
              />
              {duration > 0 && (
                <rect
                  x={(cuePoint / duration) * peaks.length}
                  y={0}
                  width={Math.max(1, peaks.length / 400)}
                  height={100}
                  fill="var(--color-cue)"
                >
                  <title>Cue point {formatDuration(cuePoint)}</title>
                </rect>
              )}
            </svg>
          ) : (
            // No waveform data yet (track not analyzed) — still seekable,
            // just without the visualization.
            <div
              onClick={(e) => seekToClientX(e.clientX, e.currentTarget)}
              style={{ position: 'relative', height: '40px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
            >
              {duration > 0 && (
                <div
                  title={`Cue point ${formatDuration(cuePoint)}`}
                  style={{
                    position: 'absolute',
                    left: `${(cuePoint / duration) * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: 'var(--color-cue)',
                  }}
                />
              )}
            </div>
          )}
          <div style={{ marginTop: '4px', height: '2px', background: 'var(--color-border)', borderRadius: '1px' }}>
            <div style={{ width: `${shownProgress * 100}%`, height: '100%', background: 'var(--color-accent)' }} />
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
