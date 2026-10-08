// src/components/Player.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { trackPathToMediaUrl } from '../media'
import { useCollectionStore } from '../state/store'
import { listenedSeconds, playedThreshold } from '../state/playCount'
import { EffectsChain } from '../audio/effectsChain'
import { getActiveAnalyser, setActiveAnalyser } from '../audio/audioAnalysis'
import { MidiLearnBadge } from './MidiLearnBadge'
import { attachDirectCast } from '../cast/directCast'
import { ConfirmDialog } from './ConfirmDialog'
import { sendMidiFeedback } from '../audio/midi'
import { formatDuration, decodeHtmlEntities } from '../format'
import type { Track } from '../types'
import { PlayerScreenButtons } from './PlayerScreenButtons'
import { HotCuePads, CueMarkers } from './HotCuePads'
import { BarCounter } from './BarCounter'
import { contextMenuIconStyle, contextMenuItemStyle, contextMenuStyle } from './contextMenuStyles'

const preciseTime = (s: number) => `${formatDuration(Math.floor(s))}.${String(Math.floor((s % 1) * 10))}`
import { START_SLOT, detectedStart, gridStart, hotCueSlots, suggestedCues } from '../state/hotCues'
import { PlayerWaveform } from './PlayerWaveform'

const NO_CUES: never[] = []

// The player's two sizes (the store's playerLarge): at the larger one the
// panel is twice as high (254 px for 127), and all of the extra height goes
// to the waveform, four times as tall. The buttons stay as they are.
function usePlayerSize() {
  const large = useCollectionStore((s) => s.playerLarge)
  return { large, waveHeight: large ? 167 : 40 }
}

