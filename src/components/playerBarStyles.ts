// The player bar's view/output buttons (PlayerScreenButtons, CastButton).
import type { CSSProperties } from 'react'

// Shared by every button in the group (CastButton too).
export function barButtonStyle(open: boolean, lit = false): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    fontSize: '12px',
    flexShrink: 0,
    border: open ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
    background: open ? 'var(--color-selected)' : 'var(--color-surface-raised)',
    color: open || lit ? 'var(--color-accent)' : 'var(--color-text)',
  }
}

// A button in one of the player bar's joined groups (`.bar-group` in
// theme.css gives the shape): an icon, its name in the tooltip. Only what
// changes with its state is set here.
export function barIconButtonStyle(open: boolean, lit = false): CSSProperties {
  return {
    color: open || lit ? 'var(--color-accent)' : undefined,
    background: open ? 'var(--color-selected)' : undefined,
  }
}
