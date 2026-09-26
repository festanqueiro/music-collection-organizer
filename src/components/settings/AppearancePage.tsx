import { useCollectionStore } from '../../state/store'
import type { KeyNotation } from '../../state/harmonic'
import { ThemePicker } from './ThemePicker'
import { Page, Section } from './ui'

export function AppearancePage() {
  const keyNotation = useCollectionStore((s) => s.keyNotation)
  const setKeyNotation = useCollectionStore((s) => s.setKeyNotation)

  return (
    <Page title="Appearance" description="How MCO looks. Changes apply straight away.">
      <Section title="Theme" description="The visualizer stays dark in every theme.">
        <ThemePicker />
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
