export function AnalysisProgressBar({ progress }: { progress: { done: number; total: number } }) {
  const percent = progress.total > 0 ? (progress.done / progress.total) * 100 : 0

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
      <div>
        Analyzing {progress.done} of {progress.total}…
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
