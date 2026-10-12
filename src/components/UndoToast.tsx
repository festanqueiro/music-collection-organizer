// src/components/UndoToast.tsx
// Where the Undo toasts go, one above the other: two at once (a Tag
// deleted, then songs removed from a playlist) used to sit on the same
// spot, and Undo undid whichever was on top.
export function UndoToasts({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        zIndex: 30,
      }}
    >
      {children}
    </div>
  )
}

export function UndoToast({
  message,
  onUndo,
  onDismiss,
}: {
  message: string
  onUndo: () => void
  onDismiss: () => void
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{message}</span>
      <button onClick={onUndo}>Undo</button>
      <button onClick={onDismiss}>
        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
          close
        </span>
      </button>
    </div>
  )
}
