// src/components/BatchTagBar.tsx
import { useCollectionStore } from '../state/store'

export function BatchTagBar() {
  const checkedTrackIds = useCollectionStore((s) => s.checkedTrackIds)
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const addTagsToCheckedTracks = useCollectionStore((s) => s.addTagsToCheckedTracks)
  const clearCheckedTracks = useCollectionStore((s) => s.clearCheckedTracks)
  const runAnalysis = useCollectionStore((s) => s.runAnalysis)
  const showToast = useCollectionStore((s) => s.showToast)

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
          const genre = genres.find((g) => g.id === id)
          if (id && genre) {
            const count = checkedTrackIds.size
            addTagsToCheckedTracks({ genreIds: [id], subgenreIds: [] })
            showToast(`Added "${genre.name}" to ${count} track${count === 1 ? '' : 's'}`)
          }
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
          const subgenre = subgenres.find((sg) => sg.id === id)
          if (id && subgenre) {
            const count = checkedTrackIds.size
            addTagsToCheckedTracks({ genreIds: [], subgenreIds: [id] })
            showToast(`Added "${subgenre.name}" to ${count} track${count === 1 ? '' : 's'}`)
          }
        }}
      >
        <option value="">+ Add subtag…</option>
        {subgenres.map((sg) => (
          <option key={sg.id} value={sg.id}>
            {sg.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => {
          const count = checkedTrackIds.size
          runAnalysis(Array.from(checkedTrackIds))
          showToast(`Analysing ${count} track${count === 1 ? '' : 's'}…`)
        }}
      >
        Analyse
      </button>
      <button onClick={clearCheckedTracks}>Clear selection</button>
    </div>
  )
}
