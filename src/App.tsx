import { useEffect, useRef, useState } from 'react'
import { useCollectionStore } from './state/store'
import { Toolbar } from './components/Toolbar'
import { ScanPrompt } from './components/ScanPrompt'
import { FolderTree } from './components/FolderTree'
import { TagTree } from './components/TagTree'
import { TrackTable } from './components/TrackTable'
import { BatchTagBar } from './components/BatchTagBar'
import { DetailPanel } from './components/DetailPanel'
import { AnalysisProgressBar } from './components/AnalysisProgressBar'
import { SettingsModal } from './components/SettingsModal'
import type { Track } from './types'

type LeftView = 'folders' | 'tags'

export default function App() {
  const loadAll = useCollectionStore((s) => s.loadAll)
  const collectionFolder = useCollectionStore((s) => s.collectionFolder)
  const loadCollectionFolder = useCollectionStore((s) => s.loadCollectionFolder)
  const pickCollectionFolder = useCollectionStore((s) => s.pickCollectionFolder)
  const analysisProgress = useCollectionStore((s) => s.analysisProgress)
  const setAnalysisProgress = useCollectionStore((s) => s.setAnalysisProgress)
  const refreshTracks = useCollectionStore((s) => s.refreshTracks)
  const lastRefreshRef = useRef(0)
  const [leftView, setLeftView] = useState<LeftView>('folders')
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null)
  const [tagFilter, setTagFilter] = useState<(track: Track) => boolean>(() => () => true)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    loadAll()
    loadCollectionFolder()
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
  }, [loadAll, loadCollectionFolder, setAnalysisProgress, refreshTracks])

  return (
    <>
      <ScanPrompt />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <div
        className="app-layout"
        style={{
          gridTemplateRows: 'auto 1fr auto',
          gridTemplateAreas: "'toolbar toolbar toolbar' 'left center right' 'footer footer footer'",
        }}
      >
        <div style={{ gridArea: 'toolbar' }}>
          <Toolbar onOpenSettings={() => setSettingsOpen(true)} />
        </div>

        <div className="pane" style={{ gridArea: 'left', padding: '12px' }}>
          {!collectionFolder ? (
            <button onClick={() => pickCollectionFolder()}>Choose collection folder…</button>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button onClick={() => setLeftView('folders')} disabled={leftView === 'folders'}>
                  Folders
                </button>
                <button onClick={() => setLeftView('tags')} disabled={leftView === 'tags'}>
                  Tags
                </button>
              </div>
              {leftView === 'folders' ? (
                <FolderTree rootPath={collectionFolder} onSelect={setSelectedFolder} />
              ) : (
                <TagTree onFilterChange={(filter) => setTagFilter(() => filter)} />
              )}
            </>
          )}
        </div>

        <div className="pane" style={{ gridArea: 'center' }}>
          <BatchTagBar />
          <TrackTable onSelect={setSelectedTrack} selectedFolder={selectedFolder} activeFilter={tagFilter} />
        </div>

        <div className="pane" style={{ gridArea: 'right', borderRight: 'none' }}>
          <DetailPanel track={selectedTrack} />
        </div>

        {analysisProgress && (
          <div style={{ gridArea: 'footer' }}>
            <AnalysisProgressBar progress={analysisProgress} />
          </div>
        )}
      </div>
    </>
  )
}
