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
import { Visualizer } from './components/Visualizer'
import { QueueDialog } from './components/QueueDialog'
import { AnalysisProgressBar } from './components/AnalysisProgressBar'
import { SettingsModal } from './components/SettingsModal'
import { UndoToast } from './components/UndoToast'
import { Toast } from './components/Toast'
import { subscribeToMidiCc } from './audio/midi'
import { getDubSirenEngine } from './audio/sirenEngine'
import { initCast } from './cast/castSession'
import { initReceiverSync } from './cast/receiverSync'
import type { Track } from './types'

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

export default function App() {
  const loadAll = useCollectionStore((s) => s.loadAll)
  const tracks = useCollectionStore((s) => s.tracks)
  const collectionFolder = useCollectionStore((s) => s.collectionFolder)
  const loadCollectionFolder = useCollectionStore((s) => s.loadCollectionFolder)
  const loadEffectsSettings = useCollectionStore((s) => s.loadEffectsSettings)
  const loadMidiMappings = useCollectionStore((s) => s.loadMidiMappings)
  const loadColumnOrder = useCollectionStore((s) => s.loadColumnOrder)
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
  const [leftView, setLeftView] = useState<LeftView>(() => loadSidebarState().view)
  // The folder/tag view the Filters view was opened from: kept mounted
  // (hidden) meanwhile, with its selection still applied — filters combine
  // with it rather than replacing it.
  const [treeView, setTreeView] = useState<TreeView>(() => loadSidebarState().treeView)
  const activeFilterCount = useCollectionStore(
    (s) =>
      Number(s.compatibleFilter) + Number(s.analysedFilter !== 'all') + Number(s.duplicatesFilter) + Number(s.untaggedFilter)
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
    if (!tracks.some((t) => t.folder === selectedFolder || t.folder.startsWith(selectedFolder + '/'))) setSelectedFolder(null)
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
  const [scrollToTrack, setScrollToTrack] = useState<{ trackId: number; nonce: number } | null>(null)

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

  // The siren is a global module singleton (its own AudioContext, not
  // per-track like EffectsChain) — pushing settings here, not from inside
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

  // Same reasoning as above — the siren is its own separate AudioContext,
  // so the chosen output device has to be applied to it independently of
  // whatever Player.tsx's EffectsChain is doing for the current track.
  useEffect(() => {
    getDubSirenEngine().setSinkId(audioOutputDeviceId)
  }, [audioOutputDeviceId])

  // Casting: main-process status/device events, and keeping MCO's app on
  // the device in step with the effects, siren and visualizer.
  useEffect(() => initCast(), [])
  useEffect(() => initReceiverSync(), [])
  const castPlaying = useCollectionStore((s) => s.castStatus.state === 'casting')
  const castMuteLocal = useCollectionStore((s) => s.castMuteLocal)
  useEffect(() => {
    getDubSirenEngine().setLocalMuted(castPlaying && castMuteLocal)
  }, [castPlaying, castMuteLocal])

  // Hold-S keyboard trigger, mirroring the FxPanel button. Lives here
  // (not in Player) for the same reason as the effect above — it must
  // keep working even when nothing is queued.
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      const el = target as HTMLElement
      return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el?.tagName)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (modalOpen || isTypingTarget(e.target) || e.key !== 's' || e.repeat) return
      const { siren } = useCollectionStore.getState().effectsSettings
      if (!siren.enabled || siren.beat !== 'off') return
      const engine = getDubSirenEngine()
      engine.resume()
      engine.triggerDown()
      useCollectionStore.getState().setSirenTriggered(true)
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.key !== 's') return
      getDubSirenEngine().triggerUp()
      useCollectionStore.getState().setSirenTriggered(false)
    }
    // Holding S and Cmd-Tabbing away means keyup never arrives — without
    // this, the siren would sound forever behind another app.
    function handleBlur() {
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
      loadMidiMappings(),
      loadColumnOrder(),
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
      <SettingsModal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false)
          setModalOpen(false)
        }}
      />
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
          gridTemplateColumns: `${leftCollapsed ? `${COLLAPSED_LEFT_WIDTH}px` : '260px'} 1fr ${showDetails ? '320px' : '0px'}`,
        }}
      >
        {playerScreen && (
          <div style={{ gridRow: '1 / span 2', gridColumn: '1 / span 3', position: 'relative', zIndex: 10 }}>
            {playerScreen === 'queue' ? <PlaylistView /> : <FxView />}
          </div>
        )}

        <div style={{ gridArea: 'toolbar' }}>
          <UpdateBanner />
          <Toolbar
            onOpenSettings={() => {
              setSettingsOpen(true)
              setModalOpen(true)
            }}
          />
        </div>

        <div className="pane" style={{ gridArea: 'left', padding: leftCollapsed ? '12px 0' : '12px', overflowX: 'hidden' }}>
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
                        clearCheckedTracks()
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
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

        <div className="pane" style={{ gridArea: 'right', borderRight: 'none', overflowX: 'hidden' }}>
          <DetailPanel
            track={showDetails ? selectedTrack : null}
            onClose={() => setSelectedTrack(null)}
            onLocateInTable={(trackId) => setScrollToTrack({ trackId, nonce: Date.now() })}
          />
        </div>

        <div style={{ gridArea: 'footer', borderTop: '1px solid var(--color-border)', position: 'relative' }}>
          {cueTrack && <CuePlayer key={cueTrack.id} track={cueTrack} />}
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
