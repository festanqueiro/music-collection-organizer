import { useEffect, useState } from 'react'
import { useCollectionStore } from '../state/store'
import type { BackupInfo, BackupEntry } from '../types'

// Backup filenames use `now.toISOString().replace(/[:.]/g, '-')` (see
// electron/main/backup.ts) — undo that by re-inserting the standard ISO
// separators positionally rather than trying to regex-guess which dashes
// were colons. Format: YYYY-MM-DDTHH-MM-SS-mmmZ (24 chars incl. Z).
function parseBackupTimestamp(timestamp: string): Date {
  const iso = `${timestamp.slice(0, 13)}:${timestamp.slice(14, 16)}:${timestamp.slice(17, 19)}.${timestamp.slice(20, 23)}Z`
  return new Date(iso)
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const collectionFolder = useCollectionStore((s) => s.collectionFolder)
  const pickCollectionFolder = useCollectionStore((s) => s.pickCollectionFolder)
  const exportTagData = useCollectionStore((s) => s.exportTagData)
  const importTagData = useCollectionStore((s) => s.importTagData)
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null)
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [tagDataMessage, setTagDataMessage] = useState<string | null>(null)
  const [dbFilePath, setDbFilePath] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      window.api.getBackupInfo().then(setBackupInfo)
      window.api.listBackups().then(setBackups)
      window.api.getDbFilePath().then(setDbFilePath)
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

        <section style={{ marginBottom: '20px' }}>
          <h3 style={{ color: 'var(--color-text-dim)', margin: '0 0 8px' }}>Database &amp; settings</h3>
          <p style={{ margin: '0 0 8px', wordBreak: 'break-all' }}>{dbFilePath ?? 'Loading…'}</p>
          <p style={{ margin: '0 0 8px', color: 'var(--color-text-dim)', fontSize: '12px' }}>
            The first time you set a collection folder, this moves inside it automatically. Backups always target
            wherever it currently lives, so restoring stays safe after a move.
          </p>
          <button
            onClick={async () => {
              if (
                window.confirm(
                  'Move the database and settings to a new folder? The old copy is left in place, and the app will restart.'
                )
              ) {
                await window.api.chooseDbLocation()
              }
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

        <section style={{ marginTop: '20px' }}>
          <h3 style={{ color: 'var(--color-text-dim)', margin: '0 0 8px' }}>Restore</h3>
          {backups.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--color-text-dim)', fontSize: '12px' }}>No backups yet.</p>
          ) : (
            <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
              {backups.map((entry) => (
                <div
                  key={entry.timestamp}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}
                >
                  <span style={{ fontSize: '12px' }}>{parseBackupTimestamp(entry.timestamp).toLocaleString()}</span>
                  <button
                    onClick={async () => {
                      if (
                        window.confirm(
                          'Restore this backup? This overwrites the current collection and config, then relaunches the app.'
                        )
                      ) {
                        await window.api.restoreBackup(entry.timestamp)
                      }
                    }}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={{ marginTop: '20px' }}>
          <h3 style={{ color: 'var(--color-text-dim)', margin: '0 0 8px' }}>Tag data</h3>
          <button
            onClick={async () => {
              const result = await exportTagData()
              setTagDataMessage(result ? `Exported to ${result.path}` : null)
            }}
          >
            Export…
          </button>{' '}
          <button
            onClick={async () => {
              const result = await importTagData()
              setTagDataMessage(
                result ? `Imported: ${result.matchedTracks} matched, ${result.skippedTracks} skipped` : null
              )
            }}
          >
            Import…
          </button>
          {tagDataMessage && (
            <p style={{ margin: '8px 0 0', color: 'var(--color-text-dim)', fontSize: '12px' }}>{tagDataMessage}</p>
          )}
        </section>
      </div>
    </div>
  )
}
