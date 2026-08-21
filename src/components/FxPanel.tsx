// src/components/FxPanel.tsx
import { useCollectionStore } from '../state/store'
import { MidiLearnBadge } from './MidiLearnBadge'
import type { EffectsSettings, Track } from '../types'

// Lives in the right half of the full-screen queue view (PlaylistView),
// mirroring the queue's left half. `track` (the currently-playing track,
// if any) is only used for the delay-time BPM sync — the FX settings
// themselves are global, not per-track.
export function FxPanel({ track }: { track: Track | null }) {
  const effectsSettings = useCollectionStore((s) => s.effectsSettings)
  const setEffectsSettings = useCollectionStore((s) => s.setEffectsSettings)

  function updateDelay(partial: Partial<EffectsSettings['delay']>) {
    setEffectsSettings({ ...effectsSettings, delay: { ...effectsSettings.delay, ...partial } })
  }

  function updateReverb(partial: Partial<EffectsSettings['reverb']>) {
    setEffectsSettings({ ...effectsSettings, reverb: { ...effectsSettings.reverb, ...partial } })
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
              onChange={(e) => updateDelay({ timeMs: Number(e.target.value) })}
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
              max={1}
              step={0.01}
              value={effectsSettings.reverb.mix}
              onChange={(e) => updateReverb({ mix: Number(e.target.value) })}
              style={{ width: '100px' }}
            />
            <MidiLearnBadge control="reverb.mix" />
          </label>
        </div>
      </div>

      {/* Reserved for the upcoming Dub Siren module — kept in the same
          50/50 FX half so it lands here without another layout pass. */}
      <div style={{ flex: 1, borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
        <h4 style={{ margin: '0 0 4px', color: 'var(--color-text-dim)' }}>Dub Siren</h4>
        <p style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>Coming soon.</p>
      </div>
    </div>
  )
}
