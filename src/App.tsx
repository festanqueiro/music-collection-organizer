import { useEffect, useRef, useState } from 'react'
import { useCollectionStore } from './state/store'
import { Toolbar } from './components/Toolbar'
import { ScanPrompt } from './components/ScanPrompt'
import { FolderTree } from './components/FolderTree'
import { TagTree } from './components/TagTree'
import { SubtagTree } from './components/SubtagTree'
import { CuePlayer } from './components/CuePlayer'
import { hideBootSplash } from './bootSplash'
import { UpdateBanner } from './components/UpdateBanner'
import { TrackTable } from './components/TrackTable'
import { DetailPanel } from './components/DetailPanel'
import { Player, EmptyPlayer } from './components/Player'
import { FiltersPanel } from './components/FiltersPanel'
import { PlaylistView } from './components/PlaylistView'
import { FxView } from './components/FxView'
import { LiveView } from './components/LiveView'
import { Visualizer } from './components/Visualizer'
import { QueueDialog } from './components/QueueDialog'
import { AnalysisProgressBar } from './components/AnalysisProgressBar'
import { SettingsModal } from './components/SettingsModal'
import { StatsView } from './components/StatsView'
import { PlaylistsBox, expandPlaylistsBoxOnNextOpen } from './components/PlaylistsBox'
import { UndoToast } from './components/UndoToast'
import { Toast } from './components/Toast'
import { subscribeToMidiCc } from './audio/midi'
import { getDubSirenEngine } from './audio/sirenEngine'
import { getAudioEngine } from './audio/audioEngine'
import { SecondScreen } from './components/SecondScreen'
import { initRecording } from './audio/recordingSession'
import { initMic } from './audio/micSession'
import { initCast } from './cast/castSession'
import { initReceiverSync } from './cast/receiverSync'
import type { Track } from './types'
import { isInFolder } from './paths'
import { onMenuCommand, runMenuCommand } from './menuCommands'
import type { MenuCommand } from './types'

type LeftView = 'folders' | 'tags' | 'subtags' | 'filters'
type TreeView = Exclude<LeftView, 'filters'>
const LEFT_VIEWS: { key: LeftView; label: string; icon: string }[] = [
  { key: 'folders', label: 'Folders', icon: 'folder' },
  { key: 'tags', label: 'Tags', icon: 'sell' },
  { key: 'subtags', label: 'Subtags', icon: 'label' },
  { key: 'filters', label: 'Filters', icon: 'filter_list' },
]
function FilterCountBadge({ count }: { count: number }) {
  return (
    <span
      style={{
        fontSize: '10px',
        lineHeight: '14px',
        minWidth: '14px',
        padding: '0 3px',
        borderRadius: '99px',
        background: 'var(--color-accent)',
        color: 'var(--color-on-accent)',
        textAlign: 'center',
      }}
    >
      {count}
    </span>
  )
}

const SIDEBAR_STATE_KEY = 'sidebarState'
type SidebarState = { view: LeftView; treeView: TreeView; folder: string | null }

function loadSidebarState(): SidebarState {
  const fallback: SidebarState = { view: 'folders', treeView: 'folders', folder: null }
  try {
    const stored = JSON.parse(localStorage.getItem(SIDEBAR_STATE_KEY) ?? 'null')
    if (!stored || typeof stored !== 'object') return fallback
    const isTree = (v: unknown): v is TreeView => v === 'folders' || v === 'tags' || v === 'subtags'
    const treeView = isTree(stored.treeView) ? stored.treeView : 'folders'
    return {
      view: isTree(stored.view) || stored.view === 'filters' ? stored.view : treeView,
      treeView,
      folder: typeof stored.folder === 'string' ? stored.folder : null,
    }
  } catch {
    return fallback
  }
}

function saveSidebarState(state: SidebarState): void {
  try {
    localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify(state))
  } catch {
    // Non-essential — fine to lose.
  }
}

const LEFT_COLLAPSED_KEY = 'leftSidebarCollapsed'
const COLLAPSED_LEFT_WIDTH = 48

// The details panel's width: dragged at its left edge, remembered per computer.
const DETAIL_WIDTH_KEY = 'detailPanelWidth'
const DETAIL_WIDTH_DEFAULT = 320
const DETAIL_WIDTH_MIN = 280
const DETAIL_WIDTH_MAX = 720
// Never so wide that the table has no room left.
const clampDetailWidth = (width: number) =>
  Math.round(Math.max(DETAIL_WIDTH_MIN, Math.min(width, DETAIL_WIDTH_MAX, window.innerWidth * 0.6)))

