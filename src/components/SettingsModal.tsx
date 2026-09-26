// Settings: a sidebar of pages on the left, the chosen page on the right.
// Each page is its own component in ./settings/, built from the shared
// blocks in ./settings/ui.tsx.
import { useEffect, useState } from 'react'
import { LibraryPage } from './settings/LibraryPage'
import { AppearancePage } from './settings/AppearancePage'
import { AudioPage } from './settings/AudioPage'
import { MidiPage } from './settings/MidiPage'
import { TransferPage } from './settings/TransferPage'
import { DataPage } from './settings/DataPage'
import { UpdatesPage } from './settings/UpdatesPage'

type SettingsPage = 'library' | 'appearance' | 'audio' | 'midi' | 'transfer' | 'data' | 'updates'

const PAGES: { key: SettingsPage; label: string; icon: string }[] = [
  { key: 'library', label: 'Library', icon: 'library_music' },
  { key: 'appearance', label: 'Appearance', icon: 'palette' },
  { key: 'audio', label: 'Audio', icon: 'speaker' },
  { key: 'midi', label: 'MIDI', icon: 'piano' },
  { key: 'transfer', label: 'Import & export', icon: 'swap_horiz' },
  { key: 'data', label: 'Backups & data', icon: 'backup' },
  { key: 'updates', label: 'Updates', icon: 'system_update' },
]

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Kept while the modal is closed, so it reopens on the same page.
  const [page, setPage] = useState<SettingsPage>('library')

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: '10px',
          width: 'min(760px, calc(100vw - 48px))',
          height: 'min(560px, calc(100vh - 48px))',
          display: 'flex',
          overflow: 'hidden',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.35)',
        }}
      >
        <nav
          style={{
            width: '190px',
            flexShrink: 0,
            padding: '16px 10px',
            background: 'var(--color-surface)',
            borderRight: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          <h2 style={{ margin: '0 8px 12px', fontSize: '14px' }}>Settings</h2>
          {PAGES.map((item) => {
            const active = item.key === page
            return (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '7px 8px',
                  textAlign: 'left',
                  border: 'none',
                  borderRadius: '6px',
                  background: active ? 'var(--color-selected)' : 'none',
                  color: active ? 'var(--color-accent)' : 'var(--color-text)',
                  fontWeight: active ? 500 : 400,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            )
          })}
        </nav>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 10px 0', flexShrink: 0 }}>
            <button onClick={onClose} title="Close (Esc)" style={{ background: 'none', border: 'none' }}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 24px 24px' }}>
            {page === 'library' && <LibraryPage onClose={onClose} />}
            {page === 'appearance' && <AppearancePage />}
            {page === 'audio' && <AudioPage />}
            {page === 'midi' && <MidiPage />}
            {page === 'transfer' && <TransferPage />}
            {page === 'data' && <DataPage />}
            {page === 'updates' && <UpdatesPage />}
          </div>
        </div>
      </div>
    </div>
  )
}
