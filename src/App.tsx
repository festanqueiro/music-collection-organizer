import { useEffect } from 'react'
import { useCollectionStore } from './state/store'

export default function App() {
  const loadAll = useCollectionStore((s) => s.loadAll)

  useEffect(() => {
    loadAll()
  }, [loadAll])

  return (
    <div className="app-layout">
      <div className="pane">Left pane (Task 19/20)</div>
      <div className="pane">Center pane (Task 18/19)</div>
      <div className="pane">Right pane (Task 21)</div>
    </div>
  )
}
