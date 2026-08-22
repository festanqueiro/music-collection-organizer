// src/components/FxPanel.tsx
import { useRef } from 'react'
import { useCollectionStore } from '../state/store'
import { MidiLearnBadge } from './MidiLearnBadge'
import { getDubSirenEngine } from '../audio/sirenEngine'
import { SIREN_MODES, SIREN_BEATS, type EffectsSettings, type SirenSettings, type Track } from '../types'

// Lives in the right half of the full-screen queue view (PlaylistView),
// mirroring the queue's left half. `track` (the currently-playing track,
// if any) is only used for the delay-time BPM sync — the FX settings
// themselves are global, not per-track.
export function FxPanel({ track }: { track: Track | null }) {
  const effectsSettings = useCollectionStore((s) => s.effectsSettings)
  const setEffectsSettings = useCollectionStore((s) => s.setEffectsSettings)
  const sirenTriggered = useCollectionStore((s) => s.sirenTriggered)
  const setSirenTriggered = useCollectionStore((s) => s.setSirenTriggered)

  function updateDelay(partial: Partial<EffectsSettings['delay']>) {
    setEffectsSettings({ ...effectsSettings, delay: { ...effectsSettings.delay, ...partial } })
  }

  // Dragging the Time slider fires a native input event on every pixel of
  // movement — each one used to trigger a full store update, re-render,
  // and a fresh DelayNode.delayTime automation call. Coalescing to at most
  // one commit per animation frame cuts that churn dramatically without
  // adding any perceptible input lag, and reduces how often the delay
  // line's read position gets nudged, which is what caused the glitch.
  const pendingTimeMs = useRef<number | null>(null)
  const rafId = useRef<number | null>(null)
  function handleTimeChange(value: number) {
    pendingTimeMs.current = value
    if (rafId.current !== null) return
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null
      if (pendingTimeMs.current !== null) {
        updateDelay({ timeMs: pendingTimeMs.current })
        pendingTimeMs.current = null
      }
    })
  }

  function updateReverb(partial: Partial<EffectsSettings['reverb']>) {
    setEffectsSettings({ ...effectsSettings, reverb: { ...effectsSettings.reverb, ...partial } })
  }

  // Same rAF-coalescing as the delay Time slider above — decaySeconds
  // changing regenerates the reverb's whole impulse-response buffer
  // (a length*channels Math.random() loop), so doing that on every pixel
  // of a drag rather than once per frame is real, avoidable main-thread
  // work.
  const pendingDecaySeconds = useRef<number | null>(null)
  const decayRafId = useRef<number | null>(null)
  function handleDecayChange(value: number) {
    pendingDecaySeconds.current = value
    if (decayRafId.current !== null) return
    decayRafId.current = requestAnimationFrame(() => {
      decayRafId.current = null
      if (pendingDecaySeconds.current !== null) {
        updateReverb({ decaySeconds: pendingDecaySeconds.current })
        pendingDecaySeconds.current = null
      }
    })
  }

  function updateSiren(partial: Partial<SirenSettings>) {
    setEffectsSettings({ ...effectsSettings, siren: { ...effectsSettings.siren, ...partial } })
  }

  // One quarter-note at the track's BPM, clamped to the slider's 0-1000ms
  // range (a quarter note below 60 BPM would exceed it).
  function syncDelayToBpm() {
    if (!track?.bpm) return
    const quarterNoteMs = Math.round(60000 / track.bpm)
    updateDelay({ timeMs: Math.min(1000, quarterNoteMs) })
  }

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
      <div>
        <h4 style={{ margin: '0 0 8px' }}>Delay / Reverb</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'var(--color-text-dim)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="checkbox"
              checked={effectsSettings.delay.enabled}
              onChange={(e) => updateDelay({ enabled: e.target.checked })}
            />
            Delay
            <MidiLearnBadge control="delay.enabled" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Delay time">
            Time
            <input
              type="range"
              min={0}
              max={1000}
              step={10}
              value={effectsSettings.delay.timeMs}
              onChange={(e) => handleTimeChange(Number(e.target.value))}
              style={{ width: '100px' }}
            />
            <MidiLearnBadge control="delay.timeMs" />
            <button
              onClick={syncDelayToBpm}
              disabled={!track?.bpm}
              title={track?.bpm ? `Sync to ${Math.round(track.bpm)} BPM (quarter note)` : 'No BPM detected for this track'}
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
              style={{ width: '100px' }}
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
              style={{ width: '100px' }}
            />
            <MidiLearnBadge control="delay.mix" />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px' }}>
            <input
              type="checkbox"
              checked={effectsSettings.reverb.enabled}
              onChange={(e) => updateReverb({ enabled: e.target.checked })}
            />
            Reverb
            <MidiLearnBadge control="reverb.enabled" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Reverb mix">
            Mix
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={effectsSettings.reverb.mix}
              onChange={(e) => updateReverb({ mix: Number(e.target.value) })}
              style={{ width: '100px' }}
            />
            <MidiLearnBadge control="reverb.mix" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Decay time">
            Decay
            <input
              type="range"
              min={0.2}
              max={5}
              step={0.1}
              value={effectsSettings.reverb.decaySeconds}
              onChange={(e) => handleDecayChange(Number(e.target.value))}
              style={{ width: '100px' }}
            />
            <MidiLearnBadge control="reverb.decaySeconds" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Pre-delay">
            Pre-delay
            <input
              type="range"
              min={0}
              max={200}
              step={1}
              value={effectsSettings.reverb.preDelayMs}
              onChange={(e) => updateReverb({ preDelayMs: Number(e.target.value) })}
              style={{ width: '100px' }}
            />
            <MidiLearnBadge control="reverb.preDelayMs" />
          </label>
        </div>
      </div>

      <div style={{ flex: 1, borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
        <h4 style={{ margin: '0 0 8px' }}>Dub Siren</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'var(--color-text-dim)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="checkbox"
              checked={effectsSettings.siren.enabled}
              onChange={(e) => {
                updateSiren({ enabled: e.target.checked })
                if (e.target.checked) getDubSirenEngine().resume()
              }}
            />
            Siren
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Mode">
            Mode
            <select
              value={effectsSettings.siren.mode}
              onChange={(e) => updateSiren({ mode: e.target.value as SirenSettings['mode'] })}
            >
              {SIREN_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
            <MidiLearnBadge control="siren.mode" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Pitch">
            Pitch
            <input
              type="range"
              min={90}
              max={520}
              step={1}
              value={effectsSettings.siren.pitchHz}
              onChange={(e) => updateSiren({ pitchHz: Number(e.target.value) })}
              style={{ width: '100px' }}
            />
            <MidiLearnBadge control="siren.pitchHz" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Speed (LFO rate)">
            Speed
            <input
              type="range"
              min={0.5}
              max={12}
              step={0.1}
              value={effectsSettings.siren.speedHz}
              onChange={(e) => updateSiren({ speedHz: Number(e.target.value) })}
              style={{ width: '100px' }}
            />
            <MidiLearnBadge control="siren.speedHz" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Depth (how wide the pitch swings from the base note)">
            Depth
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={effectsSettings.siren.depth}
              onChange={(e) => updateSiren({ depth: Number(e.target.value) })}
              style={{ width: '100px' }}
            />
            <MidiLearnBadge control="siren.depth" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Echo feedback">
            Echo
            <input
              type="range"
              min={0}
              max={0.85}
              step={0.01}
              value={effectsSettings.siren.echoFeedback}
              onChange={(e) => updateSiren({ echoFeedback: Number(e.target.value) })}
              style={{ width: '100px' }}
            />
            <MidiLearnBadge control="siren.echoFeedback" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Level">
            Level
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={effectsSettings.siren.level}
              onChange={(e) => updateSiren({ level: Number(e.target.value) })}
              style={{ width: '100px' }}
            />
            <MidiLearnBadge control="siren.level" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Hands-free auto-fire tempo">
            Beat
            <select
              value={effectsSettings.siren.beat}
              onChange={(e) => updateSiren({ beat: e.target.value as SirenSettings['beat'] })}
            >
              {SIREN_BEATS.map((beat) => (
                <option key={beat} value={beat}>
                  {beat}
                </option>
              ))}
            </select>
            <MidiLearnBadge control="siren.beat" />
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
            <button
              disabled={!effectsSettings.siren.enabled || effectsSettings.siren.beat !== 'off'}
              title={
                !effectsSettings.siren.enabled
                  ? 'Enable the siren first'
                  : effectsSettings.siren.beat !== 'off'
                    ? 'Manual trigger is disabled while Beat is auto-firing'
                    : 'Hold to sound'
              }
              style={
                sirenTriggered
                  ? { background: 'var(--color-accent)', color: 'var(--color-bg)', borderColor: 'var(--color-accent)' }
                  : undefined
              }
              // Pointer capture so the pointerup always lands on this button
              // even if the mouse drags off it mid-hold — without it,
              // dragging off and releasing leaves the siren stuck on.
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                const engine = getDubSirenEngine()
                engine.resume()
                engine.triggerDown()
                setSirenTriggered(true)
              }}
              onPointerUp={() => {
                getDubSirenEngine().triggerUp()
                setSirenTriggered(false)
              }}
              onLostPointerCapture={() => {
                getDubSirenEngine().triggerUp()
                setSirenTriggered(false)
              }}
            >
              SIREN
            </button>
            <MidiLearnBadge control="siren.trigger" />
          </div>
        </div>
      </div>
    </div>
  )
}
