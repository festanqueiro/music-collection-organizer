import { useEffect, useState } from 'react'
import type { BackupEntry, BackupInfo } from '../../types'
import { Hint, Message, Page, PathText, Section } from './ui'

// Backup filenames use `now.toISOString().replace(/[:.]/g, '-')` (see
// electron/main/backup.ts) — undo that by re-inserting the standard ISO
// separators positionally rather than trying to regex-guess which dashes
// were colons. Format: YYYY-MM-DDTHH-MM-SS-mmmZ (24 chars incl. Z).
function parseBackupTimestamp(timestamp: string): Date {
  const iso = `${timestamp.slice(0, 13)}:${timestamp.slice(14, 16)}:${timestamp.slice(17, 19)}.${timestamp.slice(20, 23)}Z`
  return new Date(iso)
}

export function DataPage() {
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null)
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [dbFilePath, setDbFilePath] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState(false)

  useEffect(() => {
    window.api.getBackupInfo().then(setBackupInfo)
    window.api.listBackups().then(setBackups)
    window.api.getDbFilePath().then(setDbFilePath)
  }, [])

  return (
    <Page title="Backups & data" description="Where MCO keeps your collection and settings, and the copies it makes of them.">
      <Section
        title="Database & settings"
        description="The first time you set a collection folder, this moves inside it automatically. Backups are kept in the app's own folder and always restore to wherever this currently lives."
      >
        <PathText>{dbFilePath ?? 'Loading…'}</PathText>
        <div>
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
        </div>
      </Section>

      <Section title="Backups" description="MCO backs up the database and settings once a day, keeping the last 30.">
        {backupInfo ? (
          <>
            <PathText>{backupInfo.backupFolder}</PathText>
            <Hint>
              Last backup: {backupInfo.lastBackupAt ? new Date(backupInfo.lastBackupAt).toLocaleString() : 'never yet'}
            </Hint>
            {backupInfo.lastBackupError && <Message error>⚠ Last backup failed: {backupInfo.lastBackupError}</Message>}
          </>
        ) : (
          <Hint>Loading…</Hint>
        )}
        <div>
          <button
            disabled={backingUp}
            onClick={async () => {
              setBackingUp(true)
              try {
                await window.api.runBackupNow()
                setBackupInfo(await window.api.getBackupInfo())
                setBackups(await window.api.listBackups())
              } finally {
                setBackingUp(false)
              }
            }}
          >
            {backingUp ? 'Backing up…' : 'Back up now'}
          </button>
        </div>
      </Section>

      <Section title="Restore" description="Replaces the current collection and settings with a backup, then relaunches MCO.">
        {backups.length === 0 ? (
          <Hint>No backups yet.</Hint>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
            {backups.map((entry) => (
              <div key={entry.timestamp} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{parseBackupTimestamp(entry.timestamp).toLocaleString()}</span>
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
      </Section>
    </Page>
  )
}
