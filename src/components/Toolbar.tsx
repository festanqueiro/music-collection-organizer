import { useCollectionStore } from '../state/store'

export function Toolbar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const searchText = useCollectionStore((s) => s.searchText)
  const setSearchText = useCollectionStore((s) => s.setSearchText)
  const runScan = useCollectionStore((s) => s.runScan)
  const collectionFolder = useCollectionStore((s) => s.collectionFolder)
  const pickCollectionFolder = useCollectionStore((s) => s.pickCollectionFolder)

  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        padding: '12px',
        borderBottom: '1px solid var(--color-border)',
        alignItems: 'flex-start',
      }}
    >
      <input
        type="text"
        placeholder="Search title, artist, album..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{
          flex: 1,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '6px',
          padding: '8px 12px',
          color: 'var(--color-text)',
        }}
      />
      <button onClick={onOpenSettings} style={{ alignSelf: 'flex-start' }}>
        <span className="material-symbols-outlined">settings</span>
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
        <button onClick={() => runScan()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-outlined">refresh</span>
          Update Collection
        </button>
        {collectionFolder && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              title={collectionFolder}
              style={{
                color: 'var(--color-text-dim)',
                maxWidth: '280px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '13px', verticalAlign: 'text-bottom' }}>
                folder
              </span>{' '}
              {collectionFolder}
            </span>
            <button onClick={() => pickCollectionFolder()} style={{ padding: '2px 6px' }}>
              Change…
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
