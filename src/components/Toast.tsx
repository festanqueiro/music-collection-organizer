// src/components/Toast.tsx
// Brief, auto-dismissing confirmation for a bulk action — see store.ts's
// showToast for why this exists (bulk actions otherwise give zero visual
// feedback that the click registered).
export function Toast({ message }: { message: string }) {
  return (
    <div
      style={{
        // Placed by UndoToasts (UndoToast.tsx), above any Undo showing, so
        // the two never overlap.
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '10px 16px',
      }}
    >
      {message}
    </div>
  )
}
