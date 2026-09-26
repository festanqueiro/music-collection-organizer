import { useCollectionStore } from '../../state/store'
import type { UpdateState } from '../../types'
import { Hint, Page, Section, ToggleRow } from './ui'

function updateStatusText(state: UpdateState | null): string {
  if (!state) return 'loading…'
  switch (state.status) {
    case 'disabled':
      return state.error ?? 'automatic updates are off for this build'
    case 'checking':
      return 'checking for updates…'
    case 'up-to-date':
      return state.checkedAt ? `up to date (checked ${new Date(state.checkedAt).toLocaleString()})` : 'up to date'
    case 'available':
      return `version ${state.latestVersion} is available — see the banner at the top`
    case 'downloading':
      return `downloading ${state.latestVersion}…`
    case 'installing':
      return `installing ${state.latestVersion}…`
    case 'error':
      return state.error ?? 'something went wrong'
    default:
      return 'not checked yet'
  }
}

export function UpdatesPage() {
  const updateState = useCollectionStore((s) => s.updateState)
  const checkForUpdates = useCollectionStore((s) => s.checkForUpdates)
  const autoCheckUpdates = useCollectionStore((s) => s.autoCheckUpdates)
  const setAutoCheckUpdates = useCollectionStore((s) => s.setAutoCheckUpdates)
  const busy = updateState?.status === 'checking' || updateState?.status === 'downloading' || updateState?.status === 'installing'

  return (
    <Page title="Updates" description="MCO updates itself from its GitHub releases.">
      <Section title={`Version ${updateState?.currentVersion ?? '…'}`}>
        <Hint>{updateStatusText(updateState)}</Hint>
        {updateState?.status !== 'disabled' && (
          <>
            <ToggleRow label="Check for updates automatically" checked={autoCheckUpdates} onChange={setAutoCheckUpdates} />
            <div>
              <button onClick={() => checkForUpdates()} disabled={busy}>
                Check now
              </button>
            </div>
          </>
        )}
      </Section>
    </Page>
  )
}
