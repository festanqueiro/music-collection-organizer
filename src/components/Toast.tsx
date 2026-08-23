// src/components/Toast.tsx
// Brief, auto-dismissing confirmation for a bulk action — see store.ts's
// showToast for why this exists (bulk actions otherwise give zero visual
// feedback that the click registered).
export function Toast({ message }: { message: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        // Offset above UndoToast's own bottom:16px so a bulk-action toast
        // and a pending tag-deletion undo can never visually overlap if
        // both happen to be showing at once.
        bottom: '64px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '10px 16px',
        zIndex: 30,
      }}
    >
      {message}
    </div>
  )
}
