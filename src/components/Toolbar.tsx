import { useCollectionStore } from '../state/store'

export function Toolbar() {
  const searchText = useCollectionStore((s) => s.searchText)
  const setSearchText = useCollectionStore((s) => s.setSearchText)
  const runScan = useCollectionStore((s) => s.runScan)

  return (
    <div style={{ display: 'flex', gap: '12px', padding: '12px', borderBottom: '1px solid var(--color-border)' }}>
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
      <button onClick={() => runScan()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span className="material-symbols-outlined">refresh</span>
        Update Collection
      </button>
    </div>
  )
}
