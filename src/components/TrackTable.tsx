import { useEffect, useMemo, useRef, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { BatchTagBar } from './BatchTagBar'
import { contextMenuStyle, contextMenuItemStyle, contextMenuIconStyle } from './contextMenuStyles'
import { formatDuration, formatDate, decodeHtmlEntities } from '../format'
import type { Track, TrackTableColumnKey } from '../types'
import { formatKey, keySortValue, toCamelot, camelotColor, areKeysCompatible, areBpmsCompatible } from '../state/harmonic'

type SortKey = TrackTableColumnKey

const DEFAULT_COLUMN_WIDTHS: Record<TrackTableColumnKey, number> = {
  title: 260,
  filename: 220,
  artist: 160,
  tags: 200,
  bpm: 70,
  musicalKey: 70,
  format: 80,
  bitrate: 90,
  duration: 90,
  dateAdded: 120,
  dateModified: 120,
}
// Lossy files below this are flagged in the Bitrate column — 192 kbps is
// the usual floor for playing out on a club system.
const LOSSY_FORMATS = new Set(['mp3', 'm4a', 'aac', 'ogg', 'opus'])
const LOW_BITRATE_KBPS = 192
const MIN_COLUMN_WIDTH = 50
const CHECKBOX_COL_WIDTH = 36
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

function loadColumnWidths(): Record<TrackTableColumnKey, number> {
  try {
    const stored = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY)
    if (!stored) return { ...DEFAULT_COLUMN_WIDTHS }
    return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(stored) }
  } catch {
    return { ...DEFAULT_COLUMN_WIDTHS }
  }
}

