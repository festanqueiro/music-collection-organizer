// src/components/BatchTagBar.tsx
import { useCollectionStore } from '../state/store'

export function BatchTagBar() {
  const checkedTrackIds = useCollectionStore((s) => s.checkedTrackIds)
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const addTagsToCheckedTracks = useCollectionStore((s) => s.addTagsToCheckedTracks)
  const clearCheckedTracks = useCollectionStore((s) => s.clearCheckedTracks)
  const runAnalysis = useCollectionStore((s) => s.runAnalysis)

  if (checkedTrackIds.size === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
      }}
    >
      <span>{checkedTrackIds.size} selected</span>
      <select
        value=""
        onChange={(e) => {
          const id = Number(e.target.value)
          if (id) addTagsToCheckedTracks({ genreIds: [id], subgenreIds: [] })
        }}
      >
        <option value="">+ Add tag…</option>
        {genres.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <select
        value=""
        onChange={(e) => {
          const id = Number(e.target.value)
          if (id) addTagsToCheckedTracks({ genreIds: [], subgenreIds: [id] })
        }}
      >
        <option value="">+ Add subtag…</option>
        {subgenres.map((sg) => (
          <option key={sg.id} value={sg.id}>
            {sg.name}
          </option>
        ))}
      </select>
      <button onClick={() => runAnalysis(Array.from(checkedTrackIds))}>Analyse</button>
      <button onClick={clearCheckedTracks}>Clear selection</button>
    </div>
  )
}
