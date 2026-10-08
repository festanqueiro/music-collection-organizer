// src/components/detail/DetailSection.tsx
// One section of the track details, and whether it's open.
import { useState, type ReactNode } from 'react'
import { writeStored } from '../../state/stored'

// Whether a section of the details is open, remembered between sessions
// (a per-viewer convenience, so localStorage). Every section starts open.
export function loadFlag(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === 'true'
  } catch {
    return fallback
  }
}
export function saveFlag(key: string, value: boolean): void {
  writeStored(key, String(value))
}
type SectionId = 'cover' | 'tags' | 'id3' | 'playlists' | 'similar' | 'file'
export function useSectionOpen(id: SectionId): [boolean, () => void] {
  const key = `detailSection.${id}`
  const [open, setOpen] = useState(() => loadFlag(key, true))
  return [
    open,
    () => {
      saveFlag(key, !open)
      setOpen(!open)
    },
  ]
}

// One section of the details: a header that opens and closes it (the whole
// row is the button), an optional count, and controls on the right that
// only show while it is open.
export function DetailSection({
  title,
  count,
  open,
  onToggle,
  actions,
  children,
}: {
  title: string
  count?: number
  open: boolean
  onToggle: () => void
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section style={{ marginTop: '12px', borderTop: '1px solid var(--color-border)', paddingTop: '6px', fontSize: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '24px' }}>
        <button
          onClick={onToggle}
          aria-expanded={open}
          title={open ? `Hide ${title}` : `Show ${title}`}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'none',
            border: 'none',
            padding: '2px 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            textAlign: 'left',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--color-text)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-text-dim)' }}>
            {open ? 'expand_more' : 'chevron_right'}
          </span>
          {title}
          {count !== undefined && count > 0 && (
            <span style={{ fontWeight: 400, color: 'var(--color-text-dim)', marginLeft: '4px' }}>{count}</span>
          )}
        </button>
        {open && actions}
      </div>
      {open && <div style={{ marginTop: '4px' }}>{children}</div>}
    </section>
  )
}
