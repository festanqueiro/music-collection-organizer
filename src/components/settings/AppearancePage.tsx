import { useCollectionStore } from '../../state/store'
import type { KeyNotation } from '../../state/harmonic'
import { ThemePicker } from './ThemePicker'
import type { WaveformStyle } from '../../types'
import { Page, Section } from './ui'

export function AppearancePage() {
  const keyNotation = useCollectionStore((s) => s.keyNotation)
  const setKeyNotation = useCollectionStore((s) => s.setKeyNotation)
  const waveformStyle = useCollectionStore((s) => s.waveformStyle)
  const setWaveformStyle = useCollectionStore((s) => s.setWaveformStyle)
  const waveformGrid = useCollectionStore((s) => s.waveformGrid)
  const setWaveformGrid = useCollectionStore((s) => s.setWaveformGrid)

  return (
    <Page title="Appearance" description="How MCO looks. Changes apply straight away.">
      <Section title="Theme" description="The visualizer stays dark in every theme.">
        <ThemePicker />
      </Section>

      <Section
        title="Waveform"
        description="How the player's waveform is drawn. The two coloured styles read each track's bass, mids and highs: a track analysed before they existed takes a moment the first time it's played."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <select value={waveformStyle} onChange={(e) => setWaveformStyle(e.target.value as WaveformStyle)} aria-label="Waveform style">
            <option value="classic">Classic — one colour, the played part lit</option>
            <option value="rgb">RGB — coloured by frequency: red bass, green mids, blue highs</option>
            <option value="bands">3-band — bass, mids and highs as three waveforms: blue, orange, white</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" checked={waveformGrid} onChange={(e) => setWaveformGrid(e.target.checked)} />
            Bar lines on the waveform (a brighter one every 16 bars)
          </label>
        </div>
      </Section>

      <Section title="Key notation" description="How keys are shown in the table, the queue, the details panel and on the TV.">
        <div>
          <select value={keyNotation} onChange={(e) => setKeyNotation(e.target.value as KeyNotation)}>
            <option value="both">Camelot and musical (8A · Am)</option>
            <option value="camelot">Camelot (8A)</option>
            <option value="musical">Musical (Am)</option>
          </select>
        </div>
      </Section>
    </Page>
  )
}