// In the player's header, before the screen buttons.
function PlayerSizeButton() {
  const large = useCollectionStore((s) => s.playerLarge)
  const setLarge = useCollectionStore((s) => s.setPlayerLarge)
  return (
    <button
      onClick={() => setLarge(!large)}
      // Keeps focus off it so Space/C still reach the window.
      onMouseDown={(e) => e.preventDefault()}
      title={large ? 'Smaller player' : 'Larger player: a taller waveform'}
      aria-label={large ? 'Smaller player' : 'Larger player'}
      aria-pressed={large}
      style={{ display: 'flex', background: 'none', border: 'none', padding: '2px', marginRight: '6px', color: large ? 'var(--color-accent)' : 'var(--color-text-dim)' }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
        {large ? 'unfold_less' : 'unfold_more'}
      </span>
    </button>
  )
}

// How close (in px) to the waveform's left edge a click counts as "seek to
// the start".
const SEEK_START_SNAP_PX = 6

// Renders as the app's footer player bar: track name + BPM, play/pause,
// waveform (doubles as the seek bar), and volume. The FX controls live in
// FxPanel instead, on their own full screen (FxView, the FX button) —
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
  const size = usePlayerSize()
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
  const playerVolume = useCollectionStore((s) => s.playerVolume)
  const setPlayerVolume = useCollectionStore((s) => s.setPlayerVolume)
  const continuousPlay = useCollectionStore((s) => s.continuousPlay)
  const advanceToNext = useCollectionStore((s) => s.advanceToNext)
  const setPlaybackProgress = useCollectionStore((s) => s.setPlaybackProgress)
  const playlist = useCollectionStore((s) => s.playlist)
  const hasNext = playlist.length > 1
  const setPlaybackControls = useCollectionStore((s) => s.setPlaybackControls)
  const midiMappings = useCollectionStore((s) => s.midiMappings)
  const recordPlay = useCollectionStore((s) => s.recordPlay)
  // Hot cues (docs/features/hot-cues.md), loaded once per track.
  const cues = useCollectionStore((s) => s.trackCues.get(track.id)) ?? NO_CUES
  // Bars 8/16/24/…/64 from the start of the tune (src/state/hotCues.ts).
  // The waveform isn't in the track list (ADR 0058): read when the track
  // loads, and again once an analysis of it finishes.
  const peaks = useCollectionStore((s) => s.trackWaveforms.get(track.id)) ?? null
  useEffect(() => {
    useCollectionStore.getState().loadTrackWaveform(track.id).catch((err) => console.error('reading the waveform failed', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.analyzedAt])
  // The coloured waveform styles need the waveform in three bands: read
  // (and, for a track analysed before they existed, worked out) only when
  // one of them is chosen.
  const waveformStyle = useCollectionStore((s) => s.waveformStyle)
  const waveformGrid = useCollectionStore((s) => s.waveformGrid)
  const bands = useCollectionStore((s) => s.trackWaveformBands.get(track.id)) ?? null
  useEffect(() => {
    if (waveformStyle === 'classic') return
    useCollectionStore.getState().loadTrackWaveformBands(track.id).catch((err) => console.error('reading the waveform bands failed', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id, track.analyzedAt, waveformStyle])
  // What the beat grid is counted from: the start of the tune (bar 0) —
  // 0:00 until the user moves it.
  const grid = useMemo(
    () => ({ bpm: track.bpm, firstBeat: track.firstBeat, gridStart: track.gridStart, waveformPeaks: peaks }),
    [track.bpm, track.firstBeat, track.gridStart, peaks]
  )
  // The waveform's right-click menu (the start of the tune).
  const [startMenu, setStartMenu] = useState<{ x: number; y: number; time: number } | null>(null)
  useEffect(() => {
    if (!startMenu) return
    const close = () => setStartMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [startMenu])
  useEffect(() => setStartMenu(null), [track.id])
  const suggestions = useMemo(() => suggestedCues(grid, duration || track.duration || 0, cues), [grid, duration, cues])
  const cuesRef = useRef(cues)
  cuesRef.current = cues
  useEffect(() => {
    void useCollectionStore.getState().loadTrackCues(track.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Listening time on this track, for its play count (see playCount.ts).
  // Player remounts per track, so these start fresh for each one.
  const listenedRef = useRef(0)
  const lastTimeRef = useRef(0)
  const playRecordedRef = useRef(false)

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

  // A hot cue pad: empty → a cue here; set → jump there and play.
  function hotCue(slot: number) {
    const audio = audioRef.current
    if (!audio) return
    const cue = hotCueSlots(cuesRef.current)[slot]
    if (!cue) {
      void useCollectionStore.getState().setHotCue(track.id, slot, audio.currentTime)
      return
    }
    cuePreviewingRef.current = false
    setCueHeld(false)
    audio.currentTime = cue.start
    setCurrentTime(cue.start)
    if (audio.duration && isFinite(audio.duration)) {
      setProgress(cue.start / audio.duration)
      setPlaybackProgress(cue.start / audio.duration)
    }
    if (audio.paused) {
      effectsChainRef.current?.resume()
      audio.play().catch(() => {})
    }
  }

  // To the start of the tune, playing — like a set hot cue pad.
  function jumpTo(time: number) {
    const audio = audioRef.current
    if (!audio) return
    cuePreviewingRef.current = false
    setCueHeld(false)
    audio.currentTime = time
    setCurrentTime(time)
    if (audio.duration && isFinite(audio.duration)) {
      setProgress(time / audio.duration)
      setPlaybackProgress(time / audio.duration)
    }
    if (audio.paused) {
      effectsChainRef.current?.resume()
      audio.play().catch(() => {})
    }
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
  const hotCueRef = useRef(hotCue)
  hotCueRef.current = hotCue
  useEffect(() => {
    setPlaybackControls({
      toggle: () => toggleRef.current(),
      cueDown: () => cueDownRef.current(),
      cueUp: () => cueUpRef.current(),
      hotCue: (slot) => hotCueRef.current(slot),
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

  // Bound hot cue pads light up when their cue is set.
  useEffect(() => {
    hotCueSlots(cues).forEach((cue, slot) => {
      const binding = midiMappings[`player.hotCue${slot + 1}` as keyof typeof midiMappings]
      if (binding) sendMidiFeedback(binding, !!cue)
    })
  }, [cues, midiMappings])

  // Player remounts fresh per track (keyed by track id in App.tsx), so
  // this runs once per track — matches createMediaElementSource's
  // requirement of being called at most once per <audio> element.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const chain = new EffectsChain(audio)
    chain.update(useCollectionStore.getState().effectsSettings)
    chain.setVolume(playerVolume)
    effectsChainRef.current = chain
    const analyser = chain.getAnalyser()
    setActiveAnalyser(analyser)
    return () => {
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
    // A start the user moved is where the tune begins playing (ADR 0060),
    // and where the CUE button returns to.
    if (track.gridStart !== null && track.gridStart > 0) {
      audio.currentTime = track.gridStart
      cuePointRef.current = track.gridStart
      setCuePoint(track.gridStart)
    }
    audio.play().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Subscribed outside React: FX knobs change these many times a second,
  // and re-rendering the player (waveform included) for each one is what
  // made dragging a knob feel stuck.
  useEffect(
    () =>
      useCollectionStore.subscribe((state, previous) => {
        if (state.effectsSettings !== previous.effectsSettings) effectsChainRef.current?.update(state.effectsSettings)
      }),
    []
  )

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

  // The output device and the cast "mute this Mac" are applied to the
  // shared audio engine in App.tsx, not per track.
  const castPlaying = useCollectionStore((s) => s.castStatus.state === 'casting')
  const castMode = useCollectionStore((s) => s.castStatus.mode)

  // The track played to its end — here, or on the cast device.
  function handleTrackEnded() {
    if (continuousPlay) advanceToNext()
    else setPlaying(false)
  }
  const trackEndedRef = useRef(handleTrackEnded)
  trackEndedRef.current = handleTrackEnded

  // Direct cast modes: the device (Google's player, or MCO's own receiver
  // app) plays this track's file itself, and this Player becomes its
  // remote (see cast/directCast.ts).
  const castingDirect = castPlaying && (castMode === 'direct' || castMode === 'receiver')
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !castingDirect) return
    return attachDirectCast(audio, track.id, () => trackEndedRef.current())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castingDirect])


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
      } else if (/^Digit[1-8]$/.test(e.code) && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // 1–8: hot cues A–H; Shift deletes one. The visualizer keeps 1–8
        // for its themes while it's open.
        if (useCollectionStore.getState().visualizerOpen) return
        e.preventDefault()
        const slot = Number(e.code.slice(5)) - 1
        if (e.shiftKey) void useCollectionStore.getState().removeHotCue(track.id, slot)
        else hotCueRef.current(slot)
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
    // Clicks within a few pixels of the left edge snap to the very start —
    // otherwise 0:00 is a single pixel and practically unclickable.
    const x = clientX - rect.left
    const ratio = x <= SEEK_START_SNAP_PX ? 0 : Math.min(1, x / rect.width)
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
        onEnded={handleTrackEnded}
        onError={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const audio = e.currentTarget
          setCurrentTime(audio.currentTime)
          if (!audio.paused) listenedRef.current += listenedSeconds(lastTimeRef.current, audio.currentTime)
          lastTimeRef.current = audio.currentTime
          if (!playRecordedRef.current && listenedRef.current >= playedThreshold(audio.duration)) {
            playRecordedRef.current = true
            recordPlay(track.id).catch((err) => console.error('recording a play failed', err))
          }
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
        <BarCounter
          audioRef={audioRef}
          bpm={track.bpm}
          start={gridStart(grid)}
        />
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
        <div style={{ marginLeft: 'auto', paddingLeft: '8px', display: 'flex', alignItems: 'center' }}>
          <PlayerSizeButton />
          <PlayerScreenButtons hasTrack />
        </div>
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

        <button onClick={toggle}>
          <span className="material-symbols-outlined">{playing ? 'pause' : 'play_arrow'}</span>
        </button>
        <MidiLearnBadge control="player.playPause" />

        <button onClick={() => advanceToNext()} disabled={!hasNext} title="Play next in queue">
          <span className="material-symbols-outlined">skip_next</span>
        </button>
        <MidiLearnBadge control="player.playNext" />

        <div
          // Right-click: the start of the tune (bar 0) goes where the
          // pointer is — the only place it's set, besides dragging its
          // marker once it's there.
          onContextMenu={(e) => {
            const total = duration || track.duration || 0
            if (!(total > 0)) return
            e.preventDefault()
            const rect = e.currentTarget.getBoundingClientRect()
            const x = e.clientX - rect.left
            const time = x <= SEEK_START_SNAP_PX ? 0 : Math.min(total, (x / rect.width) * total)
            setStartMenu({ x: e.clientX, y: e.clientY, time: Math.round(time * 1000) / 1000 })
          }}
          style={{ flex: 1, minWidth: 0, position: 'relative' }}
        >
          {startMenu && (
            <div onClick={(e) => e.stopPropagation()} style={{ ...contextMenuStyle, left: startMenu.x, top: startMenu.y - 8, transform: 'translateY(-100%)', minWidth: '240px' }}>
              <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--color-text-dim)' }}>
                Start of the tune — bar 0 · {track.gridStart === null ? '0:00 (the beginning)' : preciseTime(track.gridStart)}
              </div>
              {(
                [
                  ['flag', `Set the start here (${preciseTime(startMenu.time)})`, startMenu.time],
                  ['my_location', `Set it where the track is now (${preciseTime(audioRef.current?.currentTime ?? 0)})`, audioRef.current?.currentTime ?? 0],
                  ['graphic_eq', `Set it on the detected first beat (${preciseTime(detectedStart(grid, duration || track.duration || 0))})`, detectedStart(grid, duration || track.duration || 0)],
                  ...(track.gridStart !== null ? ([['first_page', 'Put it back at 0:00', null]] as const) : []),
                ] as const
              ).map(([icon, label, value]) => (
                <button
                  key={icon}
                  onClick={() => {
                    void useCollectionStore.getState().setTrackGridStart(track.id, value)
                    setStartMenu(null)
                  }}
                  style={contextMenuItemStyle}
                >
                  <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                    {icon}
                  </span>
                  {label}
                </button>
              ))}
            </div>
          )}
          <CueMarkers
            cues={cues}
            duration={duration || track.duration || 0}
            suggestions={suggestions}
            drag={{
              trackId: track.id,
              bpm: track.bpm,
              gridStart: gridStart(grid),
              onMove: (slot, time) =>
                void (slot === START_SLOT
                  ? useCollectionStore.getState().setTrackGridStart(track.id, time)
                  : useCollectionStore.getState().setHotCue(track.id, slot, time)),
              onJump: (slot) => (slot === START_SLOT ? jumpTo(track.gridStart ?? 0) : hotCue(slot)),
            }}
            start={track.gridStart}
            audioRef={audioRef}
          />
          {peaks && peaks.length > 0 ? (
            <PlayerWaveform
              peaks={peaks}
              bands={bands}
              style={waveformStyle}
              showGrid={waveformGrid}
              height={size.waveHeight}
              progress={progress}
              duration={duration}
              cuePoint={cuePoint}
              bpm={track.bpm}
              gridStart={gridStart(grid)}
              onSeek={seekToClientX}
            />
          ) : (
            // No waveform data yet (track not analyzed) — still seekable,
            // just without the visualization.
            <div
              onClick={(e) => seekToClientX(e.clientX, e.currentTarget)}
              style={{ position: 'relative', height: `${size.waveHeight}px`, borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
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

      <HotCuePads
        cues={cues}
        onPad={hotCue}
        onDelete={(slot) => void useCollectionStore.getState().removeHotCue(track.id, slot)}
        onChange={(slot, changes) => void useCollectionStore.getState().updateHotCue(track.id, slot, changes)}
        suggestions={suggestions}
        onSuggest={async (slot, time, from) => {
          const store = useCollectionStore.getState()
          await store.setHotCue(track.id, slot, time)
          if (from !== undefined && from !== slot) await store.deleteHotCue(track.id, from)
        }}
      />
    </div>
  )
}

// Shown when the queue is empty: the same layout as Player, so the footer
// (and the panes above it) don't jump when a track loads or the queue runs
// out — just with the transport controls disabled. Volume still works,
// since it's global player state rather than tied to a track.
export function EmptyPlayer() {
  const playerVolume = useCollectionStore((s) => s.playerVolume)
  const setPlayerVolume = useCollectionStore((s) => s.setPlayerVolume)
  const lastVolumeRef = useRef(1)
  const size = usePlayerSize()
  return (
    <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-text-dim)' }}>Nothing queued</span>
        <div style={{ marginLeft: 'auto', paddingLeft: '8px', display: 'flex', alignItems: 'center' }}>
          <PlayerSizeButton />
          <PlayerScreenButtons hasTrack={false} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button disabled style={{ fontWeight: 700, fontSize: '11px', letterSpacing: '0.05em' }}>
          CUE
        </button>
        <MidiLearnBadge control="player.cue" />

        <button disabled title="Nothing to play — add a track to the queue">
          <span className="material-symbols-outlined">play_arrow</span>
        </button>
        <MidiLearnBadge control="player.playPause" />

        <button disabled title="Play next in queue">
          <span className="material-symbols-outlined">skip_next</span>
        </button>
        <MidiLearnBadge control="player.playNext" />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ height: `${size.waveHeight}px`, borderBottom: '1px solid var(--color-border)' }} />
          <div style={{ marginTop: '4px', height: '2px', background: 'var(--color-border)', borderRadius: '1px' }} />
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

      {/* The same row as with a track, so the footer doesn't jump. */}
      <HotCuePads cues={[]} onPad={() => {}} onDelete={() => {}} onChange={() => {}} disabled />
    </div>
  )
}
