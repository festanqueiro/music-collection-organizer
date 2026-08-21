import { useEffect, useState } from 'react'
import { useCollectionStore } from '../state/store'
import type { BackupInfo } from '../types'

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const collectionFolder = useCollectionStore((s) => s.collectionFolder)
  const pickCollectionFolder = useCollectionStore((s) => s.pickCollectionFolder)
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null)

  useEffect(() => {
    if (open) {
      window.api.getBackupInfo().then(setBackupInfo)
    }
  }, [open])

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
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '24px',
          minWidth: '360px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0 }}>Settings</h2>
          <button onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <section style={{ marginBottom: '20px' }}>
          <h3 style={{ color: 'var(--color-text-dim)', margin: '0 0 8px' }}>Collection folder</h3>
          <p style={{ margin: '0 0 8px', wordBreak: 'break-all' }}>{collectionFolder ?? 'Not set'}</p>
          <button
            onClick={async () => {
              const changed = await pickCollectionFolder()
              if (changed) onClose()
            }}
          >
            Change…
          </button>
        </section>

        <section>
          <h3 style={{ color: 'var(--color-text-dim)', margin: '0 0 8px' }}>Backups</h3>
          {backupInfo ? (
            <>
              <p style={{ margin: '0 0 4px', wordBreak: 'break-all' }}>{backupInfo.backupFolder}</p>
              <p style={{ margin: 0, color: 'var(--color-text-dim)', fontSize: '12px' }}>
                Last backup:{' '}
                {backupInfo.lastBackupAt ? new Date(backupInfo.lastBackupAt).toLocaleString() : 'Never yet'}
              </p>
              {backupInfo.lastBackupError && (
                <p style={{ margin: '4px 0 0', color: 'var(--color-secondary)', fontSize: '12px' }}>
                  ⚠ Last backup failed: {backupInfo.lastBackupError}
                </p>
              )}
            </>
          ) : (
            <p style={{ margin: 0, color: 'var(--color-text-dim)' }}>Loading…</p>
          )}
        </section>
      </div>
    </div>
  )
}
