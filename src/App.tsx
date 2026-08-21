import { useEffect, useRef, useState } from 'react'
import { useCollectionStore } from './state/store'
import { Toolbar } from './components/Toolbar'
import { ScanPrompt } from './components/ScanPrompt'
import { FolderTree } from './components/FolderTree'
import { TagTree } from './components/TagTree'
import { TrackTable } from './components/TrackTable'
import { BatchTagBar } from './components/BatchTagBar'
import { DetailPanel } from './components/DetailPanel'
import { Player } from './components/Player'
import { PlaylistView } from './components/PlaylistView'
import { AnalysisProgressBar } from './components/AnalysisProgressBar'
import { SettingsModal } from './components/SettingsModal'
import { UndoToast } from './components/UndoToast'
import { subscribeToMidiCc } from './audio/midi'
import { getDubSirenEngine } from './audio/sirenEngine'
import type { Track } from './types'

type LeftView = 'folders' | 'tags'

export default function App() {
  const loadAll = useCollectionStore((s) => s.loadAll)
  const tracks = useCollectionStore((s) => s.tracks)
  const collectionFolder = useCollectionStore((s) => s.collectionFolder)
  const loadCollectionFolder = useCollectionStore((s) => s.loadCollectionFolder)
  const loadEffectsSettings = useCollectionStore((s) => s.loadEffectsSettings)
  const loadMidiMappings = useCollectionStore((s) => s.loadMidiMappings)
  const loadAppVersion = useCollectionStore((s) => s.loadAppVersion)
  const handleMidiControlChange = useCollectionStore((s) => s.handleMidiControlChange)
  const pickCollectionFolder = useCollectionStore((s) => s.pickCollectionFolder)
  const analysisProgress = useCollectionStore((s) => s.analysisProgress)
  const setAnalysisProgress = useCollectionStore((s) => s.setAnalysisProgress)
  const refreshTracks = useCollectionStore((s) => s.refreshTracks)
  const pendingGenreDeletion = useCollectionStore((s) => s.pendingGenreDeletion)
  const undoGenreDeletion = useCollectionStore((s) => s.undoGenreDeletion)
  const dismissGenreDeletionUndo = useCollectionStore((s) => s.dismissGenreDeletionUndo)
  const clearCheckedTracks = useCollectionStore((s) => s.clearCheckedTracks)
  const setModalOpen = useCollectionStore((s) => s.setModalOpen)
  const playlist = useCollectionStore((s) => s.playlist)
  const playerExpanded = useCollectionStore((s) => s.playerExpanded)
  const effectsSettings = useCollectionStore((s) => s.effectsSettings)
  const modalOpen = useCollectionStore((s) => s.modalOpen)
  const lastRefreshRef = useRef(0)
  const [leftView, setLeftView] = useState<LeftView>('folders')
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null)
  const [tagFilter, setTagFilter] = useState<(track: Track) => boolean>(() => () => true)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
  useEffect(() => {
    getDubSirenEngine().update(effectsSettings.siren)
  }, [effectsSettings.siren])

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
    loadAll()
    loadCollectionFolder()
    loadEffectsSettings()
    loadMidiMappings()
    loadAppVersion()
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
    return unsubscribe
  }, [
    loadAll,
    loadCollectionFolder,
    loadEffectsSettings,
    loadMidiMappings,
    loadAppVersion,
    setAnalysisProgress,
    refreshTracks,
  ])

  return (
    <>
      <ScanPrompt />
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
      <div
        className="app-layout"
        style={{
          gridTemplateRows: 'auto 1fr auto',
          gridTemplateAreas: "'toolbar toolbar toolbar' 'left center right' 'footer footer footer'",
          gridTemplateColumns: selectedTrack ? undefined : '260px 1fr 0px',
        }}
      >
        {playerExpanded && (
          <div style={{ gridRow: '1 / span 2', gridColumn: '1 / span 3', position: 'relative', zIndex: 10 }}>
            <PlaylistView />
          </div>
        )}

        <div style={{ gridArea: 'toolbar' }}>
          <Toolbar
            onOpenSettings={() => {
              setSettingsOpen(true)
              setModalOpen(true)
            }}
          />
        </div>

        <div className="pane" style={{ gridArea: 'left', padding: '12px' }}>
          {!collectionFolder ? (
            <button onClick={() => pickCollectionFolder()}>Choose collection folder…</button>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  onClick={() => setLeftView('folders')}
                  style={{
                    border: leftView === 'folders' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                  }}
                >
                  Folders
                </button>
                <button
                  onClick={() => setLeftView('tags')}
                  style={{
                    border: leftView === 'tags' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                  }}
                >
                  Tags
                </button>
              </div>
              {leftView === 'folders' ? (
                <FolderTree
                  rootPath={collectionFolder}
                  selectedFolder={selectedFolder}
                  onSelect={(folder) => {
                    setSelectedFolder(folder)
                    clearCheckedTracks()
                  }}
                />
              ) : (
                <TagTree
                  onFilterChange={(filter) => {
                    setTagFilter(() => filter)
                    clearCheckedTracks()
                  }}
                />
              )}
            </>
          )}
        </div>

        <div className="pane" style={{ gridArea: 'center' }}>
          <BatchTagBar />
          <TrackTable
            onSelect={setSelectedTrack}
            selectedFolder={selectedFolder}
            activeFilter={tagFilter}
            selectedTrackId={selectedTrack?.id ?? null}
          />
        </div>

        <div className="pane" style={{ gridArea: 'right', borderRight: 'none', overflowX: 'hidden' }}>
          <DetailPanel track={selectedTrack} onClose={() => setSelectedTrack(null)} />
        </div>

        <div style={{ gridArea: 'footer', borderTop: '1px solid var(--color-border)' }}>
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
            const currentTrackId = playlist[0]
            const currentTrack = currentTrackId != null ? tracks.find((t) => t.id === currentTrackId) : null
            return currentTrack ? (
              <Player key={currentTrack.id} track={currentTrack} />
            ) : (
              <div style={{ padding: '16px', color: 'var(--color-text-dim)' }}>Nothing queued</div>
            )
          })()}
          {analysisProgress && <AnalysisProgressBar progress={analysisProgress} />}
        </div>
      </div>
    </>
  )
}
