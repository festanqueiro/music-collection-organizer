import { useState } from 'react'
import { useCollectionStore } from '../state/store'

export function ScanPrompt() {
  const [dismissed, setDismissed] = useState(false)
  const runScan = useCollectionStore((s) => s.runScan)
  const collectionFolder = useCollectionStore((s) => s.collectionFolder)
  const pickCollectionFolder = useCollectionStore((s) => s.pickCollectionFolder)

  if (dismissed) return null

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

  if (!collectionFolder) {
    return (
      <div style={boxStyle}>
        <p style={{ margin: '0 0 12px' }}>Choose a collection folder to start</p>
        <button onClick={() => pickCollectionFolder()}>Choose folder…</button>
      </div>
    )
  }

  return (
    <div style={boxStyle}>
      <p style={{ margin: '0 0 12px' }}>Scan folder for changes?</p>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => {
            runScan()
            setDismissed(true)
          }}
        >
          Yes
        </button>
        <button onClick={() => setDismissed(true)}>No</button>
      </div>
    </div>
  )
}
