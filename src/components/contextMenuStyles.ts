// Shared look for right-click menus (the track table, queue view, folder
// tree and tag tree). CONTEXT_MENU_Z_INDEX keeps them above everything that
// floats over the panes — the analysis progress bar (z-index 20) included.
export const CONTEXT_MENU_Z_INDEX = 100

export const contextMenuStyle = {
  position: 'fixed' as const,
  background: 'var(--color-surface-raised)',
  border: '1px solid var(--color-border)',
  borderRadius: '6px',
  padding: '4px',
  zIndex: CONTEXT_MENU_Z_INDEX,
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
