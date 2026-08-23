// src/components/FxPanel.tsx
import { useEffect, useRef, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { MidiLearnBadge } from './MidiLearnBadge'
import { Knob } from './Knob'
import { ToggleSwitch } from './ToggleSwitch'
import { getDubSirenEngine } from '../audio/sirenEngine'
import {
  SIREN_MODES,
  SIREN_BEATS,
  DELAY_DIVISIONS,
  DEFAULT_EFFECTS_SETTINGS,
  DEFAULT_SIREN_SETTINGS,
  type EffectsSettings,
  type MidiControlKey,
  type SirenSettings,
  type Track,
} from '../types'

// The Division knob has no "current" value of its own to read back from
// effectsSettings — picking a division is a one-shot action (recompute
// delay.timeMs from the current track's BPM), not a persisted setting,
// so this index is purely local UI state for the knob's position and
// double-click reset. 1/4 (index 2) is a sensible, common default.
const DEFAULT_DIVISION_INDEX = 2

// Dragging a knob fires onChange on every pointermove, same frequency a
// range input fired on every native input event — coalescing to at most
// one commit per animation frame avoids the same churn (full store
// update + re-render + a fresh audio-param automation call, or for
// decaySeconds a full impulse-response buffer regeneration) that once
// caused an audible delay-time glitch. See effectsChain.ts's own
// setTargetAtTime smoothing for the rest of that fix.
function useRafThrottledCommit(commit: (value: number) => void): (value: number) => void {
  const pending = useRef<number | null>(null)
  const rafId = useRef<number | null>(null)
  return (value: number) => {
    pending.current = value
    if (rafId.current !== null) return
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null
      if (pending.current !== null) {
        commit(pending.current)
        pending.current = null
      }
    })
  }
}

// One knob + its label + MIDI-learn badge, stacked vertically — the unit
// each FX section repeats horizontally.
function KnobField({
  label,
  control,
  value,
  min,
  max,
  step,
  onChange,
  bipolar,
  formatValue,
  defaultValue,
  disabled,
}: {
  label: string
  control: MidiControlKey
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  bipolar?: boolean
  formatValue?: (value: number) => string
  defaultValue?: number
  disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '56px' }}>
      <Knob
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        bipolar={bipolar}
        formatValue={formatValue}
        defaultValue={defaultValue}
        disabled={disabled}
      />
      <span style={{ fontSize: '9px', color: 'var(--color-text-dim)', textAlign: 'center', lineHeight: 1.2 }}>
        {label}
      </span>
      <span style={{ fontSize: '9px', color: 'var(--color-text)', textAlign: 'center', lineHeight: 1.2 }}>
        {formatValue ? formatValue(value) : value}
      </span>
      <MidiLearnBadge control={control} />
    </div>
  )
}

