import { useState } from 'react'
import { useCollectionStore } from '../state/store'
import logo from '../../resources/icon.png'

// One row, everything the same height: brand and the collection folder on
// the left, search in the middle, actions on the right.
const CONTROL_HEIGHT = '32px'

export function Toolbar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const searchText = useCollectionStore((s) => s.searchText)
  const setSearchText = useCollectionStore((s) => s.setSearchText)
  const runScan = useCollectionStore((s) => s.runScan)
  const collectionFolder = useCollectionStore((s) => s.collectionFolder)
  const pickCollectionFolder = useCollectionStore((s) => s.pickCollectionFolder)
  const appVersion = useCollectionStore((s) => s.appVersion)
  const [scanning, setScanning] = useState(false)
  const folderName = collectionFolder?.split('/').filter(Boolean).pop() ?? collectionFolder

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 12px',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <img src={logo} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
        <span style={{ fontWeight: 700, letterSpacing: '0.08em' }}>MCO</span>
        {appVersion && (
          <span
            style={{
              fontSize: '10px',
              color: 'var(--color-text-dim)',
              padding: '1px 6px',
              borderRadius: '99px',
              border: '1px solid var(--color-border)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            v{appVersion}
          </span>
        )}
      </div>

      {collectionFolder && (
        <button
          onClick={() => pickCollectionFolder()}
          title={`${collectionFolder}\nClick to change the collection folder`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            height: CONTROL_HEIGHT,
            padding: '0 10px',
            maxWidth: '240px',
            minWidth: 0,
            flexShrink: 1,
            background: 'none',
            color: 'var(--color-text-dim)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            folder
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text)' }}>
            {folderName}
          </span>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            expand_more
          </span>
        </button>
      )}

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: '160px' }}>
        <div style={{ position: 'relative', display: 'flex', width: '100%', maxWidth: '560px' }}>
          <span
            className="material-symbols-outlined"
            style={{
              position: 'absolute',
              left: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '18px',
              color: 'var(--color-text-dim)',
              pointerEvents: 'none',
            }}
          >
            search
          </span>
          <input
            type="text"
            placeholder="Search title, artist, album, tags..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && searchText) setSearchText('')
            }}
            style={{
              flex: 1,
              height: CONTROL_HEIGHT,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              padding: '0 32px 0 32px',
              color: 'var(--color-text)',
            }}
          />
          {searchText && (
            <button
              onClick={() => setSearchText('')}
              title="Clear search"
              aria-label="Clear search"
              style={{
                position: 'absolute',
                right: '4px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                padding: '2px',
                display: 'flex',
                color: 'var(--color-text-dim)',
                cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                close
              </span>
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={async () => {
            setScanning(true)
            try {
              await runScan()
            } finally {
              setScanning(false)
            }
          }}
          disabled={scanning}
          title="Rescan the collection folder for new, changed and removed files"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', height: CONTROL_HEIGHT, padding: '0 12px' }}
        >
          <span className={`material-symbols-outlined${scanning ? ' spin' : ''}`} style={{ fontSize: '18px' }}>
            {scanning ? 'progress_activity' : 'refresh'}
          </span>
          {scanning ? 'Scanning…' : 'Update Collection'}
        </button>
        <button
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: CONTROL_HEIGHT, height: CONTROL_HEIGHT, padding: 0 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            settings
          </span>
        </button>
      </div>
    </div>
  )
}
