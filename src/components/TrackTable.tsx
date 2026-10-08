import { useEffect, useMemo, useRef, useState } from 'react'
import { findDuplicates } from '../state/duplicates'
import { isMissingId3Metadata, matchesEnergy, matchesMcoTagsFilter } from '../state/trackFilters'
import { formatGain, formatLufs, gainToMatch, medianLoudness } from '../state/loudness'
import { useCollectionStore } from '../state/store'
import { REVEAL_IN_FILE_MANAGER } from '../platform'
import { BatchTagBar } from './BatchTagBar'
import { contextMenuItemStyle, contextMenuIconStyle } from './contextMenuStyles'
import { formatDuration, formatDate, decodeHtmlEntities } from '../format'
import type { Track, TrackTableColumnKey } from '../types'
import { formatKey, keySortValue, toCamelot, camelotColor, areKeysCompatible, areBpmsCompatible } from '../state/harmonic'
import { baseName, isInFolder } from '../paths'
import { AddToPlaylistMenu } from './AddToPlaylistMenu'
import { ConvertDialog } from './ConvertDialog'
import { RefineBpmMenu } from './RefineBpmMenu'
// Lossy files below LOW_BITRATE_KBPS are flagged in the Bitrate column.
import { LOSSY_FORMATS, LOW_BITRATE_KBPS } from '../state/collectionStats'
import { tracksById } from '../state/tracksById'
import { ContextMenu } from './ContextMenu'
import { writeStored } from '../state/stored'
import { isSlowBpm } from '../state/trackFilters'

type SortKey = TrackTableColumnKey

const DEFAULT_COLUMN_WIDTHS: Record<TrackTableColumnKey, number> = {
  title: 260,
  filename: 220,
  artist: 160,
  album: 180,
  tags: 160,
  subtags: 160,
  bpm: 70,
  musicalKey: 70,
  energy: 80,
  loudness: 70,
  gain: 100,
  cues: 64,
  format: 80,
  bitrate: 90,
  duration: 90,
  dateAdded: 120,
  dateModified: 120,
}
const MIN_COLUMN_WIDTH = 50
const CHECKBOX_COL_WIDTH = 36
// Just fits its three 16px icons (play, add to queue, pre-listen) with
// 4px padding and gaps.
const PLAY_COL_WIDTH = 64
const STATUS_COL_WIDTH = 90
const CLOUD_COL_WIDTH = 70
// Every row is exactly this tall (the tallest a one-line row gets, with a
// status/cloud icon), so the virtualized table can place rows by index.
const ROW_HEIGHT = 36
// Rows rendered beyond each edge of the viewport, so a fast scroll doesn't
// flash empty space before React catches up.
const OVERSCAN_ROWS = 15
// Per-viewer sizing convenience, not collection data — plain localStorage
// rather than the electron-store-backed column *order*, which is shared
// config synced through the main process.
const COLUMN_WIDTHS_STORAGE_KEY = 'mco-track-table-column-widths'

// Top half of a row: the dragged rows go before it; bottom half: after.
function rowDropWhere(e: React.DragEvent<HTMLElement>): 'before' | 'after' {
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

function loadColumnWidths(): Record<TrackTableColumnKey, number> {
  try {
    const stored = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY)
    if (!stored) return { ...DEFAULT_COLUMN_WIDTHS }
    return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(stored) }
  } catch {
    return { ...DEFAULT_COLUMN_WIDTHS }
  }
}

// What a column means, where its name doesn't say (header tooltip).
const COLUMN_HINTS: Partial<Record<TrackTableColumnKey, (target: number | null) => string>> = {
  energy: () => 'Energy: how driving the track is, 1 (calm) to 10 (peak)',
  loudness: () => 'LUFS: integrated loudness (EBU R128) — closer to 0 is louder',
  cues: () => 'Cues: how many hot cues (A–H) the track has',
  gain: (target) =>
    target === null
      ? 'Volume Score: the gain that would bring the track to the collection’s median loudness (analyse tracks first)'
      : `Volume Score: the gain that would bring the track to the collection’s median loudness, ${formatLufs(target)} LUFS — + turn it up, − turn it down`,
}

