// src/components/MicPanel.tsx
//
// The Mic FX group of the FX and Live screens (docs/features/recording.md):
// the mic's voice chain and its own effects, as knob cards like the
// track's FX. Switching the mic on, its input, level and Talk are in the
// player bar's Mic popover (MicButton).
import { useState } from 'react'
import { useCollectionStore } from '../state/store'
import { echoTimeForDivision } from '../audio/micControls'
import { KnobField, fxGridStyle, useRafThrottledCommit } from './FxPanel'
import { MidiLearnBadge } from './MidiLearnBadge'
import { ToggleSwitch } from './ToggleSwitch'
import { HoldButton } from './MicWidgets'
import { DEFAULT_MIC_SETTINGS, DELAY_DIVISIONS, MIC_GATE_OFF_DB, type MicSettings, type Track } from '../types'

const DEFAULT_DIVISION_INDEX = 3 // 1/8

const sectionStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  padding: '12px 14px',
}
const headerRowStyle = { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }
const knobRowStyle = { display: 'flex', flexWrap: 'wrap' as const, gap: '10px', alignItems: 'flex-start' }
const dbLabel = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`

export function MicPanel({ track }: { track: Track | null }) {
  const mic = useCollectionStore((s) => s.micSettings)
  const setMic = useCollectionStore((s) => s.setMicSettings)
  const throwHeld = useCollectionStore((s) => s.micThrow)
  const setThrow = useCollectionStore((s) => s.setMicThrow)
  const [divisionIndex, setDivisionIndex] = useState(DEFAULT_DIVISION_INDEX)

  const update = (partial: Partial<MicSettings>) => setMic({ ...useCollectionStore.getState().micSettings, ...partial })
  const updateEq = (partial: Partial<MicSettings['eq']>) => update({ eq: { ...mic.eq, ...partial } })
  const updateEcho = (partial: Partial<MicSettings['echo']>) => update({ echo: { ...mic.echo, ...partial } })
  const updateReverb = (partial: Partial<MicSettings['reverb']>) => update({ reverb: { ...mic.reverb, ...partial } })
  const updatePitch = (partial: Partial<MicSettings['pitch']>) => update({ pitch: { ...mic.pitch, ...partial } })
  const updateRadio = (partial: Partial<MicSettings['radio']>) => update({ radio: { ...mic.radio, ...partial } })
  const updateDuck = (partial: Partial<MicSettings['duck']>) => update({ duck: { ...mic.duck, ...partial } })
  const handleEchoTime = useRafThrottledCommit((v) => updateEcho({ timeMs: v }))
  const handleDecay = useRafThrottledCommit((v) => updateReverb({ decaySeconds: v }))

  function applyDivision(index: number) {
    setDivisionIndex(index)
    if (track?.bpm) updateEcho({ timeMs: echoTimeForDivision(track.bpm, DELAY_DIVISIONS[index].beats) })
  }

  const d = DEFAULT_MIC_SETTINGS
  return (
    <div style={fxGridStyle}>
      <div style={sectionStyle}>
        <div style={headerRowStyle}>
          <h4 style={{ margin: 0 }}>Voice</h4>
        </div>
        <div style={knobRowStyle}>
          <KnobField label="Gain" control="mic.gainDb" value={mic.gainDb} min={-12} max={24} step={0.5} onChange={(v) => update({ gainDb: v })} defaultValue={d.gainDb} formatValue={dbLabel} />
          <KnobField
            label="Gate"
            control="mic.gateDb"
            value={mic.gateDb}
            min={MIC_GATE_OFF_DB}
            max={-20}
            step={1}
            onChange={(v) => update({ gateDb: v })}
            defaultValue={d.gateDb}
            formatValue={(v) => (v <= MIC_GATE_OFF_DB ? 'Off' : `${Math.round(v)} dB`)}
          />
          <KnobField
            label="Comp"
            control="mic.compressor"
            value={mic.compressor}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => update({ compressor: v })}
            defaultValue={d.compressor}
            formatValue={(v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`)}
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={headerRowStyle}>
          <h4 style={{ margin: 0 }}>EQ</h4>
        </div>
        <div style={knobRowStyle}>
          <KnobField label="Low" control="mic.eq.low" value={mic.eq.low} min={-12} max={12} step={0.5} onChange={(v) => updateEq({ low: v })} bipolar defaultValue={d.eq.low} formatValue={dbLabel} />
          <KnobField label="Mid" control="mic.eq.mid" value={mic.eq.mid} min={-12} max={12} step={0.5} onChange={(v) => updateEq({ mid: v })} bipolar defaultValue={d.eq.mid} formatValue={dbLabel} />
          <KnobField label="High" control="mic.eq.high" value={mic.eq.high} min={-12} max={12} step={0.5} onChange={(v) => updateEq({ high: v })} bipolar defaultValue={d.eq.high} formatValue={dbLabel} />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={headerRowStyle}>
          <ToggleSwitch checked={mic.pitch.enabled} onChange={(checked) => updatePitch({ enabled: checked })} title="Voice pitch on/off" />
          <h4 style={{ margin: 0 }}>Pitch</h4>
          <MidiLearnBadge control="mic.pitch.enabled" />
        </div>
        <div style={knobRowStyle}>
          <KnobField
            label="Semitones"
            control="mic.pitch.semitones"
            value={mic.pitch.semitones}
            min={-12}
            max={12}
            step={1}
            onChange={(v) => updatePitch({ semitones: v })}
            bipolar
            defaultValue={d.pitch.semitones}
            formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)} st`}
          />
          <KnobField
            label="Mix"
            control="mic.pitch.mix"
            value={mic.pitch.mix}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => updatePitch({ mix: v })}
            defaultValue={d.pitch.mix}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', maxWidth: '150px', alignSelf: 'center' }}>
            Down for a deep voice, up for a high one. Mix below 100% keeps your own voice in.
          </span>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={headerRowStyle}>
          <ToggleSwitch checked={mic.echo.enabled} onChange={(checked) => updateEcho({ enabled: checked })} title="Mic echo on/off" />
          <h4 style={{ margin: 0 }}>Echo</h4>
          <MidiLearnBadge control="mic.echo.enabled" />
        </div>
        <div style={knobRowStyle}>
          <KnobField label="Mix" control="mic.echo.mix" value={mic.echo.mix} min={0} max={1} step={0.01} onChange={(v) => updateEcho({ mix: v })} defaultValue={d.echo.mix} formatValue={(v) => v.toFixed(2)} />
          <KnobField label="Time" control="mic.echo.timeMs" value={mic.echo.timeMs} min={20} max={1000} step={5} onChange={handleEchoTime} defaultValue={d.echo.timeMs} formatValue={(v) => `${Math.round(v)} ms`} />
          <KnobField label="Feedback" control="mic.echo.feedback" value={mic.echo.feedback} min={0} max={0.9} step={0.01} onChange={(v) => updateEcho({ feedback: v })} defaultValue={d.echo.feedback} formatValue={(v) => v.toFixed(2)} />
          <KnobField
            label="Division"
            control="mic.echo.division"
            value={divisionIndex}
            min={0}
            max={DELAY_DIVISIONS.length - 1}
            step={1}
            onChange={(v) => applyDivision(Math.round(v))}
            defaultValue={DEFAULT_DIVISION_INDEX}
            disabled={!track?.bpm}
            formatValue={(v) => (track?.bpm ? `${DELAY_DIVISIONS[Math.round(v)].label} @ ${Math.round(track.bpm)} BPM` : 'No BPM')}
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '64px' }}>
            <HoldButton
              label="THROW"
              lit={throwHeld}
              disabled={!mic.enabled}
              title="Hold: what you say goes into the echo, even with Echo off"
              onDown={() => setThrow(true)}
              onUp={() => setThrow(false)}
            />
            <MidiLearnBadge control="mic.echo.throw" />
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={headerRowStyle}>
          <ToggleSwitch checked={mic.reverb.enabled} onChange={(checked) => updateReverb({ enabled: checked })} title="Mic reverb on/off" />
          <h4 style={{ margin: 0 }}>Reverb</h4>
          <MidiLearnBadge control="mic.reverb.enabled" />
        </div>
        <div style={knobRowStyle}>
          <KnobField label="Mix" control="mic.reverb.mix" value={mic.reverb.mix} min={0} max={1} step={0.01} onChange={(v) => updateReverb({ mix: v })} defaultValue={d.reverb.mix} formatValue={(v) => v.toFixed(2)} />
          <KnobField label="Decay" control="mic.reverb.decaySeconds" value={mic.reverb.decaySeconds} min={0.2} max={5} step={0.1} onChange={handleDecay} defaultValue={d.reverb.decaySeconds} formatValue={(v) => `${v.toFixed(1)} s`} />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={headerRowStyle}>
          <ToggleSwitch checked={mic.radio.enabled} onChange={(checked) => updateRadio({ enabled: checked })} title="Radio voice on/off" />
          <h4 style={{ margin: 0 }}>Radio</h4>
          <MidiLearnBadge control="mic.radio.enabled" />
        </div>
        <div style={knobRowStyle}>
          <KnobField label="Drive" control="mic.radio.drive" value={mic.radio.drive} min={0} max={1} step={0.01} onChange={(v) => updateRadio({ drive: v })} defaultValue={d.radio.drive} formatValue={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={headerRowStyle}>
          <ToggleSwitch checked={mic.duck.enabled} onChange={(checked) => updateDuck({ enabled: checked })} title="Ducking on/off" />
          <h4 style={{ margin: 0 }}>Ducking</h4>
          <MidiLearnBadge control="mic.duck.enabled" />
        </div>
        <div style={knobRowStyle}>
          <KnobField label="Amount" control="mic.duck.amountDb" value={mic.duck.amountDb} min={0} max={24} step={0.5} onChange={(v) => updateDuck({ amountDb: v })} defaultValue={d.duck.amountDb} formatValue={(v) => `−${v.toFixed(1)} dB`} />
          <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', maxWidth: '150px', alignSelf: 'center' }}>
            Turns the music down while you talk.
          </span>
        </div>
      </div>
    </div>
  )
}
