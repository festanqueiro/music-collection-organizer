// src/components/Player.tsx
import { useEffect, useRef, useState } from 'react'
import { trackPathToMediaUrl } from '../media'
import { useCollectionStore } from '../state/store'
import { EffectsChain } from '../audio/effectsChain'
import type { EffectsSettings, MidiControlKey, Track } from '../types'

// Renders as the app's footer player bar: track name + BPM, play/pause,
// waveform (doubles as the seek bar), volume, and the delay/reverb FX
// controls. All other track detail (artist, tags, full ID3) lives in
// DetailPanel instead — this component is deliberately just the
// now-playing strip.
export function Player({ track }: { track: Track }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const effectsChainRef = useRef<EffectsChain | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1 fraction of duration played
  const modalOpen = useCollectionStore((s) => s.modalOpen)
  const effectsSettings = useCollectionStore((s) => s.effectsSettings)
  const setEffectsSettings = useCollectionStore((s) => s.setEffectsSettings)
  const playerVolume = useCollectionStore((s) => s.playerVolume)
  const setPlayerVolume = useCollectionStore((s) => s.setPlayerVolume)

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

  // Player remounts fresh per track (keyed by track id in App.tsx), so
  // this runs once per track — matches createMediaElementSource's
  // requirement of being called at most once per <audio> element.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const chain = new EffectsChain(audio)
    chain.update(effectsSettings)
    effectsChainRef.current = chain
    return () => {
      chain.close()
      effectsChainRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    effectsChainRef.current?.update(effectsSettings)
  }, [effectsSettings])

  // playerVolume lives in the global store (not local state) so a MIDI
  // binding can drive it regardless of which track's Player is currently
  // mounted — this effect is what applies it to the actual <audio> element,
  // including on every fresh mount (new track) and on every external change.
  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = playerVolume
  }, [playerVolume])

  function updateDelay(partial: Partial<EffectsSettings['delay']>) {
    setEffectsSettings({ ...effectsSettings, delay: { ...effectsSettings.delay, ...partial } })
  }

  function updateReverb(partial: Partial<EffectsSettings['reverb']>) {
    setEffectsSettings({ ...effectsSettings, reverb: { ...effectsSettings.reverb, ...partial } })
  }

  // One quarter-note at the track's BPM, clamped to the slider's 0-1000ms
  // range (a quarter note below 60 BPM would exceed it).
  function syncDelayToBpm() {
    if (!track.bpm) return
    const quarterNoteMs = Math.round(60000 / track.bpm)
    updateDelay({ timeMs: Math.min(1000, quarterNoteMs) })
  }

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
  }

  const peaks = track.waveformPeaks

  return (
    <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <audio
        ref={audioRef}
        src={trackPathToMediaUrl(track.path)}
        onEnded={() => setPlaying(false)}
        onError={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const audio = e.currentTarget
          if (audio.duration && isFinite(audio.duration)) setProgress(audio.currentTime / audio.duration)
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ minWidth: '160px', maxWidth: '260px', overflow: 'hidden' }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
            {track.title ?? track.filename}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>
            {track.bpm ? `${Math.round(track.bpm)} BPM` : '— BPM'}
          </div>
        </div>

        <button onClick={toggle}>
          <span className="material-symbols-outlined">{playing ? 'pause' : 'play_arrow'}</span>
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          {peaks && peaks.length > 0 ? (
            <svg
              width="100%"
              height="40"
              viewBox={`0 0 ${peaks.length} 100`}
              preserveAspectRatio="none"
              onClick={(e) => seekToClientX(e.clientX, e.currentTarget)}
              style={{ cursor: 'pointer', display: 'block' }}
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
            <div style={{ height: '40px', borderBottom: '1px solid var(--color-border)' }} />
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Volume">
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            volume_up
          </span>
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

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '12px',
          fontSize: '12px',
          color: 'var(--color-text-dim)',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input
            type="checkbox"
            checked={effectsSettings.delay.enabled}
            onChange={(e) => updateDelay({ enabled: e.target.checked })}
          />
          Delay
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Delay time">
          Time
          <input
            type="range"
            min={0}
            max={1000}
            step={10}
            value={effectsSettings.delay.timeMs}
            onChange={(e) => updateDelay({ timeMs: Number(e.target.value) })}
            style={{ width: '60px' }}
          />
          <MidiLearnBadge control="delay.timeMs" />
          <button
            onClick={syncDelayToBpm}
            disabled={!track.bpm}
            title={track.bpm ? `Sync to ${Math.round(track.bpm)} BPM (quarter note)` : 'No BPM detected for this track'}
            style={{ fontSize: '10px', padding: '0 4px' }}
          >
            Sync
          </button>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Delay feedback">
          Feedback
          <input
            type="range"
            min={0}
            max={0.9}
            step={0.01}
            value={effectsSettings.delay.feedback}
            onChange={(e) => updateDelay({ feedback: Number(e.target.value) })}
            style={{ width: '60px' }}
          />
          <MidiLearnBadge control="delay.feedback" />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Delay mix">
          Mix
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={effectsSettings.delay.mix}
            onChange={(e) => updateDelay({ mix: Number(e.target.value) })}
            style={{ width: '60px' }}
          />
          <MidiLearnBadge control="delay.mix" />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input
            type="checkbox"
            checked={effectsSettings.reverb.enabled}
            onChange={(e) => updateReverb({ enabled: e.target.checked })}
          />
          Reverb
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Reverb mix">
          Mix
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={effectsSettings.reverb.mix}
            onChange={(e) => updateReverb({ mix: Number(e.target.value) })}
            style={{ width: '60px' }}
          />
          <MidiLearnBadge control="reverb.mix" />
        </label>
      </div>
    </div>
  )
}

// Three-state MIDI-learn toggle for one continuous control: unbound (click
// to start listening) → learning (move a hardware knob to bind it, or click
// to cancel) → bound (shows the CC number, click to unbind).
function MidiLearnBadge({ control }: { control: MidiControlKey }) {
  const midiMappings = useCollectionStore((s) => s.midiMappings)
  const midiLearningControl = useCollectionStore((s) => s.midiLearningControl)
  const startMidiLearn = useCollectionStore((s) => s.startMidiLearn)
  const cancelMidiLearn = useCollectionStore((s) => s.cancelMidiLearn)
  const clearMidiMapping = useCollectionStore((s) => s.clearMidiMapping)

  const binding = midiMappings[control]
  const badgeStyle = { fontSize: '10px', padding: '0 4px' }

  if (midiLearningControl === control) {
    return (
      <button onClick={cancelMidiLearn} title="Move a MIDI knob to bind, or click to cancel" style={badgeStyle}>
        Listening…
      </button>
    )
  }

  if (binding) {
    return (
      <button
        onClick={() => clearMidiMapping(control)}
        title={`Bound to CC${binding.controller} (channel ${binding.channel + 1}) — click to unbind`}
        style={badgeStyle}
      >
        CC{binding.controller}
      </button>
    )
  }

  return (
    <button onClick={() => startMidiLearn(control)} title="Click, then move a MIDI knob to bind it" style={badgeStyle}>
      MIDI
    </button>
  )
}