// Lives in the right half of the full-screen queue view (PlaylistView),
// mirroring the queue's left half. `track` (the currently-playing track,
// if any) is only used for the delay-time BPM sync — the FX settings
// themselves are global, not per-track.
export function FxPanel({ track }: { track: Track | null }) {
  const effectsSettings = useCollectionStore((s) => s.effectsSettings)
  const setEffectsSettings = useCollectionStore((s) => s.setEffectsSettings)
  const sirenTriggered = useCollectionStore((s) => s.sirenTriggered)
  const setSirenTriggered = useCollectionStore((s) => s.setSirenTriggered)
  const setDelayDivisionSync = useCollectionStore((s) => s.setDelayDivisionSync)
  const [divisionIndex, setDivisionIndex] = useState(DEFAULT_DIVISION_INDEX)

  function updateDelay(partial: Partial<EffectsSettings['delay']>) {
    setEffectsSettings({ ...effectsSettings, delay: { ...effectsSettings.delay, ...partial } })
  }

  function updateReverb(partial: Partial<EffectsSettings['reverb']>) {
    setEffectsSettings({ ...effectsSettings, reverb: { ...effectsSettings.reverb, ...partial } })
  }

  function updateFilter(partial: Partial<EffectsSettings['filter']>) {
    setEffectsSettings({ ...effectsSettings, filter: { ...effectsSettings.filter, ...partial } })
  }

  function updateEq(partial: Partial<EffectsSettings['eq']>) {
    setEffectsSettings({ ...effectsSettings, eq: { ...effectsSettings.eq, ...partial } })
  }

  function updateSiren(partial: Partial<SirenSettings>) {
    setEffectsSettings({ ...effectsSettings, siren: { ...effectsSettings.siren, ...partial } })
  }

  const handleTimeChange = useRafThrottledCommit((v) => updateDelay({ timeMs: v }))
  const handleDecayChange = useRafThrottledCommit((v) => updateReverb({ decaySeconds: v }))

  // beats is a multiple of one quarter note at the track's BPM, clamped
  // to the slider's 0-1000ms range (a whole note below ~60 BPM would
  // exceed it).
  function syncDelayToDivision(beats: number) {
    if (!track?.bpm) return
    const ms = Math.round((60000 / track.bpm) * beats)
    updateDelay({ timeMs: Math.min(1000, ms) })
  }

  function applyDivision(index: number) {
    setDivisionIndex(index)
    syncDelayToDivision(DELAY_DIVISIONS[index].beats)
  }

  // Same imperative-registration pattern as Player.tsx's playbackControls:
  // a ref keeps the store's callback pointing at the latest applyDivision
  // (which closes over `track`) without re-registering on every render.
  const applyDivisionRef = useRef(applyDivision)
  applyDivisionRef.current = applyDivision
  useEffect(() => {
    setDelayDivisionSync((index) => applyDivisionRef.current(index))
    return () => setDelayDivisionSync(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sectionStyle = { borderTop: '1px solid var(--color-border)', paddingTop: '16px' }
  const headerRowStyle = { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }
  const knobRowStyle = { display: 'flex', flexWrap: 'wrap' as const, gap: '10px', alignItems: 'flex-start' }

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
      <div style={{ ...sectionStyle, borderTop: 'none', paddingTop: 0 }}>
        <div style={headerRowStyle}>
          <ToggleSwitch
            checked={effectsSettings.eq.enabled}
            onChange={(checked) => updateEq({ enabled: checked })}
            title="EQ on/off"
          />
          <h4 style={{ margin: 0 }}>EQ</h4>
          <MidiLearnBadge control="eq.enabled" />
        </div>
        <div style={knobRowStyle}>
          <KnobField
            label="Mix"
            control="eq.mix"
            value={effectsSettings.eq.mix}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updateEq({ mix: v })}
            defaultValue={DEFAULT_EFFECTS_SETTINGS.eq.mix}
            formatValue={(v) => v.toFixed(2)}
          />
          <KnobField
            label="Low"
            control="eq.low"
            value={effectsSettings.eq.low}
            min={-24}
            max={24}
            step={0.5}
            onChange={(v) => updateEq({ low: v })}
            bipolar
            defaultValue={DEFAULT_EFFECTS_SETTINGS.eq.low}
            formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`}
          />
          <KnobField
            label="Mid"
            control="eq.mid"
            value={effectsSettings.eq.mid}
            min={-24}
            max={24}
            step={0.5}
            onChange={(v) => updateEq({ mid: v })}
            bipolar
            defaultValue={DEFAULT_EFFECTS_SETTINGS.eq.mid}
            formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`}
          />
          <KnobField
            label="High"
            control="eq.high"
            value={effectsSettings.eq.high}
            min={-24}
            max={24}
            step={0.5}
            onChange={(v) => updateEq({ high: v })}
            bipolar
            defaultValue={DEFAULT_EFFECTS_SETTINGS.eq.high}
            formatValue={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`}
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={headerRowStyle}>
          <ToggleSwitch
            checked={effectsSettings.filter.enabled}
            onChange={(checked) => updateFilter({ enabled: checked })}
            title="Filter on/off"
          />
          <h4 style={{ margin: 0 }}>Filter</h4>
          <MidiLearnBadge control="filter.enabled" />
        </div>
        <div style={knobRowStyle}>
          <KnobField
            label="LP"
            control="filter.lowpass"
            value={effectsSettings.filter.lowpass}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updateFilter({ lowpass: v })}
            defaultValue={DEFAULT_EFFECTS_SETTINGS.filter.lowpass}
            formatValue={(v) => (v === 0 ? 'Open' : `${Math.round(v * 100)}%`)}
          />
          <KnobField
            label="HP"
            control="filter.highpass"
            value={effectsSettings.filter.highpass}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updateFilter({ highpass: v })}
            defaultValue={DEFAULT_EFFECTS_SETTINGS.filter.highpass}
            formatValue={(v) => (v === 0 ? 'Open' : `${Math.round(v * 100)}%`)}
          />
          <KnobField
            label="Resonance"
            control="filter.resonance"
            value={effectsSettings.filter.resonance}
            min={0.7}
            max={20}
            step={0.1}
            onChange={(v) => updateFilter({ resonance: v })}
            defaultValue={DEFAULT_EFFECTS_SETTINGS.filter.resonance}
            formatValue={(v) => v.toFixed(1)}
          />
          <button
            onClick={() => updateFilter({ lowpass: 0, highpass: 0 })}
            disabled={effectsSettings.filter.lowpass === 0 && effectsSettings.filter.highpass === 0}
            title="Reset both to fully open"
            style={{ fontSize: '10px', padding: '0 4px', alignSelf: 'center' }}
          >
            Reset
          </button>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={headerRowStyle}>
          <ToggleSwitch
            checked={effectsSettings.delay.enabled}
            onChange={(checked) => updateDelay({ enabled: checked })}
            title="Delay on/off"
          />
          <h4 style={{ margin: 0 }}>Delay</h4>
          <MidiLearnBadge control="delay.enabled" />
        </div>
        <div style={knobRowStyle}>
          <KnobField
            label="Mix"
            control="delay.mix"
            value={effectsSettings.delay.mix}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updateDelay({ mix: v })}
            defaultValue={DEFAULT_EFFECTS_SETTINGS.delay.mix}
            formatValue={(v) => v.toFixed(2)}
          />
          <KnobField
            label="Time"
            control="delay.timeMs"
            value={effectsSettings.delay.timeMs}
            min={0}
            max={1000}
            step={10}
            onChange={handleTimeChange}
            defaultValue={DEFAULT_EFFECTS_SETTINGS.delay.timeMs}
            formatValue={(v) => `${Math.round(v)} ms`}
          />
          <KnobField
            label="Feedback"
            control="delay.feedback"
            value={effectsSettings.delay.feedback}
            min={0}
            max={0.9}
            step={0.01}
            onChange={(v) => updateDelay({ feedback: v })}
            defaultValue={DEFAULT_EFFECTS_SETTINGS.delay.feedback}
            formatValue={(v) => v.toFixed(2)}
          />
          <KnobField
            label="Division"
            control="delay.division"
            value={divisionIndex}
            min={0}
            max={DELAY_DIVISIONS.length - 1}
            step={1}
            onChange={(v) => applyDivision(Math.round(v))}
            defaultValue={DEFAULT_DIVISION_INDEX}
            disabled={!track?.bpm}
            formatValue={(v) =>
              track?.bpm
                ? `${DELAY_DIVISIONS[Math.round(v)].label} @ ${Math.round(track.bpm)} BPM`
                : 'No BPM detected for this track'
            }
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={headerRowStyle}>
          <ToggleSwitch
            checked={effectsSettings.reverb.enabled}
            onChange={(checked) => updateReverb({ enabled: checked })}
            title="Reverb on/off"
          />
          <h4 style={{ margin: 0 }}>Reverb</h4>
          <MidiLearnBadge control="reverb.enabled" />
        </div>
        <div style={knobRowStyle}>
          <KnobField
            label="Mix"
            control="reverb.mix"
            value={effectsSettings.reverb.mix}
            min={0}
            max={2}
            step={0.01}
            onChange={(v) => updateReverb({ mix: v })}
            defaultValue={DEFAULT_EFFECTS_SETTINGS.reverb.mix}
            formatValue={(v) => v.toFixed(2)}
          />
          <KnobField
            label="Decay"
            control="reverb.decaySeconds"
            value={effectsSettings.reverb.decaySeconds}
            min={0.2}
            max={5}
            step={0.1}
            onChange={handleDecayChange}
            defaultValue={DEFAULT_EFFECTS_SETTINGS.reverb.decaySeconds}
            formatValue={(v) => `${v.toFixed(1)} s`}
          />
          <KnobField
            label="Pre-delay"
            control="reverb.preDelayMs"
            value={effectsSettings.reverb.preDelayMs}
            min={0}
            max={200}
            step={1}
            onChange={(v) => updateReverb({ preDelayMs: v })}
            defaultValue={DEFAULT_EFFECTS_SETTINGS.reverb.preDelayMs}
            formatValue={(v) => `${Math.round(v)} ms`}
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={headerRowStyle}>
          <ToggleSwitch
            checked={effectsSettings.siren.enabled}
            onChange={(checked) => {
              updateSiren({ enabled: checked })
              if (checked) getDubSirenEngine().resume()
            }}
            title="Siren on/off"
          />
          <h4 style={{ margin: 0 }}>Dub Siren</h4>
          <MidiLearnBadge control="siren.enabled" />
        </div>
        <div style={knobRowStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '64px' }}>
            <select
              value={effectsSettings.siren.mode}
              onChange={(e) => updateSiren({ mode: e.target.value as SirenSettings['mode'] })}
              style={{ fontSize: '10px', width: '64px' }}
            >
              {SIREN_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
            <span style={{ fontSize: '9px', color: 'var(--color-text-dim)' }}>Mode</span>
            <MidiLearnBadge control="siren.mode" />
          </div>
          <KnobField
            label="Pitch"
            control="siren.pitchHz"
            value={effectsSettings.siren.pitchHz}
            min={90}
            max={520}
            step={1}
            onChange={(v) => updateSiren({ pitchHz: v })}
            defaultValue={DEFAULT_SIREN_SETTINGS.pitchHz}
            formatValue={(v) => `${Math.round(v)} Hz`}
          />
          <KnobField
            label="Speed"
            control="siren.speedHz"
            value={effectsSettings.siren.speedHz}
            min={0.5}
            max={12}
            step={0.1}
            onChange={(v) => updateSiren({ speedHz: v })}
            defaultValue={DEFAULT_SIREN_SETTINGS.speedHz}
            formatValue={(v) => `${v.toFixed(1)} Hz`}
          />
          <KnobField
            label="Depth"
            control="siren.depth"
            value={effectsSettings.siren.depth}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => updateSiren({ depth: v })}
            defaultValue={DEFAULT_SIREN_SETTINGS.depth}
            formatValue={(v) => v.toFixed(2)}
          />
          <KnobField
            label="Echo"
            control="siren.echoFeedback"
            value={effectsSettings.siren.echoFeedback}
            min={0}
            max={0.85}
            step={0.01}
            onChange={(v) => updateSiren({ echoFeedback: v })}
            defaultValue={DEFAULT_SIREN_SETTINGS.echoFeedback}
            formatValue={(v) => v.toFixed(2)}
          />
          <KnobField
            label="Level"
            control="siren.level"
            value={effectsSettings.siren.level}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updateSiren({ level: v })}
            defaultValue={DEFAULT_SIREN_SETTINGS.level}
            formatValue={(v) => v.toFixed(2)}
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '64px' }}>
            <select
              value={effectsSettings.siren.beat}
              onChange={(e) => updateSiren({ beat: e.target.value as SirenSettings['beat'] })}
              style={{ fontSize: '10px', width: '64px' }}
            >
              {SIREN_BEATS.map((beat) => (
                <option key={beat} value={beat}>
                  {beat}
                </option>
              ))}
            </select>
            <span style={{ fontSize: '9px', color: 'var(--color-text-dim)' }}>Beat</span>
            <MidiLearnBadge control="siren.beat" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '64px' }}>
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
