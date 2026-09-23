// Shared look for right-click menus (TrackTable's track menu, the queue
// view's entry menu).
export const contextMenuStyle = {
  position: 'fixed' as const,
  background: 'var(--color-surface-raised)',
  border: '1px solid var(--color-border)',
  borderRadius: '6px',
  padding: '4px',
  zIndex: 20,
}

export const contextMenuItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  width: '100%',
  textAlign: 'left' as const,
  background: 'none',
  border: 'none',
  padding: '4px 8px',
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
}

export const contextMenuIconStyle = { fontSize: '16px' }
