import { useState } from 'react'
import { useCollectionStore } from '../state/store'

export function ScanPrompt() {
  const [dismissed, setDismissed] = useState(false)
  const runScan = useCollectionStore((s) => s.runScan)

  if (dismissed) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '16px',
        zIndex: 10,
      }}
    >
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
