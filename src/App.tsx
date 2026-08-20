import { useEffect, useState } from 'react'
import { useCollectionStore } from './state/store'
import { Toolbar } from './components/Toolbar'
import { ScanPrompt } from './components/ScanPrompt'
import { FolderTree } from './components/FolderTree'
import { TagTree } from './components/TagTree'
import { TrackTable } from './components/TrackTable'
import { DetailPanel } from './components/DetailPanel'
import type { Track } from './types'

type LeftView = 'folders' | 'tags'

export default function App() {
  const loadAll = useCollectionStore((s) => s.loadAll)
  const collectionFolder = useCollectionStore((s) => s.collectionFolder)
  const loadCollectionFolder = useCollectionStore((s) => s.loadCollectionFolder)
  const pickCollectionFolder = useCollectionStore((s) => s.pickCollectionFolder)
  const [leftView, setLeftView] = useState<LeftView>('folders')
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null)
  const [tagFilter, setTagFilter] = useState<(track: Track) => boolean>(() => () => true)

  useEffect(() => {
    loadAll()
    loadCollectionFolder()
    const unsubscribe = window.api.onScanProgress(() => {
      loadAll()
    })
    return unsubscribe
  }, [loadAll, loadCollectionFolder])

  return (
    <>
      <ScanPrompt />
      <div
        className="app-layout"
        style={{
          gridTemplateRows: 'auto 1fr',
          gridTemplateAreas: "'toolbar toolbar toolbar' 'left center right'",
        }}
      >
        <div style={{ gridArea: 'toolbar' }}>
          <Toolbar />
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
          <TrackTable onSelect={setSelectedTrack} selectedFolder={selectedFolder} activeFilter={tagFilter} />
        </div>

        <div className="pane" style={{ gridArea: 'right' }}>
          <DetailPanel track={selectedTrack} />
        </div>
      </div>
    </>
  )
}
