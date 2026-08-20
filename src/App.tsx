import { useEffect } from 'react'
import { useCollectionStore } from './state/store'
import { Toolbar } from './components/Toolbar'
import { ScanPrompt } from './components/ScanPrompt'

export default function App() {
  const loadAll = useCollectionStore((s) => s.loadAll)

  useEffect(() => {
    loadAll()
  }, [loadAll])

  return (
    <>
      <ScanPrompt />
      <div className="app-layout" style={{ gridTemplateRows: 'auto 1fr', gridTemplateAreas: "'toolbar toolbar toolbar' 'left center right'" }}>
        <div style={{ gridArea: 'toolbar' }}>
          <Toolbar />
        </div>
        <div className="pane">Left pane (Task 19/20)</div>
        <div className="pane">Center pane (Task 19)</div>
        <div className="pane">Right pane (Task 21)</div>
      </div>
    </>
  )
}
