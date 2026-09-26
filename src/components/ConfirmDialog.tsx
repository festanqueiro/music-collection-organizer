// src/components/ConfirmDialog.tsx
import { useEffect, type ReactNode } from 'react'

// Generic confirmation popup for destructive actions. Cancel is the
// focused default (so a stray Enter doesn't confirm), Esc and clicking
// the backdrop cancel. Esc is handled in the capture phase and stopped
// there, so a parent modal's own Esc-to-close (e.g. SettingsModal)
// doesn't also fire underneath it.
export function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Confirm',
  icon = 'warning',
  onConfirm,
  onCancel,
}: {
  title: string
  children: ReactNode
  confirmLabel?: string
  icon?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onCancel()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onCancel])

  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        onCancel()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 40,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '20px 24px',
          width: '400px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-secondary)' }}>
            {icon}
          </span>
          {title}
        </h3>
        <div style={{ color: 'var(--color-text-dim)', lineHeight: 1.5 }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
          <button onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: 'var(--color-secondary)',
              color: 'var(--color-on-accent)',
              border: '1px solid var(--color-secondary)',
              fontWeight: 500,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
