import { useState } from 'react'
import { useCollectionStore } from '../../state/store'
import { Message, Page, Section } from './ui'

export function TransferPage() {
  const exportTagData = useCollectionStore((s) => s.exportTagData)
  const importTagData = useCollectionStore((s) => s.importTagData)
  const [tagDataMessage, setTagDataMessage] = useState<string | null>(null)
  const [rekordboxMessage, setRekordboxMessage] = useState<{ text: string; error: boolean } | null>(null)

  return (
    <Page title="Import & export" description="Move your tags between Macs, or take your library to Rekordbox.">
      <Section
        title="Tag data"
        description="Your genres and sub-genres and which tracks have them, as a file. Importing only adds tags — it never removes any."
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={async () => {
              const result = await exportTagData()
              setTagDataMessage(result ? `Exported to ${result.path}` : null)
            }}
          >
            Export…
          </button>
          <button
            onClick={async () => {
              const result = await importTagData()
              setTagDataMessage(result ? `Imported: ${result.matchedTracks} matched, ${result.skippedTracks} skipped` : null)
            }}
          >
            Import…
          </button>
        </div>
        {tagDataMessage && <Message>{tagDataMessage}</Message>}
      </Section>

      <Section
        title="Rekordbox"
        description={
          'Exports your library, with each genre and sub-genre as a playlist, to a file Rekordbox can read. In Rekordbox, choose the file under Preferences → Advanced → Database → rekordbox xml, then find it in the "rekordbox xml" section of the sidebar.'
        }
      >
        <div>
          <button
            onClick={async () => {
              setRekordboxMessage(null)
              try {
                const result = await window.api.exportRekordbox()
                if (result) {
                  setRekordboxMessage({
                    text: `Exported ${result.trackCount} tracks and ${result.playlistCount} playlists to ${result.path}`,
                    error: false,
                  })
                }
              } catch (err) {
                setRekordboxMessage({ text: `Export failed: ${err instanceof Error ? err.message : String(err)}`, error: true })
              }
            }}
          >
            Export to Rekordbox…
          </button>
        </div>
        {rekordboxMessage && <Message error={rekordboxMessage.error}>{rekordboxMessage.text}</Message>}
      </Section>
    </Page>
  )
}