function loadDetailWidth(): number {
  try {
    const stored = Number(localStorage.getItem(DETAIL_WIDTH_KEY))
    return stored > 0 ? clampDetailWidth(stored) : DETAIL_WIDTH_DEFAULT
  } catch {
    return DETAIL_WIDTH_DEFAULT
  }
}

// The same for the sidebar (the views and the Playlists box), at its right edge.
const LEFT_WIDTH_KEY = 'sidebarWidth'
const LEFT_WIDTH_DEFAULT = 260
const LEFT_WIDTH_MIN = 200
const LEFT_WIDTH_MAX = 560
const clampLeftWidth = (width: number) => Math.round(Math.max(LEFT_WIDTH_MIN, Math.min(width, LEFT_WIDTH_MAX, window.innerWidth * 0.4)))

function loadLeftWidth(): number {
  try {
    const stored = Number(localStorage.getItem(LEFT_WIDTH_KEY))
    return stored > 0 ? clampLeftWidth(stored) : LEFT_WIDTH_DEFAULT
  } catch {
    return LEFT_WIDTH_DEFAULT
  }
}

export default function App() {
  const loadAll = useCollectionStore((s) => s.loadAll)
  const tracks = useCollectionStore((s) => s.tracks)
  const collectionFolder = useCollectionStore((s) => s.collectionFolder)
  const loadCollectionFolder = useCollectionStore((s) => s.loadCollectionFolder)
  const loadEffectsSettings = useCollectionStore((s) => s.loadEffectsSettings)
  const loadMidiMappings = useCollectionStore((s) => s.loadMidiMappings)
  const loadColumnOrder = useCollectionStore((s) => s.loadColumnOrder)
  const loadHiddenColumns = useCollectionStore((s) => s.loadHiddenColumns)
  const loadSortState = useCollectionStore((s) => s.loadSortState)
  const loadAudioOutputDeviceId = useCollectionStore((s) => s.loadAudioOutputDeviceId)
  const loadCueOutputDeviceId = useCollectionStore((s) => s.loadCueOutputDeviceId)
  const loadUpdateState = useCollectionStore((s) => s.loadUpdateState)
  const loadLibrarySettings = useCollectionStore((s) => s.loadLibrarySettings)
  const handleLibraryChanged = useCollectionStore((s) => s.handleLibraryChanged)
  const setUpdateState = useCollectionStore((s) => s.setUpdateState)
  const audioOutputDeviceId = useCollectionStore((s) => s.audioOutputDeviceId)
  const loadAppVersion = useCollectionStore((s) => s.loadAppVersion)
  const handleMidiControlChange = useCollectionStore((s) => s.handleMidiControlChange)
  const pickCollectionFolder = useCollectionStore((s) => s.pickCollectionFolder)
  const analysisProgress = useCollectionStore((s) => s.analysisProgress)
  const setAnalysisProgress = useCollectionStore((s) => s.setAnalysisProgress)
  const refreshTracks = useCollectionStore((s) => s.refreshTracks)
  const pendingGenreDeletion = useCollectionStore((s) => s.pendingGenreDeletion)
  const undoGenreDeletion = useCollectionStore((s) => s.undoGenreDeletion)
  const dismissGenreDeletionUndo = useCollectionStore((s) => s.dismissGenreDeletionUndo)
  const toastMessage = useCollectionStore((s) => s.toastMessage)
  const pendingSubgenreDeletion = useCollectionStore((s) => s.pendingSubgenreDeletion)
  const undoSubgenreDeletion = useCollectionStore((s) => s.undoSubgenreDeletion)
  const dismissSubgenreDeletionUndo = useCollectionStore((s) => s.dismissSubgenreDeletionUndo)
  const clearCheckedTracks = useCollectionStore((s) => s.clearCheckedTracks)
  const setModalOpen = useCollectionStore((s) => s.setModalOpen)
  const playlist = useCollectionStore((s) => s.playlist)
  const playerScreen = useCollectionStore((s) => s.playerScreen)
  const modalOpen = useCollectionStore((s) => s.modalOpen)
  const visualizerOpen = useCollectionStore((s) => s.visualizerOpen)
  const setVisualizerOpen = useCollectionStore((s) => s.setVisualizerOpen)
  const setSearchText = useCollectionStore((s) => s.setSearchText)
  const lastRefreshRef = useRef(0)
  // Keep the screen (and Mac) awake while the visualiser is on, here or
  // on a second screen.
  const screenShowing = useCollectionStore((s) => s.screenTarget !== null)
  useEffect(() => {
    window.api.setKeepDisplayAwake(visualizerOpen || screenShowing)
  }, [visualizerOpen, screenShowing])
  const [leftView, setLeftView] = useState<LeftView>(() => loadSidebarState().view)
  // The folder/tag view the Filters view was opened from: kept mounted
  // (hidden) meanwhile, with its selection still applied — filters combine
  // with it rather than replacing it.
  const [treeView, setTreeView] = useState<TreeView>(() => loadSidebarState().treeView)
  const activeFilterCount = useCollectionStore(
    (s) =>
      Number(s.compatibleFilter) + Number(s.analysedFilter !== 'all') + Number(s.energyFilter !== null) + Number(s.duplicatesFilter) + Number(s.missingMetadataFilter) + Number(s.missingTracksFilter) + Number(s.cloudOnlyFilter) + Number(s.mcoTagsFilter !== 'all')
  )
  const [leftCollapsed, setLeftCollapsedState] = useState(() => {
    try {
      return localStorage.getItem(LEFT_COLLAPSED_KEY) === 'true'
    } catch {
      return false
    }
  })
  function setLeftCollapsed(collapsed: boolean) {
    setLeftCollapsedState(collapsed)
    try {
      localStorage.setItem(LEFT_COLLAPSED_KEY, String(collapsed))
    } catch {
      // Non-essential preference — fine to lose.
    }
  }
  const [detailWidth, setDetailWidth] = useState(loadDetailWidth)
  useEffect(() => {
    try {
      localStorage.setItem(DETAIL_WIDTH_KEY, String(detailWidth))
    } catch {
      // Non-essential preference — fine to lose.
    }
  }, [detailWidth])
  const [leftWidth, setLeftWidth] = useState(loadLeftWidth)
  useEffect(() => {
    try {
      localStorage.setItem(LEFT_WIDTH_KEY, String(leftWidth))
    } catch {
      // Non-essential preference — fine to lose.
    }
  }, [leftWidth])
  // The details are on the right, so dragging left makes them wider; the
  // sidebar is on the left, so dragging right does.
  function startDetailResize(e: React.PointerEvent) {
    startPaneResize(e, (dx) => setDetailWidth(clampDetailWidth(detailWidth - dx)))
  }
  function startLeftResize(e: React.PointerEvent) {
    startPaneResize(e, (dx) => setLeftWidth(clampLeftWidth(leftWidth + dx)))
  }
  // `onDrag` gets how far the pointer is from where the drag began.
  function startPaneResize(e: React.PointerEvent, onDrag: (dx: number) => void) {
    e.preventDefault()
    const startX = e.clientX
    const move = (ev: PointerEvent) => onDrag(ev.clientX - startX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const [selectedFolder, setSelectedFolder] = useState<string | null>(() => loadSidebarState().folder)
  // The sidebar reopens where it was left: same view, same folder.
  useEffect(() => {
    saveSidebarState({ view: leftView, treeView, folder: selectedFolder })
  }, [leftView, treeView, selectedFolder])
  // A remembered folder that's gone (moved, renamed, another collection)
  // falls back to All Tracks once the collection has loaded.
  const tracksLoaded = useCollectionStore((s) => s.tracks.length > 0)
  useEffect(() => {
    if (!tracksLoaded || !selectedFolder) return
    const { tracks } = useCollectionStore.getState()
    if (!tracks.some((t) => isInFolder(t.folder, selectedFolder))) setSelectedFolder(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracksLoaded])
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null)
  // Several checked tracks: the details of one of them would be misleading,
  // so the panel steps aside (the selection toolbar acts on them all).
  const multipleChecked = useCollectionStore((s) => s.checkedTrackIds.size > 1)
  const showDetails = !!selectedTrack && !multipleChecked
  const [tagFilter, setTagFilter] = useState<(track: Track) => boolean>(() => () => true)
  // What the Tags/Subtags view has selected, for the chip above the table,
  // and a counter the chip's × bumps to make that view clear itself.
  const [tagFilterLabel, setTagFilterLabel] = useState<string | null>(null)
  const [tagClearSignal, setTagClearSignal] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const selectPlaylist = useCollectionStore((s) => s.selectPlaylist)
  const queueUndo = useCollectionStore((s) => s.queueUndo)
  const undoQueueReplace = useCollectionStore((s) => s.undoQueueReplace)
  const dismissQueueUndo = useCollectionStore((s) => s.dismissQueueUndo)
  const playlistUndo = useCollectionStore((s) => s.playlistUndo)
  const undoPlaylistRemove = useCollectionStore((s) => s.undoPlaylistRemove)
  const dismissPlaylistUndo = useCollectionStore((s) => s.dismissPlaylistUndo)
  const [scrollToTrack, setScrollToTrack] = useState<{ trackId: number; nonce: number } | null>(null)

  // The menu bar's actions (electron/main/appMenu.ts). The ones that open
  // a dialog of the Toolbar's or the Playlists box's are handled there.
  const leftCollapsedRef = useRef(leftCollapsed)
  leftCollapsedRef.current = leftCollapsed
  useEffect(() => {
    const store = () => useCollectionStore.getState()
    const closeScreens = () => {
      store().setVisualizerOpen(false)
      store().setPlayerScreen(null)
    }
    const showScreen = (screen: 'queue' | 'fx' | 'live') => () => {
      store().setVisualizerOpen(false)
      store().setPlayerScreen(screen)
    }
    // The Playlists box isn't mounted while the sidebar is collapsed: open
    // it, then hand the command over again.
    const inPlaylistsBox = (command: MenuCommand) => () => {
      closeScreens()
      if (!leftCollapsedRef.current) return
      expandPlaylistsBoxOnNextOpen()
      leftCollapsedRef.current = false
      setLeftCollapsed(false)
      setTimeout(() => runMenuCommand(command), 50)
    }
    const handlers: Partial<Record<MenuCommand, () => void>> = {
      settings: () => {
        setStatsOpen(false)
        setSettingsOpen(true)
        setModalOpen(true)
      },
      stats: () => {
        setSettingsOpen(false)
        setStatsOpen(true)
        setModalOpen(true)
      },
      'check-for-updates': () => {
        store().showToast('Checking for updates…')
        store()
          .checkForUpdates()
          .then(() => {
            const state = store().updateState
            if (state?.status === 'up-to-date') store().showToast(`MCO ${state.currentVersion} is up to date`)
            else if (state?.status === 'disabled') store().showToast("This build doesn't update itself")
            else if (state?.status === 'error') store().showToast(state.error ?? "Couldn't check for updates")
            // An available update shows its banner.
          })
          .catch((err) => console.error('checking for updates failed', err))
      },
      'analyse-collection': () => {
        const waiting = store().tracks.filter(
          (t) => t.cloudStatus === 'local' && (t.analysisStatus === 'pending' || t.analysisStatus === 'error')
        ).length
        if (waiting === 0) return store().showToast('Every local track is analysed')
        if (!window.confirm(`Analyse ${waiting} track${waiting === 1 ? '' : 's'} now? It can take a while and can be stopped.`)) return
        store().runAnalysis().catch((err) => console.error('analysing the collection failed', err))
      },
      'stop-analysis': () => void store().stopAnalysis(),
      'play-pause': () => store().playbackControls?.toggle(),
      'next-track': () => void store().advanceToNext(),
      'shuffle-queue': () => store().shufflePlaylist(),
      'clear-queue': () => store().clearPlaylist(),
      'show-collection': closeScreens,
      'show-queue': showScreen('queue'),
      'show-fx': showScreen('fx'),
      'show-live': showScreen('live'),
      'show-visualizer': () => {
        if (store().playlist.length === 0) return store().showToast('Play a track to open the visualizer')
        store().setVisualizerOpen(true)
      },
      'toggle-sidebar': () => setLeftCollapsed(!leftCollapsedRef.current),
      'new-playlist': inPlaylistsBox('new-playlist'),
      'import-rekordbox': inPlaylistsBox('import-rekordbox'),
      // The same file as Settings → Import & export → Export to Rekordbox.
      'export-rekordbox': () => {
        window.api
          .exportRekordbox()
          .then((result) => {
            if (result) store().showToast(`Exported ${result.trackCount} tracks and ${result.playlistCount} playlists — in Rekordbox: Preferences → Advanced → Database → rekordbox xml`)
          })
          .catch((err) => store().showToast(`Export failed: ${err instanceof Error ? err.message : String(err)}`))
      },
      find: closeScreens,
      'update-collection': closeScreens,
    }
    const unsubscribes = (Object.entries(handlers) as [MenuCommand, () => void][]).map(([command, handler]) => onMenuCommand(command, handler))
    // A dialog that's open keeps the screen: nothing from the menu acts
    // behind it (Settings and Stats swap with each other).
    const offIpc = window.api.onMenuCommand((command) => {
      if (store().modalOpen && command !== 'settings' && command !== 'stats') return
      runMenuCommand(command)
    })
    return () => {
      offIpc()
      for (const off of unsubscribes) off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Shows a playlist in the table (the Playlists box, or one of the detail
  // panel's): it replaces the folder or tag selection.
  function openPlaylist(id: number): Promise<void> {
    setSelectedFolder(null)
    if (tagFilterLabel) setTagClearSignal((n) => n + 1)
    clearCheckedTracks()
    return selectPlaylist(id)
  }
  // From the detail panel: the playlist opens on the track it was opened
  // from — still selected, and scrolled into view once its songs are in.
  async function openPlaylistAtTrack(id: number, trackId: number) {
    await openPlaylist(id)
    requestAnimationFrame(() => setScrollToTrack({ trackId, nonce: Date.now() }))
  }

  // Tags/Subtags' checkbox selection is local component state that resets
  // (visually) whenever that view unmounts on a switch — but the
  // tagFilter closure it last pushed up here previously stayed applied to
  // TrackTable regardless, since nothing reset it. That looked exactly
  // like a bug: filter by a Tag, switch to Subtags, and the table stays
  // silently restricted to the old Tag's tracks while the Subtag tree
  // shows nothing checked. Switching views now always resets the filter
  // to "show everything" first — the newly-shown view then narrows it
  // again the moment the user actually picks something in it.
  // Going to or from Filters doesn't count as a switch: the folder/tag
  // view underneath keeps its selection.
  function changeLeftView(view: LeftView) {
    setLeftCollapsed(false)
    if (view === leftView) return
    setLeftView(view)
    if (view === 'filters' || view === treeView) return
    setTreeView(view)
    setTagFilter(() => () => true)
    setTagFilterLabel(null)
  }

  // Mounted once here (not inside Player, which remounts per track) so a
  // MIDI binding keeps working regardless of which track is currently
  // loaded.
  useEffect(() => {
    return subscribeToMidiCc(({ channel, controller, value, kind }) => {
      handleMidiControlChange(channel, controller, value, kind)
    })
  }, [handleMidiControlChange])

  // The siren is a global module singleton (not per-track like
  // EffectsChain) — pushing settings here, not from inside
  // Player (which remounts per track and unmounts entirely when the queue
  // is empty), keeps it in sync regardless of what's playing.
  // Subscribed outside React: a hook here would re-render the whole app
  // (track table included) on every siren knob tick.
  useEffect(() => {
    getDubSirenEngine().update(useCollectionStore.getState().effectsSettings.siren)
    return useCollectionStore.subscribe((state, previous) => {
      if (state.effectsSettings.siren !== previous.effectsSettings.siren) getDubSirenEngine().update(state.effectsSettings.siren)
    })
  }, [])

  // The chosen output device, applied once to the shared audio engine that
  // the track, the siren (and later the mic) all play through.
  useEffect(() => {
    getAudioEngine().setSinkId(audioOutputDeviceId)
  }, [audioOutputDeviceId])

  // Visual delay (ADR 0047), on the engine's visual tap.
  const visualDelayMs = useCollectionStore((s) => s.visualDelayMs)
  useEffect(() => {
    getAudioEngine().setVisualDelay(visualDelayMs / 1000)
  }, [visualDelayMs])

  // The displays the second screen can show on, kept current as they come
  // and go.
  useEffect(() => {
    const setDisplays = useCollectionStore.getState().setScreenDisplays
    window.api.getScreenDisplays().then(setDisplays)
    return window.api.onScreenDisplays(setDisplays)
  }, [])

  // The recording's level (the Rec popover's Level knob), on the engine's
  // record output.
  const recordingLevelDb = useCollectionStore((s) => s.recordingLevelDb)
  useEffect(() => {
    getAudioEngine().setRecordLevel(recordingLevelDb)
  }, [recordingLevelDb])

  // Casting: main-process status/device events, and keeping MCO's app on
  // the device in step with the effects, siren and visualizer.
  useEffect(() => initCast(), [])
  useEffect(() => initRecording(), [])
  useEffect(() => initMic(), [])
  useEffect(() => initReceiverSync(), [])
  const castPlaying = useCollectionStore((s) => s.castStatus.state === 'casting')
  const castMuteLocal = useCollectionStore((s) => s.castMuteLocal)
  // While the TV is playing (a few seconds behind), optionally silence
  // this Mac so the two don't echo — the visualizer's analyser is upstream.
  useEffect(() => {
    getAudioEngine().setLocalMuted(castPlaying && castMuteLocal)
  }, [castPlaying, castMuteLocal])

  // Hold-S keyboard trigger, mirroring the FxPanel button, and T for the
  // mic's Talk (tap to mute/unmute, hold while muted to talk). Lives here
  // (not in Player) for the same reason as the effect above — it must
  // keep working even when nothing is queued.
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      const el = target as HTMLElement
      return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el?.tagName)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (modalOpen || isTypingTarget(e.target) || e.repeat) return
      if (e.key === 't') {
        if (useCollectionStore.getState().micSettings.enabled) useCollectionStore.getState().micTalkDown()
        return
      }
      if (e.key !== 's') return
      const { siren } = useCollectionStore.getState().effectsSettings
      if (!siren.enabled || siren.beat !== 'off') return
      const engine = getDubSirenEngine()
      engine.resume()
      engine.triggerDown()
      useCollectionStore.getState().setSirenTriggered(true)
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === 't') useCollectionStore.getState().micTalkUp()
      if (e.key !== 's') return
      getDubSirenEngine().triggerUp()
      useCollectionStore.getState().setSirenTriggered(false)
    }
    // Holding S and Cmd-Tabbing away means keyup never arrives — without
    // this, the siren would sound forever behind another app.
    function handleBlur() {
      useCollectionStore.getState().micTalkUp()
      getDubSirenEngine().triggerUp()
      useCollectionStore.getState().setSirenTriggered(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [modalOpen])

  useEffect(() => {
    // The startup loader stays up until everything the first screen shows
    // (tracks/tags, folder, column layout/sort, FX) has arrived — or a
    // few seconds at most, so a slow or failed load never strands it.
    Promise.allSettled([
      loadAll(),
      loadCollectionFolder(),
      loadEffectsSettings(),
      useCollectionStore.getState().loadMicSettings(),
      loadMidiMappings(),
      loadColumnOrder(),
      loadHiddenColumns(),
      loadSortState(),
    ]).then(hideBootSplash)
    const splashTimeout = setTimeout(hideBootSplash, 8000)
    loadAudioOutputDeviceId()
    loadCueOutputDeviceId()
    loadAppVersion()
    loadUpdateState()
    loadLibrarySettings()
    const unsubscribeUpdates = window.api.onUpdateState(setUpdateState)
    const unsubscribeLibrary = window.api.onLibraryChanged((result) => {
      handleLibraryChanged(result).catch((err) => console.error('refresh after background scan failed', err))
    })
    // The background tag read (tagReader.ts): show its titles/artists as
    // they come in, and how many are left (the Filters view uses it).
    const unsubscribeTagRead = window.api.onTagReadProgress(({ remaining }) => {
      useCollectionStore.getState().setTagReadRemaining(remaining)
      refreshTracks().catch((err) => console.error('refresh after reading tags failed', err))
    })
    const unsubscribe = window.api.onScanProgress((progress) => {
      setAnalysisProgress(progress)
      const isFinal = progress.done === progress.total
      const now = Date.now()
      if (isFinal || now - lastRefreshRef.current >= 300) {
        lastRefreshRef.current = now
        refreshTracks().finally(() => {
          if (isFinal) setAnalysisProgress(null)
        })
      }
    })
    return () => {
      clearTimeout(splashTimeout)
      unsubscribe()
      unsubscribeUpdates()
      unsubscribeLibrary()
      unsubscribeTagRead()
    }
  }, [
    loadLibrarySettings,
    handleLibraryChanged,
    loadUpdateState,
    setUpdateState,
    loadAll,
    loadCollectionFolder,
    loadEffectsSettings,
    loadMidiMappings,
    loadColumnOrder,
    loadHiddenColumns,
    loadSortState,
    loadAudioOutputDeviceId,
    loadCueOutputDeviceId,
    loadAppVersion,
    setAnalysisProgress,
    refreshTracks,
  ])

  const cueTrackId = useCollectionStore((s) => s.cueTrackId)
  const cueTrack = cueTrackId != null ? (tracks.find((t) => t.id === cueTrackId) ?? null) : null
  const currentTrackId = playlist[0]
  const currentTrack = currentTrackId != null ? (tracks.find((t) => t.id === currentTrackId) ?? null) : null

  return (
    <>
      <ScanPrompt />
      <QueueDialog />
      {/* Rendered here, not inside Player, so it stays open across track
          changes (Player remounts per track). */}
      {visualizerOpen && <Visualizer track={currentTrack} onClose={() => setVisualizerOpen(false)} />}
      <SecondScreen />
      <SettingsModal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false)
          setModalOpen(false)
        }}
      />
      {statsOpen && (
        <StatsView
          onClose={() => {
            setStatsOpen(false)
            setModalOpen(false)
          }}
        />
      )}
      {queueUndo && <UndoToast message={queueUndo.message} onUndo={undoQueueReplace} onDismiss={dismissQueueUndo} />}
      {playlistUndo && (
        <UndoToast message={playlistUndo.message} onUndo={() => void undoPlaylistRemove()} onDismiss={dismissPlaylistUndo} />
      )}
      {pendingGenreDeletion && (
        <UndoToast
          message={`Deleted "${pendingGenreDeletion.snapshot.genreName}"`}
          onUndo={undoGenreDeletion}
          onDismiss={dismissGenreDeletionUndo}
        />
      )}
      {pendingSubgenreDeletion && (
        <UndoToast
          message={`Deleted "${pendingSubgenreDeletion.snapshot.subgenreName}"`}
          onUndo={undoSubgenreDeletion}
          onDismiss={dismissSubgenreDeletionUndo}
        />
      )}
      {toastMessage && <Toast message={toastMessage} />}
      <div
        className="app-layout"
        style={{
          gridTemplateRows: 'auto 1fr auto',
          gridTemplateAreas: "'toolbar toolbar toolbar' 'left center right' 'footer footer footer'",
          gridTemplateColumns: `${leftCollapsed ? `${COLLAPSED_LEFT_WIDTH}px` : `${leftWidth}px`} 1fr ${showDetails ? `${detailWidth}px` : '0px'}`,
        }}
      >
        {playerScreen && (
          <div style={{ gridRow: '1 / span 2', gridColumn: '1 / span 3', position: 'relative', zIndex: 10 }}>
            {playerScreen === 'queue' ? <PlaylistView /> : playerScreen === 'live' ? <LiveView /> : <FxView />}
          </div>
        )}

        <div style={{ gridArea: 'toolbar' }}>
          <UpdateBanner />
          <Toolbar
            onOpenSettings={() => {
              setSettingsOpen(true)
              setModalOpen(true)
            }}
            onOpenStats={() => {
              setStatsOpen(true)
              setModalOpen(true)
            }}
          />
        </div>

        {!leftCollapsed && (
          // On the sidebar's right edge, over the border.
          <div
            onPointerDown={startLeftResize}
            onDoubleClick={() => setLeftWidth(LEFT_WIDTH_DEFAULT)}
            title="Drag to resize the sidebar (double-click to reset)"
            style={{ gridArea: 'left', justifySelf: 'end', width: '7px', marginRight: '-3px', cursor: 'col-resize', zIndex: 2 }}
          />
        )}
        <div className="pane" style={{ gridArea: 'left', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* The views scroll on their own above the Playlists box. */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: leftCollapsed ? '12px 0' : '12px' }}>
          {leftCollapsed && collectionFolder && (
            // Collapsed: a thin strip of the view icons — any of them
            // reopens the sidebar on that view.
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setLeftCollapsed(false)}
                title="Expand the sidebar"
                aria-label="Expand the sidebar"
                style={{ background: 'none', border: 'none', padding: '2px', display: 'flex', color: 'var(--color-text-dim)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                  left_panel_open
                </span>
              </button>
              {LEFT_VIEWS.map((view) => (
                <button
                  key={view.key}
                  onClick={() => changeLeftView(view.key)}
                  title={view.label}
                  aria-label={view.label}
                  style={{
                    display: 'flex',
                    padding: '6px',
                    border: leftView === view.key ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    {view.icon}
                  </span>
                  {view.key === 'filters' && activeFilterCount > 0 && <FilterCountBadge count={activeFilterCount} />}
                </button>
              ))}
              <button
                onClick={() => {
                  expandPlaylistsBoxOnNextOpen()
                  setLeftCollapsed(false)
                }}
                title="Playlists"
                aria-label="Playlists"
                style={{ display: 'flex', padding: '6px', border: '1px solid var(--color-border)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  queue_music
                </span>
              </button>
            </div>
          )}
          {/* Hidden rather than unmounted while collapsed, so the trees keep
              their expanded folders and checked tags. */}
          <div style={{ display: leftCollapsed && collectionFolder ? 'none' : undefined }}>
            {!collectionFolder ? (
              <button onClick={() => pickCollectionFolder()}>Choose collection folder…</button>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', alignItems: 'center' }}>
                  {LEFT_VIEWS.map((view) => (
                    <button
                      key={view.key}
                      onClick={() => changeLeftView(view.key)}
                      title={view.label}
                      aria-label={view.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontSize: '12px',
                        padding: '4px 6px',
                        minWidth: 0,
                        overflow: 'hidden',
                        border: leftView === view.key ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                        {view.icon}
                      </span>
                      {/* Only the open view is labelled — four labels don't fit. */}
                      {leftView === view.key && view.label}
                      {view.key === 'filters' && activeFilterCount > 0 && <FilterCountBadge count={activeFilterCount} />}
                    </button>
                  ))}
                  <button
                    onClick={() => setLeftCollapsed(true)}
                    title="Collapse the sidebar"
                    aria-label="Collapse the sidebar"
                    style={{
                      marginLeft: 'auto',
                      flexShrink: 0,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      display: 'flex',
                      color: 'var(--color-text-dim)',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      left_panel_close
                    </span>
                  </button>
                </div>
                {leftView === 'filters' && <FiltersPanel />}
                {treeView === 'folders' && (
                  <div hidden={leftView !== 'folders'}>
                    <FolderTree
                      rootPath={collectionFolder}
                      selectedFolder={selectedFolder}
                      onSelect={(folder) => {
                        setSelectedFolder(folder)
                        void selectPlaylist(null)
                        clearCheckedTracks()
                      }}
                    />
                  </div>
                )}
                {treeView === 'tags' && (
                  <div hidden={leftView !== 'tags'}>
                    <TagTree
                      clearSignal={tagClearSignal}
                      onFilterChange={(filter, label) => {
                        setTagFilter(() => filter)
                        setTagFilterLabel(label)
                        if (label) void selectPlaylist(null)
                        clearCheckedTracks()
                      }}
                    />
                  </div>
                )}
                {treeView === 'subtags' && (
                  <div hidden={leftView !== 'subtags'}>
                    <SubtagTree
                      clearSignal={tagClearSignal}
                      onFilterChange={(filter, label) => {
                        setTagFilter(() => filter)
                        setTagFilterLabel(label)
                        if (label) void selectPlaylist(null)
                        clearCheckedTracks()
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
          </div>
          {collectionFolder && !leftCollapsed && (
            <PlaylistsBox onSelectPlaylist={(id) => void openPlaylist(id)} />
          )}
        </div>

        <div className="pane" style={{ gridArea: 'center', display: 'flex', flexDirection: 'column' }}>
          <TrackTable
            onSelect={setSelectedTrack}
            selectedFolder={selectedFolder}
            activeFilter={tagFilter}
            selectedTrackId={selectedTrack?.id ?? null}
            scrollToTrack={scrollToTrack}
            tagFilterChip={tagFilterLabel ? { icon: treeView === 'subtags' ? 'label' : 'sell', label: tagFilterLabel } : null}
            onClearTagFilter={() => setTagClearSignal((n) => n + 1)}
            onClearFolder={() => {
              setSelectedFolder(null)
              clearCheckedTracks()
            }}
            onShowInFolderTree={(folder) => {
              changeLeftView('folders')
              setSelectedFolder(folder)
            }}
          />
        </div>

        {showDetails && (
          // On the panel's left edge, over the border; a double-click goes
          // back to the usual width.
          <div
            onPointerDown={startDetailResize}
            onDoubleClick={() => setDetailWidth(DETAIL_WIDTH_DEFAULT)}
            title="Drag to resize the details (double-click to reset)"
            style={{ gridArea: 'right', justifySelf: 'start', width: '7px', marginLeft: '-3px', cursor: 'col-resize', zIndex: 2 }}
          />
        )}
        <div className="pane" style={{ gridArea: 'right', borderRight: 'none', overflowX: 'hidden' }}>
          <DetailPanel
            track={showDetails ? selectedTrack : null}
            onClose={() => setSelectedTrack(null)}
            onLocateInTable={(trackId) => setScrollToTrack({ trackId, nonce: Date.now() })}
            onSelectPlaylist={(id) => {
              if (selectedTrack) void openPlaylistAtTrack(id, selectedTrack.id)
            }}
            onSelectTrack={setSelectedTrack}
          />
        </div>

        <div style={{ gridArea: 'footer', borderTop: '1px solid var(--color-border)', position: 'relative' }}>
          {/* Always present, so the pre-listen bar comes and goes inside it
              rather than being inserted next to the keyed Player below —
              with the Player there, React left a closed bar on screen. */}
          <div>{cueTrack && <CuePlayer key={cueTrack.id} track={cueTrack} />}</div>
          {(() => {
            // Driven by the playlist queue's head, not row selection — the
            // player is independent, so browsing/checking details on other
            // tracks (which only updates selectedTrack, below) doesn't
            // interrupt playback. Re-derived from the live tracks array on
            // every render so BPM/waveform reflect an analysis that
            // completes after playback started. key forces a full remount
            // when the current track changes — otherwise the playing/
            // progress state (and the underlying <audio> element) carries
            // over from the previous track instead of resetting.
            return currentTrack ? (
              <Player
                key={currentTrack.id}
                track={currentTrack}
                onShowDetails={setSelectedTrack}
                onFilterByArtist={(artist) => {
                  // Search the whole collection, not just whichever
                  // folder happens to be selected in the tree.
                  setSelectedFolder(null)
                  setSearchText(artist)
                }}
              />
            ) : (
              <EmptyPlayer />
            )
          })()}
          {analysisProgress && (
            // Floats just above the footer (over the bottom of the panes)
            // instead of sitting in its flow — otherwise the player bar
            // jumps every time an analysis run starts or finishes.
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                right: 0,
                zIndex: 20,
                boxShadow: '0 -4px 12px rgba(0,0,0,0.3)',
              }}
            >
              <AnalysisProgressBar progress={analysisProgress} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