// The 1–10 energy rating as a number and a small bar, cool to hot.
export function EnergyMeter({ energy }: { energy: number }) {
  const hue = 200 - (energy - 1) * 22
  return (
    <span title={`Energy ${energy} of 10`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ width: '14px', textAlign: 'right' }}>{energy}</span>
      <span style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'var(--color-border)', overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${energy * 10}%`, height: '100%', background: `hsl(${hue} 75% 55%)` }} />
      </span>
    </span>
  )
}

function FilterChip({ icon, label, title, onClear }: { icon: string; label: string; title?: string; onClear: () => void }) {
  return (
    <span
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '12px',
        padding: '2px 4px 2px 8px',
        borderRadius: '99px',
        border: '1px solid var(--color-accent)',
        color: 'var(--color-accent)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
        {icon}
      </span>
      {label}
      <button
        onClick={onClear}
        title="Remove this filter"
        aria-label={`Remove the ${label} filter`}
        style={{ background: 'none', border: 'none', padding: 0, display: 'flex', color: 'inherit', cursor: 'pointer' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
          close
        </span>
      </button>
    </span>
  )
}

export function TrackTable({
  onSelect,
  selectedFolder,
  activeFilter,
  selectedTrackId,
  scrollToTrack,
  onShowInFolderTree,
  onClearFolder,
  tagFilterChip,
  onClearTagFilter,
}: {
  onSelect: (track: Track) => void
  selectedFolder: string | null
  activeFilter: (track: Track) => boolean
  selectedTrackId: number | null
  // A new object each time (even for the same trackId) so clicking the
  // detail panel's title twice in a row re-triggers the scroll — a plain
  // trackId prop wouldn't change identity on a second click.
  scrollToTrack?: { trackId: number; nonce: number } | null
  onShowInFolderTree: (folder: string) => void
  // Back to All Tracks (the folder chip's ×).
  onClearFolder: () => void
  // The Tags/Subtags view's selection, shown as a chip, and its ×.
  tagFilterChip: { icon: string; label: string } | null
  onClearTagFilter: () => void
}) {
  const tracks = useCollectionStore((s) => s.tracks)
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const trackTags = useCollectionStore((s) => s.trackTags)
  const searchText = useCollectionStore((s) => s.searchText)
  const setSearchText = useCollectionStore((s) => s.setSearchText)
  const checkedTrackIds = useCollectionStore((s) => s.checkedTrackIds)
  const toggleTrackChecked = useCollectionStore((s) => s.toggleTrackChecked)
  const setTracksChecked = useCollectionStore((s) => s.setTracksChecked)
  const modalOpen = useCollectionStore((s) => s.modalOpen)
  const playlist = useCollectionStore((s) => s.playlist)
  const showToast = useCollectionStore((s) => s.showToast)
  // Up next (the first entry is the loaded track), for the rows' queue icon.
  const queuedIds = useMemo(() => new Set(playlist.slice(1)), [playlist])
  const playTrackNow = useCollectionStore((s) => s.playTrackNow)
  const addToPlaylist = useCollectionStore((s) => s.addToPlaylist)
  const requestAddManyToQueue = useCollectionStore((s) => s.requestAddManyToQueue)
  const playNext = useCollectionStore((s) => s.playNext)
  const runAnalysis = useCollectionStore((s) => s.runAnalysis)
  const columnOrder = useCollectionStore((s) => s.columnOrder)
  const hiddenColumns = useCollectionStore((s) => s.hiddenColumns)
  const setColumnVisible = useCollectionStore((s) => s.setColumnVisible)
  const setColumnOrder = useCollectionStore((s) => s.setColumnOrder)
  const sortState = useCollectionStore((s) => s.sortState)
  const setSortState = useCollectionStore((s) => s.setSortState)
  const keyNotation = useCollectionStore((s) => s.keyNotation)
  const cueTrackId = useCollectionStore((s) => s.cueTrackId)
  const playerPlaying = useCollectionStore((s) => s.playerPlaying)
  const playbackControls = useCollectionStore((s) => s.playbackControls)
  const previewTrack = useCollectionStore((s) => s.previewTrack)
  const compatibleFilter = useCollectionStore((s) => s.compatibleFilter)
  const setCompatibleFilter = useCollectionStore((s) => s.setCompatibleFilter)
  const analysedFilter = useCollectionStore((s) => s.analysedFilter)
  const setAnalysedFilter = useCollectionStore((s) => s.setAnalysedFilter)
  const hotCueCounts = useCollectionStore((s) => s.hotCueCounts)
  // The Volume Score column's reference: the collection's median loudness.
  const loudnessTarget = useMemo(() => medianLoudness(tracks.map((t) => t.loudness)), [tracks])
  const energyFilter = useCollectionStore((s) => s.energyFilter)
  const setEnergyFilter = useCollectionStore((s) => s.setEnergyFilter)
  const duplicatesFilter = useCollectionStore((s) => s.duplicatesFilter)
  const setDuplicatesFilter = useCollectionStore((s) => s.setDuplicatesFilter)
  const slowBpmFilter = useCollectionStore((s) => s.slowBpmFilter)
  const setSlowBpmFilter = useCollectionStore((s) => s.setSlowBpmFilter)
  const slowestBpm = useCollectionStore((s) => s.slowestBpm)
  const mcoTagsFilter = useCollectionStore((s) => s.mcoTagsFilter)
  const setMcoTagsFilter = useCollectionStore((s) => s.setMcoTagsFilter)
  const missingMetadataFilter = useCollectionStore((s) => s.missingMetadataFilter)
  const setMissingMetadataFilter = useCollectionStore((s) => s.setMissingMetadataFilter)
  const missingTracks = useCollectionStore((s) => s.missingTracks)
  const missingTracksFilter = useCollectionStore((s) => s.missingTracksFilter)
  const cloudOnlyFilter = useCollectionStore((s) => s.cloudOnlyFilter)
  const setCloudOnlyFilter = useCollectionStore((s) => s.setCloudOnlyFilter)
  const setMissingTracksFilter = useCollectionStore((s) => s.setMissingTracksFilter)
  // Over the whole collection, so a copy in another folder still counts.
  const duplicates = useMemo(() => (duplicatesFilter ? findDuplicates(tracks) : null), [tracks, duplicatesFilter])
  const currentTrackId = playlist[0] ?? null
  const currentTrack = useMemo(
    () => (currentTrackId != null ? (tracksById(tracks).get(currentTrackId) ?? null) : null),
    [tracks, currentTrackId]
  )
  // The filter needs a playing track with an analysed key to compare with.
  const canFilterCompatible = !!currentTrack && toCamelot(currentTrack.musicalKey) !== null
  const [draggedColumn, setDraggedColumn] = useState<TrackTableColumnKey | null>(null)
  const sortKey = sortState.key
  const sortDir = sortState.direction
  const [contextMenu, setContextMenu] = useState<{ trackId: number; x: number; y: number } | null>(null)
  const [addToPlaylistMenu, setAddToPlaylistMenu] = useState<{ trackIds: number[]; x: number; y: number } | null>(null)
  // "Convert to…": the tracks the dialog is open for.
  const [convertTrackIds, setConvertTrackIds] = useState<number[] | null>(null)
  // "Refine BPM…": the tracks its menu is open for, and where.
  const [bpmMenu, setBpmMenu] = useState<{ trackIds: number[]; x: number; y: number } | null>(null)
  // The selected playlist (docs/features/playlists.md): its songs, in its
  // order until a column header is clicked.
  const selectedPlaylistId = useCollectionStore((s) => s.selectedPlaylistId)
  const selectedPlaylistTrackIds = useCollectionStore((s) => s.selectedPlaylistTrackIds)
  const selectedPlaylistName = useCollectionStore(
    (s) => s.playlistNodes.find((n) => n.id === s.selectedPlaylistId)?.name ?? null
  )
  const selectPlaylist = useCollectionStore((s) => s.selectPlaylist)
  const removeTracksFromSelectedPlaylist = useCollectionStore((s) => s.removeTracksFromSelectedPlaylist)
  const moveTracksInSelectedPlaylist = useCollectionStore((s) => s.moveTracksInSelectedPlaylist)
  // Where dragged rows will land while reordering a playlist.
  const [rowDrop, setRowDrop] = useState<{ id: number; where: 'before' | 'after' } | null>(null)
  const [playlistOrder, setPlaylistOrder] = useState(true)
  useEffect(() => setPlaylistOrder(true), [selectedPlaylistId])
  // Show/hide columns: from the columns button or a right-click on any header.
  const [columnsMenu, setColumnsMenu] = useState<{ x: number; y: number } | null>(null)
  // Anchor for shift-click range checking — the last row whose checkbox
  // was explicitly clicked (not the one currently selected/detail-panel
  // focused, so shift-click ranges follow checkbox clicks specifically).
  const [lastCheckedTrackId, setLastCheckedTrackId] = useState<number | null>(null)
  // Captured on mousedown (not read from the click/change event itself) so
  // the checkbox can keep its native toggle behavior — onChange just reads
  // this instead of us calling preventDefault() and re-implementing the
  // toggle ourselves, which is a fragile pattern for something as basic as
  // a checkbox click.
  const shiftKeyRef = useRef(false)
  const [columnWidths, setColumnWidths] = useState<Record<TrackTableColumnKey, number>>(loadColumnWidths)

  // Drag-to-resize a column's header border. Reads/writes columnWidths via
  // functional updates so the window listeners (attached once per drag,
  // not re-subscribed on every width change) never close over a stale value.
  function handleResizeStart(key: TrackTableColumnKey, startEvent: React.MouseEvent) {
    startEvent.preventDefault()
    startEvent.stopPropagation()
    const startX = startEvent.clientX
    const startWidth = columnWidths[key]

    function handleMouseMove(e: MouseEvent) {
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + (e.clientX - startX))
      setColumnWidths((prev) => ({ ...prev, [key]: nextWidth }))
    }
    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      setColumnWidths((prev) => {
        writeStored(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(prev))
        return prev
      })
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  useEffect(() => {
    if (!contextMenu) return
    function close() {
      setContextMenu(null)
    }
    // Deliberately no 'contextmenu' listener here — right-clicking a
    // different row already reopens the menu via that row's own
    // onContextMenu handler (setting new state directly), and a second
    // window-level 'contextmenu' listener closing to null would race it:
    // both fire from the same event's bubble phase, and being registered
    // second, this one would run after and clobber the just-opened menu.
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!columnsMenu) return
    // Ticking boxes keeps it open (its own clicks stop propagating);
    // a click anywhere else or Esc closes it.
    function close() {
      setColumnsMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [columnsMenu])

  function openColumnsMenu(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu(null)
    setColumnsMenu({ x: e.clientX, y: e.clientY })
  }

  function handleSort(key: SortKey) {
    if (selectedPlaylistId !== null && playlistOrder) {
      // The first click leaves the playlist's order for this column.
      setPlaylistOrder(false)
      setSortState({ key, direction: key === sortKey ? sortDir : 'asc' })
      return
    }
    if (key === sortKey) {
      setSortState({ key, direction: sortDir === 'asc' ? 'desc' : 'asc' })
    } else {
      setSortState({ key, direction: 'asc' })
    }
  }

  const subgenresById = useMemo(() => new Map(subgenres.map((sg) => [sg.id, sg])), [subgenres])
  const genresById = useMemo(() => new Map(genres.map((g) => [g.id, g])), [genres])

  // A track's Tags (genres) or Subtags, A-Z, with their colours.
  function tagNamesFor(trackId: number, kind: 'tags' | 'subtags'): { name: string; color: string | null }[] {
    const tags = trackTags.get(trackId)
    if (!tags) return []
    const names =
      kind === 'tags'
        ? tags.genreIds.map((id) => genresById.get(id))
        : tags.subgenreIds.map((id) => subgenresById.get(id))
    return names
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({ name: t.name, color: t.color }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  function allTagNamesFor(trackId: number): string[] {
    return [...tagNamesFor(trackId, 'tags'), ...tagNamesFor(trackId, 'subtags')].map((t) => t.name)
  }

  // 'tags'/'subtags' have no matching field on Track (they're derived from trackTags),
  // so it needs its own comparable value instead of the direct property
  // lookup every other column uses.
  function sortValueFor(track: Track, key: SortKey): string | number {
    if (key === 'tags' || key === 'subtags') return tagNamesFor(track.id, key).map((t) => t.name).join(', ')
    if (key === 'dateAdded') return track.birthtime ?? 0
    if (key === 'dateModified') return track.mtime ?? 0
    if (key === 'musicalKey') return keySortValue(track.musicalKey)
    // Not rated yet sorts below 1.
    if (key === 'energy') return track.energy ?? 0
    // Not analysed sorts as the quietest / the biggest boost.
    if (key === 'loudness') return track.loudness ?? -Infinity
    if (key === 'gain') return gainToMatch(track.loudness, loudnessTarget) ?? Infinity
    if (key === 'cues') return hotCueCounts[track.id] ?? 0
    return track[key] ?? ''
  }

  const visibleTracks = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    // Missing Tracks lists the files that are gone instead of the
    // collection; a playlist lists its songs (missing ones too, greyed).
    let source = missingTracksFilter ? missingTracks : tracks
    if (selectedPlaylistId !== null && !missingTracksFilter) {
      const byId = new Map([...tracks, ...missingTracks.map((t) => ({ ...t, missing: true }))].map((t) => [t.id, t]))
      source = [...new Set(selectedPlaylistTrackIds)].map((id) => byId.get(id)).filter((t): t is Track => !!t)
    }
    const inPlaylistOrder = selectedPlaylistId !== null && playlistOrder && !duplicates
    return source
      .filter((t) => (selectedFolder ? isInFolder(t.folder, selectedFolder) : true))
      .filter(activeFilter)
      .filter((t) => {
        if (!compatibleFilter || !canFilterCompatible || !currentTrack) return true
        if (t.id === currentTrack.id) return true
        if (!areKeysCompatible(t.musicalKey, currentTrack.musicalKey)) return false
        // Unanalysed BPM on either side doesn't rule a track out — key is
        // the stronger signal and the BPM may just be missing.
        return !t.bpm || !currentTrack.bpm || areBpmsCompatible(t.bpm, currentTrack.bpm)
      })
      .filter((t) =>
        analysedFilter === 'all'
          ? true
          : analysedFilter === 'analysed'
            ? t.analysisStatus === 'done'
            : t.analysisStatus !== 'done'
      )
      .filter((t) => matchesEnergy(t.energy, energyFilter))
      .filter((t) => !slowBpmFilter || isSlowBpm(t, slowestBpm))
      .filter((t) => !duplicates || duplicates.has(t.id))
      .filter((t) => !missingMetadataFilter || isMissingId3Metadata(t))
      .filter((t) => !cloudOnlyFilter || t.cloudStatus === 'cloud_only')
      .filter((t) => matchesMcoTagsFilter(trackTags.get(t.id), mcoTagsFilter))
      .filter((t) =>
        query
          ? [t.title, t.artist, t.album, t.filename].some((v) => v?.toLowerCase().includes(query)) ||
            allTagNamesFor(t.id).some((name) => name.toLowerCase().includes(query))
          : true
      )
      .sort((a, b) => {
        if (inPlaylistOrder) return 0
        // Duplicates: copies of the same song sit together, each group in
        // the chosen sort order.
        if (duplicates) {
          const ga = duplicates.get(a.id)!
          const gb = duplicates.get(b.id)!
          if (ga !== gb) return ga < gb ? -1 : 1
        }
        const av = sortValueFor(a, sortKey)
        const bv = sortValueFor(b, sortKey)
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return sortDir === 'asc' ? cmp : -cmp
      })
  }, [
    tracks,
    searchText,
    selectedFolder,
    activeFilter,
    sortKey,
    sortDir,
    trackTags,
    genresById,
    subgenresById,
    compatibleFilter,
    canFilterCompatible,
    currentTrack,
    analysedFilter,
    energyFilter,
    slowBpmFilter,
    slowestBpm,
    hotCueCounts,
    duplicates,
    missingMetadataFilter,
    mcoTagsFilter,
    missingTracksFilter,
    missingTracks,
    cloudOnlyFilter,
    selectedPlaylistId,
    selectedPlaylistTrackIds,
    playlistOrder,
  ])
  const visibleTrackIds = useMemo(() => visibleTracks.map((t) => t.id), [visibleTracks])
  // Rows can be dragged up and down while a playlist shows in its own order.
  const canReorder = selectedPlaylistId !== null && playlistOrder && !duplicates && !missingTracksFilter
  const trackIdsByPath = useMemo(() => new Map(tracks.map((t) => [t.path, t.id])), [tracks])
  useEffect(() => {
    if (!canReorder) setRowDrop(null)
  }, [canReorder])

  // Only the rows in (and just around) the viewport are rendered — the
  // rest are two spacer rows of the same total height. A whole collection
  // as real rows is tens of thousands of DOM nodes, which slowed every
  // frame of the app (FX knobs, the visualizer, scrolling).
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(800)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const firstRendered = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS)
  const lastRendered = Math.min(visibleTracks.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN_ROWS)
  const renderedTracks = visibleTracks.slice(firstRendered, lastRendered)

  // Re-analysing a track changes its BPM/Key, which can shift its sort
  // position out of the visible scroll area — clicking the track's title
  // in the detail panel scrolls it back into view. By index, since the row
  // may not be rendered.
  useEffect(() => {
    if (!scrollToTrack) return
    const index = visibleTracks.findIndex((t) => t.id === scrollToTrack.trackId)
    const el = scrollRef.current
    if (index < 0 || !el) return
    el.scrollTo({ top: Math.max(0, index * ROW_HEIGHT - el.clientHeight / 2), behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToTrack])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (modalOpen) return
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return
      // P: pre-listen to the selected row in the headphones (toggles).
      if ((e.key === 'p' || e.key === 'P') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (selectedTrackId != null) {
          e.preventDefault()
          previewTrack(selectedTrackId)
        }
        return
      }
      // ⌫ in a playlist: remove the checked songs, or the selected one, from
      // it (Undo puts them back). Elsewhere it does nothing — never a delete.
      if ((e.key === 'Backspace' || e.key === 'Delete') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (selectedPlaylistId === null) return
        const inPlaylist = new Set(selectedPlaylistTrackIds)
        const checked = visibleTracks.filter((t) => checkedTrackIds.has(t.id)).map((t) => t.id)
        const ids = checked.length > 0 ? checked : selectedTrackId != null && inPlaylist.has(selectedTrackId) ? [selectedTrackId] : []
        if (ids.length === 0) return
        e.preventDefault()
        void removeTracksFromSelectedPlaylist(ids)
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) return
      if (visibleTracks.length === 0) return
      e.preventDefault()
      const currentIndex = selectedTrackId ? visibleTracks.findIndex((t) => t.id === selectedTrackId) : -1
      // PageUp/PageDown jump a fixed number of rows rather than measuring
      // the actual scrollable viewport height — a reasonable approximation
      // for "about a screen" without wiring up row-height/container
      // measurement just for this.
      const PAGE_SIZE = 10
      let nextIndex = currentIndex
      if (e.key === 'ArrowDown') nextIndex = Math.min(visibleTracks.length - 1, currentIndex + 1)
      else if (e.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1)
      else if (e.key === 'Home') nextIndex = 0
      else if (e.key === 'End') nextIndex = visibleTracks.length - 1
      else if (e.key === 'PageDown') nextIndex = Math.min(visibleTracks.length - 1, currentIndex + PAGE_SIZE)
      else if (e.key === 'PageUp') nextIndex = Math.max(0, currentIndex - PAGE_SIZE)
      onSelect(visibleTracks[nextIndex])
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    visibleTracks,
    selectedTrackId,
    onSelect,
    modalOpen,
    previewTrack,
    selectedPlaylistId,
    selectedPlaylistTrackIds,
    checkedTrackIds,
    removeTracksFromSelectedPlaylist,
  ])

  const columnLabels: Record<TrackTableColumnKey, string> = {
    title: 'Title',
    filename: 'Filename',
    artist: 'Artist',
    album: 'Album',
    tags: 'Tags',
    subtags: 'Subtags',
    bpm: 'BPM',
    musicalKey: 'Key',
    energy: 'Energy',
    loudness: 'LUFS',
    gain: 'Volume Score',
    cues: 'Cues',
    format: 'Format',
    bitrate: 'Bitrate',
    duration: 'Duration',
    dateAdded: 'Date Added',
    dateModified: 'Date Modified',
  }
  const orderedColumns = columnOrder
    .filter((key) => !hiddenColumns.includes(key))
    .map((key) => ({ key, label: columnLabels[key] }))

  const cellStyle = { padding: '8px', whiteSpace: 'nowrap' as const }
  // Keeps the header row pinned to the top of the scroll container (the
  // .pane it's rendered inside, which owns the vertical scroll) as the
  // table's rows scroll underneath it. Needs an opaque background so
  // scrolled-past rows don't show through.
  const stickyHeaderStyle = { position: 'sticky' as const, top: 0, background: 'var(--color-bg)', zIndex: 1 }

  // Checks every row between anchorId and trackId (inclusive), matching
  // Finder/Explorer range selection. Returns false (no-op) if either
  // endpoint isn't in the current filtered/sorted view, so callers can
  // fall back to their own single-row behavior.
  function checkRange(anchorId: number, trackId: number): boolean {
    const fromIndex = visibleTracks.findIndex((t) => t.id === anchorId)
    const toIndex = visibleTracks.findIndex((t) => t.id === trackId)
    if (fromIndex === -1 || toIndex === -1) return false
    const [start, end] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex]
    const rangeIds = visibleTracks.slice(start, end + 1).map((t) => t.id)
    setTracksChecked(rangeIds, true)
    setLastCheckedTrackId(trackId)
    return true
  }

  // Shift-clicking a row's checkbox checks every row between it and the
  // last-clicked checkbox (inclusive) — falls back to a plain toggle if
  // there's no prior anchor or the range check couldn't resolve.
  function handleCheckboxClick(trackId: number, shiftKey: boolean) {
    if (shiftKey && lastCheckedTrackId != null && checkRange(lastCheckedTrackId, trackId)) return
    toggleTrackChecked(trackId)
    setLastCheckedTrackId(trackId)
  }

  // Shift-clicking a row itself (not just its checkbox) also range-checks,
  // anchored off the last checkbox click, falling back to the currently
  // selected row so a shift-click works even before any checkbox was
  // touched. A plain click still just moves the detail-panel selection.
  function handleRowClick(track: Track, shiftKey: boolean) {
    const anchorId = lastCheckedTrackId ?? selectedTrackId
    if (shiftKey && anchorId != null) checkRange(anchorId, track.id)
    onSelect(track)
  }

  // Play and pre-listen: their own fixed column after the checkbox, never reordered
  // with the others. A missing track's file is gone — nothing to play.
  function renderPlayCell(track: Track) {
    if (track.missing) return null
    return (
      <>
        <button
          onClick={(e) => {
            e.stopPropagation()
            // Loading a track into the player is itself a form of
            // selecting it — without this, the play button and
            // clicking the row would leave the detail panel out of
            // sync with what's actually playing.
            onSelect(track)
            // The loaded track's button is its play/pause toggle —
            // clicking it again must not restart it from the top.
            if (track.id === currentTrackId && playbackControls) playbackControls.toggle()
            else playTrackNow(track.id)
          }}
          title={track.id === currentTrackId && playerPlaying ? 'Pause' : track.id === currentTrackId ? 'Resume' : 'Play track now'}
          style={{
            background: 'none',
            border: 'none',
            padding: '0 4px 0 0',
            cursor: 'pointer',
            verticalAlign: 'middle',
            color: track.id === currentTrackId ? 'var(--color-accent)' : 'var(--color-text-dim)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>
            {track.id === currentTrackId && playerPlaying ? 'pause_circle' : 'play_circle'}
          </span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            addToPlaylist(track.id)
            showToast(`Added "${decodeHtmlEntities(track.title ?? track.filename)}" to the queue`)
          }}
          title={queuedIds.has(track.id) ? 'In the queue — add it again' : 'Add to queue'}
          style={{
            background: 'none',
            border: 'none',
            padding: '0 4px 0 0',
            cursor: 'pointer',
            verticalAlign: 'middle',
            color: queuedIds.has(track.id) ? 'var(--color-accent)' : 'var(--color-text-dim)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>
            {queuedIds.has(track.id) ? 'playlist_add_check' : 'playlist_add'}
          </span>
        </button>
        {track.cloudStatus === 'local' && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              previewTrack(track.id)
            }}
            title={track.id === cueTrackId ? 'Stop pre-listen' : 'Pre-listen in headphones (P)'}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              verticalAlign: 'middle',
              color: track.id === cueTrackId ? 'var(--color-accent)' : 'var(--color-text-dim)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>
              headphones
            </span>
          </button>
        )}
      </>
    )
  }

  function renderCell(track: Track, key: TrackTableColumnKey) {
    switch (key) {
      case 'title':
        // Analysis progress shows in the Status column, not here.
        return decodeHtmlEntities(track.title ?? track.filename)
      case 'filename':
        return decodeHtmlEntities(track.filename)
      case 'artist':
        return track.artist ? decodeHtmlEntities(track.artist) : '—'
      case 'album':
        return track.album ? decodeHtmlEntities(track.album) : '—'
      case 'tags':
      case 'subtags': {
        const names = tagNamesFor(track.id, key)
        if (names.length === 0) return '—'
        return (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px' }}>
            {names.map((t, i) => (
              <span
                key={i}
                // Tags are filled with their colour; Subtags are outlined
                // in theirs.
                style={
                  key === 'subtags'
                    ? {
                        fontSize: '11px',
                        padding: '0 5px',
                        borderRadius: '8px',
                        background: 'var(--color-surface-raised)',
                        border: `2px solid ${t.color ?? 'var(--color-border)'}`,
                        color: 'var(--color-text)',
                      }
                    : {
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '8px',
                        background: t.color ?? 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border)',
                        color: t.color ? '#fff' : 'var(--color-text)',
                      }
                }
              >
                {t.name}
              </span>
            ))}
          </span>
        )
      }
      case 'bpm':
        return track.bpm?.toFixed(0) ?? '—'
      case 'musicalKey': {
        const camelot = toCamelot(track.musicalKey)
        const label = formatKey(track.musicalKey, keyNotation)
        if (!label) return '—'
        if (!camelot) return label
        return (
          <span
            title={track.musicalKey ?? undefined}
            style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: '8px',
              background: camelotColor(camelot),
              color: '#fff',
            }}
          >
            {label}
          </span>
        )
      }
      case 'loudness':
        return track.loudness === null ? '—' : formatLufs(track.loudness)
      case 'gain': {
        const gain = gainToMatch(track.loudness, loudnessTarget)
        if (gain === null) return '—'
        // 3 dB or more off is worth a look before mixing it in.
        const far = Math.abs(gain) >= 3
        return (
          <span
            title={`${gain > 0 ? 'Turn up' : gain < 0 ? 'Turn down' : 'Already at'} ${gain !== 0 ? formatGain(gain).replace(/^[+−±]/, '') + ' ' : ''}to match the collection (${formatLufs(loudnessTarget!)} LUFS)`}
            style={far ? { color: gain > 0 ? 'var(--color-accent)' : 'var(--color-secondary)' } : undefined}
          >
            {formatGain(gain)}
          </span>
        )
      }
      case 'cues': {
        const n = hotCueCounts[track.id]
        return n ? (
          <span title={`${n} hot cue${n === 1 ? '' : 's'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--color-cue)' }}>
              bookmark
            </span>
            {n}
          </span>
        ) : (
          '—'
        )
      }
      case 'energy':
        return track.energy === null ? '—' : <EnergyMeter energy={track.energy} />
      case 'format':
        return track.format
      case 'bitrate': {
        if (!track.bitrate) return '—'
        const low = LOSSY_FORMATS.has(track.format) && track.bitrate < LOW_BITRATE_KBPS
        return (
          <span
            style={low ? { color: 'var(--color-secondary)' } : undefined}
            title={low ? `Low bitrate for a ${track.format.toUpperCase()} file` : undefined}
          >
            {track.bitrate} kbps
          </span>
        )
      }
      case 'duration':
        return track.duration ? formatDuration(track.duration) : '—'
      case 'dateAdded':
        return formatDate(track.birthtime)
      case 'dateModified':
        return formatDate(track.mtime)
    }
  }

  // The tracks a right-click acts on: every checked track when the row is
  // one of several checked ones, otherwise just that row.
  const menuTrackIds = useMemo(() => {
    if (!contextMenu || !checkedTrackIds.has(contextMenu.trackId) || checkedTrackIds.size < 2) {
      return contextMenu ? [contextMenu.trackId] : []
    }
    const inTable = visibleTracks.filter((t) => checkedTrackIds.has(t.id)).map((t) => t.id)
    const elsewhere = [...checkedTrackIds].filter((id) => !inTable.includes(id))
    return [...inTable, ...elsewhere]
  }, [contextMenu, checkedTrackIds, visibleTracks])
  const menuOnMissing = useMemo(
    () => !!contextMenu && !!visibleTracks.find((t) => t.id === contextMenu.trackId)?.missing,
    [contextMenu, visibleTracks]
  )

  function cellStyleFor(key: TrackTableColumnKey) {
    const width = columnWidths[key]
    return { ...cellStyle, width, maxWidth: width, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const }
  }

  function handleColumnDrop(targetKey: TrackTableColumnKey) {
    if (!draggedColumn || draggedColumn === targetKey) {
      setDraggedColumn(null)
      return
    }
    const next = [...columnOrder]
    const fromIndex = next.indexOf(draggedColumn)
    const toIndex = next.indexOf(targetKey)
    next.splice(fromIndex, 1)
    next.splice(toIndex, 0, draggedColumn)
    setColumnOrder(next)
    setDraggedColumn(null)
  }

  return (
    <>
      {/* Toolbar lives outside the scroll container so it never scrolls
          away. "Add all to queue" is always here; the selection actions
          (BatchTagBar) join it whenever tracks are checked. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '6px 8px',
          borderBottom: '1px solid var(--color-border)',
          background: checkedTrackIds.size > 0 ? 'var(--color-surface)' : undefined,
          flexShrink: 0,
          minHeight: '40px',
        }}
      >
        <button
          // Confirmation / analyse-now choice handled by QueueDialog.
          onClick={() => requestAddManyToQueue(visibleTrackIds)}
          // Missing tracks have no file to play.
          disabled={visibleTracks.length === 0 || missingTracksFilter}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            playlist_add
          </span>
          Add all to queue
        </button>
        {searchText.trim() && (
          <FilterChip icon="search" label={`“${searchText.trim()}”`} onClear={() => setSearchText('')} />
        )}
        {selectedFolder && (
          <FilterChip
            icon="folder"
            label={baseName(selectedFolder)}
            title={selectedFolder}
            onClear={onClearFolder}
          />
        )}
        {tagFilterChip && <FilterChip icon={tagFilterChip.icon} label={tagFilterChip.label} onClear={onClearTagFilter} />}
        {selectedPlaylistId !== null && selectedPlaylistName && (
          <FilterChip icon="queue_music" label={selectedPlaylistName} onClear={() => void selectPlaylist(null)} />
        )}
        {selectedPlaylistId !== null && !playlistOrder && (
          <button
            onClick={() => setPlaylistOrder(true)}
            title="Back to the playlist's own order"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              format_list_numbered
            </span>
            Playlist order
          </button>
        )}
        {/* The Filters view's active filters, each with a quick way off. */}
        {compatibleFilter && (
          <FilterChip
            icon="join"
            label={canFilterCompatible ? `Compatible with ${formatKey(currentTrack?.musicalKey, 'both')}` : 'Compatible (nothing playing)'}
            onClear={() => setCompatibleFilter(false)}
          />
        )}
        {energyFilter && (
          <FilterChip
            icon="bolt"
            label={energyFilter[0] === energyFilter[1] ? `Energy ${energyFilter[0]}` : `Energy ${energyFilter[0]}–${energyFilter[1]}`}
            onClear={() => setEnergyFilter(null)}
          />
        )}
        {analysedFilter !== 'all' && (
          <FilterChip
            icon="graphic_eq"
            label={analysedFilter === 'analysed' ? 'Analysed' : 'Not analysed'}
            onClear={() => setAnalysedFilter('all')}
          />
        )}
        {duplicatesFilter && <FilterChip icon="content_copy" label="Duplicates" onClear={() => setDuplicatesFilter(false)} />}
        {slowBpmFilter && <FilterChip icon="speed" label={`Below ${slowestBpm} BPM`} onClear={() => setSlowBpmFilter(false)} />}
        {mcoTagsFilter !== 'all' && (
          <FilterChip
            icon="sell"
            label={mcoTagsFilter === 'no-tags' ? 'No Tags' : 'No Subtags'}
            onClear={() => setMcoTagsFilter('all')}
          />
        )}
        {missingMetadataFilter && <FilterChip icon="person_off" label="Missing ID3 metadata" onClear={() => setMissingMetadataFilter(false)} />}
        {cloudOnlyFilter && <FilterChip icon="cloud" label="Not locally available" onClear={() => setCloudOnlyFilter(false)} />}
        {missingTracksFilter && <FilterChip icon="link_off" label="Missing tracks" onClear={() => setMissingTracksFilter(false)} />}
        <BatchTagBar visibleTrackIds={visibleTrackIds} />
      </div>
      {/* This div (not the ambient .pane it sits in, which App.tsx makes a
          column flexbox) is the actual scroll container on both axes —
          flex:1 + minHeight:0 gives it a real bounded height to scroll
          within, which sticky-header positioning below depends on. Without
          a bounded height (e.g. a plain height:auto div with just overflowX
          set), the div's overflow-y gets silently promoted to 'auto' too
          (CSS spec) but never actually scrolls, so a sticky child inside it
          never visibly sticks — the ancestor .pane scrolls past it instead. */}
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        style={{ overflow: 'auto', flex: 1, minHeight: 0 }}
      >
        <table
          style={{
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            width:
              PLAY_COL_WIDTH +
              CHECKBOX_COL_WIDTH +
              orderedColumns.reduce((sum, col) => sum + columnWidths[col.key], 0) +
              STATUS_COL_WIDTH +
              CLOUD_COL_WIDTH,
          }}
        >
          <thead>
            <tr>
              <th style={{ ...cellStyle, width: CHECKBOX_COL_WIDTH, ...stickyHeaderStyle }}>
                <input
                  type="checkbox"
                  checked={visibleTracks.length > 0 && visibleTracks.every((t) => checkedTrackIds.has(t.id))}
                  onChange={(e) => setTracksChecked(visibleTracks.map((t) => t.id), e.target.checked)}
                />
              </th>
              <th style={{ ...cellStyle, width: PLAY_COL_WIDTH, ...stickyHeaderStyle, padding: '4px' }}>
                <button
                  onClick={openColumnsMenu}
                  title="Choose columns (or right-click a column header)"
                  aria-label="Choose columns"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: 'var(--color-text-dim)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    view_column
                  </span>
                </button>
              </th>
              {orderedColumns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  onContextMenu={openColumnsMenu}
                  draggable
                  onDragStart={() => setDraggedColumn(col.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    handleColumnDrop(col.key)
                  }}
                  title={`${COLUMN_HINTS[col.key] ? COLUMN_HINTS[col.key]!(loudnessTarget) + '\n' : ''}Click to sort, drag to reorder, right-click to choose columns`}
                  style={{
                    ...cellStyle,
                    ...stickyHeaderStyle,
                    cursor: 'pointer',
                    textAlign: 'left',
                    opacity: draggedColumn === col.key ? 0.5 : 1,
                    width: columnWidths[col.key],
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {col.label}
                  {sortKey === col.key && !(selectedPlaylistId !== null && playlistOrder) ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  <div
                    onMouseDown={(e) => handleResizeStart(col.key, e)}
                    onClick={(e) => e.stopPropagation()}
                    title="Drag to resize"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '6px',
                      cursor: 'col-resize',
                    }}
                  />
                </th>
              ))}
              <th style={{ ...cellStyle, width: STATUS_COL_WIDTH, ...stickyHeaderStyle }}>Status</th>
              <th style={{ ...cellStyle, width: CLOUD_COL_WIDTH, ...stickyHeaderStyle }}>Cloud</th>
            </tr>
          </thead>
          <tbody
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setRowDrop(null)
            }}
          >
            {tracks.length > 0 && visibleTracks.length === 0 && (
              <tr>
                <td
                  colSpan={orderedColumns.length + 4}
                  style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-dim)' }}
                >
                  {selectedPlaylistId !== null && selectedPlaylistTrackIds.length === 0
                    ? 'This playlist is empty — drag songs onto it, or right-click a song → Add to playlist.'
                    : 'No tracks match your search/filter.'}
                </td>
              </tr>
            )}
            {firstRendered > 0 && (
              <tr aria-hidden style={{ height: firstRendered * ROW_HEIGHT }}>
                <td colSpan={orderedColumns.length + 4} style={{ padding: 0 }} />
              </tr>
            )}
            {renderedTracks.map((track) => (
              <tr
                key={track.id}
                data-track-id={track.id}
                // Checked rows share the selected row's highlight, so a
                // multi-selection reads as one group.
                className={`track-row${track.id === selectedTrackId || checkedTrackIds.has(track.id) ? ' selected' : ''}`}
                onClick={(e) => handleRowClick(track, e.shiftKey)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  // A missing song can still be removed from the playlist.
                  if (track.missing && selectedPlaylistId === null) return
                  setContextMenu({ trackId: track.id, x: e.clientX, y: e.clientY })
                }}
                draggable={!track.missing}
                onDragStart={(e) => {
                  // Native OS drag (to Finder, a DAW, etc.) hands off the
                  // tracks' existing file paths — it's a reference, not a
                  // copy; preventDefault stops the browser's own HTML5 drag
                  // image/ghost from also kicking in alongside it. If the
                  // dragged row is part of a multi-checked selection, drag
                  // all checked tracks; otherwise just this one row.
                  e.preventDefault()
                  const ids =
                    checkedTrackIds.has(track.id) && checkedTrackIds.size > 1
                      ? Array.from(checkedTrackIds)
                      : [track.id]
                  window.api.startTrackDrag(ids)
                }}
                // Reordering a playlist: the rows' native drag comes back as
                // files, matched to tracks by path like the Playlists box does.
                onDragOver={(e) => {
                  if (!canReorder || !e.dataTransfer.types.includes('Files')) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  const where = rowDropWhere(e)
                  if (rowDrop?.id !== track.id || rowDrop.where !== where) setRowDrop({ id: track.id, where })
                }}
                onDrop={(e) => {
                  if (!canReorder) return
                  e.preventDefault()
                  setRowDrop(null)
                  const ids = [...e.dataTransfer.files]
                    .map((file) => trackIdsByPath.get(window.api.pathForFile(file)))
                    .filter((id): id is number => id !== undefined)
                  if (ids.length > 0) void moveTracksInSelectedPlaylist(ids, track.id, rowDropWhere(e))
                }}
                style={{
                  cursor: 'pointer',
                  height: ROW_HEIGHT,
                  ...(track.missing ? { opacity: 0.6 } : {}),
                  // A line where the dragged rows will land.
                  ...(rowDrop?.id === track.id
                    ? { boxShadow: `inset 0 ${rowDrop.where === 'before' ? '2px' : '-2px'} 0 var(--color-accent)` }
                    : {}),
                }}
              >
                <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={checkedTrackIds.has(track.id)}
                    onMouseDown={(e) => {
                      shiftKeyRef.current = e.shiftKey
                    }}
                    onChange={() => handleCheckboxClick(track.id, shiftKeyRef.current)}
                  />
                </td>
                <td style={{ ...cellStyle, padding: '8px 4px', overflow: 'hidden' }}>{renderPlayCell(track)}</td>
                {orderedColumns.map((col) => (
                  <td key={col.key} style={cellStyleFor(col.key)}>
                    {renderCell(track, col.key)}
                  </td>
                ))}
                <td style={cellStyle}>
                  {track.analysisStatus === 'analyzing' ? (
                    <span className="material-symbols-outlined spin" style={{ fontSize: '16px' }} title="Analyzing…">
                      progress_activity
                    </span>
                  ) : track.analysisStatus === 'error' ? (
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: '16px', color: 'var(--color-error)' }}
                      title={`Analysis failed: ${track.analysisError ?? 'no reason recorded'}\nSelect the track to try again`}
                    >
                      error
                    </span>
                  ) : null}
                </td>
                <td style={cellStyle}>
                  {track.missing ? (
                    <span className="material-symbols-outlined" style={{ color: 'var(--color-error)' }} title="File missing">
                      link_off
                    </span>
                  ) : track.cloudStatus === 'cloud_only' ? (
                    <span className="material-symbols-outlined">cloud</span>
                  ) : null}
                </td>
              </tr>
            ))}
            {lastRendered < visibleTracks.length && (
              <tr aria-hidden style={{ height: (visibleTracks.length - lastRendered) * ROW_HEIGHT }}>
                <td colSpan={orderedColumns.length + 4} style={{ padding: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
        {columnsMenu && (
          <ContextMenu x={columnsMenu.x} y={columnsMenu.y} onClose={() => setColumnsMenu(null)}>
            <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--color-text-dim)' }}>Columns</div>
            {columnOrder.map((key) => (
              <label key={key} style={{ ...contextMenuItemStyle, cursor: key === 'title' ? 'default' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!hiddenColumns.includes(key)}
                  disabled={key === 'title'}
                  onChange={(e) => setColumnVisible(key, e.target.checked)}
                />
                {columnLabels[key]}
              </label>
            ))}
          </ContextMenu>
        )}
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
            {menuOnMissing && selectedPlaylistId !== null ? (
              // A song whose file is gone: all it can do is leave the playlist.
              <button
                onClick={() => {
                  void removeTracksFromSelectedPlaylist(menuTrackIds)
                  setContextMenu(null)
                }}
                style={contextMenuItemStyle}
              >
                <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                  playlist_remove
                </span>
                {menuTrackIds.length > 1 ? `Remove ${menuTrackIds.length} songs from` : 'Remove from'} {selectedPlaylistName}
              </button>
            ) : menuTrackIds.length > 1 ? (
              // Right-click on one of several checked tracks: act on all of
              // them, in table order.
              <>
                <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--color-text-dim)' }}>
                  {menuTrackIds.length} tracks selected
                </div>
                <button
                  onClick={() => {
                    requestAddManyToQueue(menuTrackIds)
                    setContextMenu(null)
                  }}
                  style={contextMenuItemStyle}
                >
                  <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                    playlist_add
                  </span>
                  Add all to queue
                </button>
                <button
                  onClick={() => {
                    // Each goes in right after the playing track, so adding
                    // them last-first keeps their order.
                    for (const id of [...menuTrackIds].reverse()) playNext(id)
                    setContextMenu(null)
                  }}
                  style={contextMenuItemStyle}
                >
                  <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                    skip_next
                  </span>
                  Add all to top of the queue
                </button>
                <button
                  onClick={() => {
                    setAddToPlaylistMenu({ trackIds: menuTrackIds, x: contextMenu.x, y: contextMenu.y })
                    setContextMenu(null)
                  }}
                  style={contextMenuItemStyle}
                >
                  <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                    queue_music
                  </span>
                  Add all to playlist…
                </button>
                {selectedPlaylistId !== null && (
                  <button
                    onClick={() => {
                      void removeTracksFromSelectedPlaylist(menuTrackIds)
                      setContextMenu(null)
                    }}
                    style={contextMenuItemStyle}
                  >
                    <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                      playlist_remove
                    </span>
                    Remove all from {selectedPlaylistName}
                  </button>
                )}
                <button
                  onClick={() => {
                    runAnalysis(menuTrackIds)
                    setContextMenu(null)
                  }}
                  style={contextMenuItemStyle}
                >
                  <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                    graphic_eq
                  </span>
                  {menuTrackIds.every((id) => tracksById(tracks).get(id)?.analysisStatus === 'done')
                    ? 'Re-analyse all'
                    : 'Analyse all'}
                </button>
                <button
                  onClick={() => {
                    setBpmMenu({ trackIds: menuTrackIds, x: contextMenu.x, y: contextMenu.y })
                    setContextMenu(null)
                  }}
                  style={contextMenuItemStyle}
                >
                  <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                    speed
                  </span>
                  Refine BPM of all…
                </button>
                <button
                  onClick={() => {
                    setConvertTrackIds(menuTrackIds)
                    setContextMenu(null)
                  }}
                  style={contextMenuItemStyle}
                >
                  <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                    swap_horiz
                  </span>
                  Convert all to…
                </button>
                <button
                  onClick={() => {
                    setTracksChecked(menuTrackIds, false)
                    setContextMenu(null)
                  }}
                  style={contextMenuItemStyle}
                >
                  <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                    deselect
                  </span>
                  Clear selection
                </button>
              </>
            ) : (
              <>
            <button
              onClick={() => {
                playTrackNow(contextMenu.trackId)
                setContextMenu(null)
              }}
              style={contextMenuItemStyle}
            >
              <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                play_arrow
              </span>
              Play track now
            </button>
            <button
              onClick={() => {
                addToPlaylist(contextMenu.trackId)
                setContextMenu(null)
              }}
              style={contextMenuItemStyle}
            >
              <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                playlist_add
              </span>
              Add to queue
            </button>
            <button
              onClick={() => {
                playNext(contextMenu.trackId)
                setContextMenu(null)
              }}
              style={contextMenuItemStyle}
            >
              <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                skip_next
              </span>
              Add to top of the queue
            </button>
            <button
              onClick={() => {
                setAddToPlaylistMenu({ trackIds: [contextMenu.trackId], x: contextMenu.x, y: contextMenu.y })
                setContextMenu(null)
              }}
              style={contextMenuItemStyle}
            >
              <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                queue_music
              </span>
              Add to playlist…
            </button>
            {selectedPlaylistId !== null && (
              <button
                onClick={() => {
                  void removeTracksFromSelectedPlaylist([contextMenu.trackId])
                  setContextMenu(null)
                }}
                style={contextMenuItemStyle}
              >
                <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                  playlist_remove
                </span>
                Remove from {selectedPlaylistName}
              </button>
            )}
            <button
              onClick={() => {
                previewTrack(contextMenu.trackId)
                setContextMenu(null)
              }}
              style={contextMenuItemStyle}
            >
              <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                headphones
              </span>
              {contextMenu.trackId === cueTrackId ? 'Stop pre-listen' : 'Pre-listen in headphones'}
            </button>
            <button
              onClick={() => {
                runAnalysis([contextMenu.trackId])
                setContextMenu(null)
              }}
              style={contextMenuItemStyle}
            >
              <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                graphic_eq
              </span>
              {tracksById(tracks).get(contextMenu.trackId)?.analysisStatus === 'done'
                ? 'Re-analyse track'
                : 'Analyse track'}
            </button>
            <button
              onClick={() => {
                setBpmMenu({ trackIds: [contextMenu.trackId], x: contextMenu.x, y: contextMenu.y })
                setContextMenu(null)
              }}
              style={contextMenuItemStyle}
            >
              <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                speed
              </span>
              Refine BPM…
            </button>
            <button
              onClick={() => {
                setConvertTrackIds([contextMenu.trackId])
                setContextMenu(null)
              }}
              style={contextMenuItemStyle}
            >
              <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                swap_horiz
              </span>
              Convert to…
            </button>
            <button
              onClick={() => {
                window.api.showTrackInFolder(contextMenu.trackId)
                setContextMenu(null)
              }}
              style={contextMenuItemStyle}
            >
              <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                folder_open
              </span>
              {REVEAL_IN_FILE_MANAGER}
            </button>
            <button
              onClick={() => {
                const track = tracksById(tracks).get(contextMenu.trackId)
                if (track) onShowInFolderTree(track.folder)
                setContextMenu(null)
              }}
              style={contextMenuItemStyle}
            >
              <span className="material-symbols-outlined" style={contextMenuIconStyle}>
                account_tree
              </span>
              Show in Folder Tree View
            </button>
              </>
            )}
          </ContextMenu>
        )}
        {addToPlaylistMenu && (
          <AddToPlaylistMenu {...addToPlaylistMenu} onClose={() => setAddToPlaylistMenu(null)} />
        )}
        {convertTrackIds && <ConvertDialog trackIds={convertTrackIds} onClose={() => setConvertTrackIds(null)} />}
        {bpmMenu && <RefineBpmMenu {...bpmMenu} onClose={() => setBpmMenu(null)} />}
      </div>
    </>
  )
}
