import { useCollectionStore } from '../state/store'

// Only prompts when there's no collection folder chosen yet. Scanning an
// already-chosen folder for changes is a deliberate action now (the
// toolbar's "Update Collection" button), not something to nag about on
// every launch.
export function ScanPrompt() {
  const collectionFolder = useCollectionStore((s) => s.collectionFolder)
  const pickCollectionFolder = useCollectionStore((s) => s.pickCollectionFolder)

  if (collectionFolder) return null

  const boxStyle = {
    position: 'fixed' as const,
    top: 16,
    right: 16,
    background: 'var(--color-surface-raised)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '16px',
    zIndex: 10,
  }

  return (
    <div style={boxStyle}>
      <p style={{ margin: '0 0 12px' }}>Choose a collection folder to start</p>
      <button onClick={() => pickCollectionFolder()}>Choose folder…</button>
    </div>
  )
}
