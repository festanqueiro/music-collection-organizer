import { useCollectionStore } from '../../state/store'
import { Page, PathText, Section, ToggleRow } from './ui'

export function LibraryPage({ onClose }: { onClose: () => void }) {
  const collectionFolder = useCollectionStore((s) => s.collectionFolder)
  const pickCollectionFolder = useCollectionStore((s) => s.pickCollectionFolder)
  const watchCollectionFolder = useCollectionStore((s) => s.watchCollectionFolder)
  const setWatchCollectionFolder = useCollectionStore((s) => s.setWatchCollectionFolder)
  const autoAnalyseNewTracks = useCollectionStore((s) => s.autoAnalyseNewTracks)
  const setAutoAnalyseNewTracks = useCollectionStore((s) => s.setAutoAnalyseNewTracks)
  const slowestBpm = useCollectionStore((s) => s.slowestBpm)
  const setSlowestBpm = useCollectionStore((s) => s.setSlowestBpm)

  return (
    <Page title="Library" description="Where your music lives and how MCO keeps up with it.">
      <Section title="Collection folder">
        <PathText>{collectionFolder ?? 'Not set'}</PathText>
        <div>
          <button
            onClick={async () => {
              const changed = await pickCollectionFolder()
              if (changed) onClose()
            }}
          >
            Change…
          </button>
        </div>
      </Section>

      <Section title="New files">
        <ToggleRow
          label="Watch for new and removed files"
          hint="New downloads show up on their own a few seconds after they land in the folder — no need to click Update Collection."
          checked={watchCollectionFolder}
          onChange={setWatchCollectionFolder}
        />
        <ToggleRow
          label="Analyse new tracks automatically"
          hint="BPM, key, waveform, loudness and energy, straight after they're found."
          checked={autoAnalyseNewTracks}
          onChange={setAutoAnalyseNewTracks}
          disabled={!watchCollectionFolder}
        />
      </Section>

      <Section
        title="Tempo"
        description="A tune at 165 BPM is as honestly 82.5, and analysis can land on either. Below the slowest tempo you mix at, it doubles the BPM. This applies to tracks as they are analysed; for the ones already in the collection, the Slow BPM filter lists them and Refine BPM fixes them."
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          Slowest tempo
          <select value={slowestBpm} onChange={(e) => void setSlowestBpm(Number(e.target.value))} aria-label="Slowest tempo">
            <option value={0}>None — never double</option>
            <option value={70}>70 BPM</option>
            <option value={80}>80 BPM</option>
            <option value={90}>90 BPM (default)</option>
            <option value={100}>100 BPM</option>
          </select>
        </label>
      </Section>
    </Page>
  )
}
