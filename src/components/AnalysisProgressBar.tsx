import { useCollectionStore } from '../state/store'

export function AnalysisProgressBar({ progress }: { progress: { done: number; total: number } }) {
  const percent = progress.total > 0 ? (progress.done / progress.total) * 100 : 0
  const stopAnalysis = useCollectionStore((s) => s.stopAnalysis)
  // `done` counts completed tracks, so a fresh single-track run reports
  // {done: 0, total: 1} — technically correct, but "Analyzing 0 of 1"
  // reads like nothing is happening. The label shows which track is
  // currently being worked on (1-indexed), not how many have finished.
  const current = Math.min(progress.done + 1, progress.total)

  return (
    <div
      style={{
        padding: '8px 16px',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        fontSize: '12px',
        color: 'var(--color-text-dim)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>
          Analyzing {current} of {progress.total}…
        </span>
        <button onClick={() => stopAnalysis()} style={{ padding: '2px 8px' }}>
          Stop
        </button>
      </div>
      <div
        style={{
          marginTop: '4px',
          height: '4px',
          background: 'var(--color-border)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            background: 'var(--color-accent)',
            transition: 'width 150ms ease',
          }}
        />
      </div>
    </div>
  )
}