export function TrackTable({
  onSelect,
  selectedFolder,
  activeFilter,
  selectedTrackId,
  scrollToTrack,
  onShowInFolderTree,
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
}) {
  const tracks = useCollectionStore((s) => s.tracks)
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const trackTags = useCollectionStore((s) => s.trackTags)
  const searchText = useCollectionStore((s) => s.searchText)
  const checkedTrackIds = useCollectionStore((s) => s.checkedTrackIds)
  const toggleTrackChecked = useCollectionStore((s) => s.toggleTrackChecked)
  const setTracksChecked = useCollectionStore((s) => s.setTracksChecked)
  const modalOpen = useCollectionStore((s) => s.modalOpen)
  const playlist = useCollectionStore((s) => s.playlist)
  const playTrackNow = useCollectionStore((s) => s.playTrackNow)
  const addToPlaylist = useCollectionStore((s) => s.addToPlaylist)
  const requestAddManyToQueue = useCollectionStore((s) => s.requestAddManyToQueue)
  const playNext = useCollectionStore((s) => s.playNext)
  const runAnalysis = useCollectionStore((s) => s.runAnalysis)
  const columnOrder = useCollectionStore((s) => s.columnOrder)
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
  const currentTrackId = playlist[0] ?? null
  const currentTrack = useMemo(
    () => (currentTrackId != null ? (tracks.find((t) => t.id === currentTrackId) ?? null) : null),
    [tracks, currentTrackId]
  )
  // The filter needs a playing track with an analysed key to compare with.
  const canFilterCompatible = !!currentTrack && toCamelot(currentTrack.musicalKey) !== null
  const [draggedColumn, setDraggedColumn] = useState<TrackTableColumnKey | null>(null)
  const sortKey = sortState.key
  const sortDir = sortState.direction
  const [contextMenu, setContextMenu] = useState<{ trackId: number; x: number; y: number } | null>(null)
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
        try {
          localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(prev))
        } catch {
          // Best-effort persistence — losing a resize on a full/blocked
          // localStorage isn't worth surfacing to the user.
        }
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

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortState({ key, direction: sortDir === 'asc' ? 'desc' : 'asc' })
    } else {
      setSortState({ key, direction: 'asc' })
    }
  }

  const subgenresById = useMemo(() => new Map(subgenres.map((sg) => [sg.id, sg])), [subgenres])
  const genresById = useMemo(() => new Map(genres.map((g) => [g.id, g])), [genres])

  function tagNamesFor(trackId: number): { name: string; color: string | null; sub: boolean }[] {
    const tags = trackTags.get(trackId)
    if (!tags) return []
    const genreNames = tags.genreIds
      .map((id) => genresById.get(id))
      .filter((g): g is NonNullable<typeof g> => !!g)
      .map((g) => ({ name: g.name, color: g.color, sub: false }))
    const subgenreNames = tags.subgenreIds
      .map((id) => subgenresById.get(id))
      .filter((sg): sg is NonNullable<typeof sg> => !!sg)
      .map((sg) => ({ name: sg.name, color: sg.color, sub: true }))
    return [...genreNames, ...subgenreNames].sort((a, b) => a.name.localeCompare(b.name))
  }

  // 'tags' has no matching field on Track (it's derived from trackTags),
  // so it needs its own comparable value instead of the direct property
  // lookup every other column uses.
  function sortValueFor(track: Track, key: SortKey): string | number {
    if (key === 'tags') return tagNamesFor(track.id).map((t) => t.name).join(', ')
    if (key === 'dateAdded') return track.birthtime ?? 0
    if (key === 'dateModified') return track.mtime ?? 0
    if (key === 'musicalKey') return keySortValue(track.musicalKey)
    return track[key] ?? ''
  }

  const visibleTracks = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return tracks
      .filter((t) => (selectedFolder ? t.folder === selectedFolder || t.folder.startsWith(selectedFolder + '/') : true))
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
        query
          ? [t.title, t.artist, t.album, t.filename].some((v) => v?.toLowerCase().includes(query)) ||
            tagNamesFor(t.id).some((tag) => tag.name.toLowerCase().includes(query))
          : true
      )
      .sort((a, b) => {
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
  ])
  const visibleTrackIds = useMemo(() => visibleTracks.map((t) => t.id), [visibleTracks])

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
  }, [visibleTracks, selectedTrackId, onSelect, modalOpen, previewTrack])

  const columnLabels: Record<TrackTableColumnKey, string> = {
    title: 'Title',
    filename: 'Filename',
    artist: 'Artist',
    tags: 'Tags',
    bpm: 'BPM',
    musicalKey: 'Key',
    format: 'Format',
    bitrate: 'Bitrate',
    duration: 'Duration',
    dateAdded: 'Date Added',
    dateModified: 'Date Modified',
  }
  const orderedColumns = columnOrder.map((key) => ({ key, label: columnLabels[key] }))

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

  function renderCell(track: Track, key: TrackTableColumnKey) {
    switch (key) {
      case 'title':
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
                  padding: '0 4px 0 0',
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
            {track.analysisStatus === 'analyzing' && (
              <span
                className="material-symbols-outlined spin"
                style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px', color: 'var(--color-text-dim)' }}
                title="Analyzing…"
              >
                progress_activity
              </span>
            )}
            {decodeHtmlEntities(track.title ?? track.filename)}
          </>
        )
      case 'filename':
        return decodeHtmlEntities(track.filename)
      case 'artist':
        return track.artist ? decodeHtmlEntities(track.artist) : '—'
      case 'tags': {
        const names = tagNamesFor(track.id)
        if (names.length === 0) return '—'
        return (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px' }}>
            {names.map((t, i) => (
              <span
                key={i}
                // Genres are filled with their colour; sub-genres are
                // outlined in theirs.
                style={
                  t.sub
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
          disabled={visibleTracks.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            playlist_add
          </span>
          Add all to queue
        </button>
        <button
          onClick={() => setCompatibleFilter(!compatibleFilter)}
          disabled={!canFilterCompatible && !compatibleFilter}
          title={
            canFilterCompatible
              ? `Only tracks that mix with the playing track (${formatKey(currentTrack?.musicalKey, 'both')}): on the Camelot wheel, the same key, one step either way, or its relative major/minor — and a BPM within 6% (or half/double time)`
              : 'Play an analysed track to find tracks that mix with it'
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            border: compatibleFilter ? '1px solid var(--color-accent)' : undefined,
            color: compatibleFilter ? 'var(--color-accent)' : undefined,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            join
          </span>
          Compatible
        </button>
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
              {orderedColumns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  draggable
                  onDragStart={() => setDraggedColumn(col.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    handleColumnDrop(col.key)
                  }}
                  title="Click to sort, drag to reorder"
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
                  {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
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
          <tbody>
            {tracks.length > 0 && visibleTracks.length === 0 && (
              <tr>
                <td
                  colSpan={orderedColumns.length + 3}
                  style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-dim)' }}
                >
                  No tracks match your search/filter.
                </td>
              </tr>
            )}
            {firstRendered > 0 && (
              <tr aria-hidden style={{ height: firstRendered * ROW_HEIGHT }}>
                <td colSpan={orderedColumns.length + 3} style={{ padding: 0 }} />
              </tr>
            )}
            {renderedTracks.map((track) => (
              <tr
                key={track.id}
                data-track-id={track.id}
                className={`track-row${track.id === selectedTrackId ? ' selected' : ''}`}
                onClick={(e) => handleRowClick(track, e.shiftKey)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setContextMenu({ trackId: track.id, x: e.clientX, y: e.clientY })
                }}
                draggable
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
                style={{ cursor: 'pointer', height: ROW_HEIGHT }}
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
                      title="Analysis failed"
                    >
                      error
                    </span>
                  ) : null}
                </td>
                <td style={cellStyle}>
                  {track.cloudStatus === 'cloud_only' ? <span className="material-symbols-outlined">cloud</span> : null}
                </td>
              </tr>
            ))}
            {lastRendered < visibleTracks.length && (
              <tr aria-hidden style={{ height: (visibleTracks.length - lastRendered) * ROW_HEIGHT }}>
                <td colSpan={orderedColumns.length + 3} style={{ padding: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
        {contextMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...contextMenuStyle, top: contextMenu.y, left: contextMenu.x }}
          >
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
              {tracks.find((t) => t.id === contextMenu.trackId)?.analysisStatus === 'done'
                ? 'Re-analyse track'
                : 'Analyse track'}
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
              Show in File Explorer
            </button>
            <button
              onClick={() => {
                const track = tracks.find((t) => t.id === contextMenu.trackId)
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
          </div>
        )}
      </div>
    </>
  )
}
