import { useCollectionStore } from '../../state/store'
import { Page, PathText, Section, ToggleRow } from './ui'

export function LibraryPage({ onClose }: { onClose: () => void }) {
  const collectionFolder = useCollectionStore((s) => s.collectionFolder)
  const pickCollectionFolder = useCollectionStore((s) => s.pickCollectionFolder)
  const watchCollectionFolder = useCollectionStore((s) => s.watchCollectionFolder)
  const setWatchCollectionFolder = useCollectionStore((s) => s.setWatchCollectionFolder)
  const autoAnalyseNewTracks = useCollectionStore((s) => s.autoAnalyseNewTracks)
  const setAutoAnalyseNewTracks = useCollectionStore((s) => s.setAutoAnalyseNewTracks)

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
    </Page>
  )
}
