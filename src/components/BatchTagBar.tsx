// src/components/BatchTagBar.tsx
import { useCollectionStore } from '../state/store'

// The selection half of TrackTable's always-visible toolbar — only
// renders when tracks are checked. `visibleTrackIds` is the table's
// current display order, so "Add to queue" queues checked tracks in the
// order they're shown rather than the order they were ticked.
export function BatchTagBar({ visibleTrackIds }: { visibleTrackIds: number[] }) {
  const checkedTrackIds = useCollectionStore((s) => s.checkedTrackIds)
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const addTagsToCheckedTracks = useCollectionStore((s) => s.addTagsToCheckedTracks)
  const clearCheckedTracks = useCollectionStore((s) => s.clearCheckedTracks)
  const runAnalysis = useCollectionStore((s) => s.runAnalysis)
  const showToast = useCollectionStore((s) => s.showToast)
  const addManyToPlaylist = useCollectionStore((s) => s.addManyToPlaylist)

  if (checkedTrackIds.size === 0) return null

  return (
    <>
      <span style={{ width: '1px', alignSelf: 'stretch', background: 'var(--color-border)' }} />
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
      <button
        onClick={() => {
          // Checked tracks hidden by the current filter still get queued,
          // after the visible ones.
          const visibleChecked = visibleTrackIds.filter((id) => checkedTrackIds.has(id))
          const visibleSet = new Set(visibleChecked)
          const ids = [...visibleChecked, ...Array.from(checkedTrackIds).filter((id) => !visibleSet.has(id))]
          addManyToPlaylist(ids)
          showToast(`${ids.length} track${ids.length === 1 ? '' : 's'} queued`)
        }}
      >
        Add to queue
      </button>
      <button onClick={clearCheckedTracks}>Clear selection</button>
    </>
  )
}
