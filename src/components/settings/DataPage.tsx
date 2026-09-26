import { useEffect, useState } from 'react'
import type { BackupEntry, BackupInfo, ExternalBackupInfo, ExternalBackupProgress } from '../../types'
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

      <ExternalBackupSection />

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

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`
  return `${Math.round(bytes / 1e3)} KB`
}

// Backup to an external disk: the database and settings plus every file in
// the collection folder, copied incrementally (see
// electron/main/externalBackup.ts).
function ExternalBackupSection() {
  const [info, setInfo] = useState<ExternalBackupInfo | null>(null)
  const [progress, setProgress] = useState<ExternalBackupProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = () => window.api.getExternalBackupInfo().then(setInfo)
  useEffect(() => {
    refresh()
    return window.api.onExternalBackupProgress((p) => {
      setProgress(p)
      if (p.phase === 'error' && p.error) setError(p.error)
    })
  }, [])

  const running = info?.running || (progress !== null && (progress.phase === 'scanning' || progress.phase === 'copying'))
  const last = info?.last

  return (
    <Section
      title="Backup to an external disk"
      description="Copies the database, settings and every file in your collection folder to a folder on another disk, under “MCO Backup”. After the first run only new and changed files are copied, and nothing is ever deleted from the backup."
    >
      <PathText>{info?.folder ?? 'No disk chosen yet'}</PathText>
      {info?.problem && <Message error>⚠ {info.problem}</Message>}
      {error && <Message error>⚠ {error}</Message>}
      {last && !running && (
        <Hint>
          Last backup: {new Date(last.at).toLocaleString()} — {last.copied} copied ({formatBytes(last.bytesCopied)}), {last.unchanged}{' '}
          already up to date
          {last.skippedCloudOnly > 0 && `, ${last.skippedCloudOnly} skipped (only in the cloud — download them to back them up)`}
          {last.failed > 0 && `, ${last.failed} failed`}.
        </Hint>
      )}
      {running && progress && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Hint>
            {progress.phase === 'scanning'
              ? 'Looking for new and changed files…'
              : `Copying ${progress.filesDone} of ${progress.filesTotal} files — ${formatBytes(progress.bytesDone)} of ${formatBytes(progress.bytesTotal)}`}
          </Hint>
          <div style={{ height: '4px', background: 'var(--color-border)', borderRadius: '2px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${progress.bytesTotal ? (progress.bytesDone / progress.bytesTotal) * 100 : 0}%`,
                background: 'var(--color-accent)',
              }}
            />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          disabled={running}
          onClick={async () => {
            setError(null)
            const result = await window.api.chooseExternalBackupFolder()
            if (result && !result.ok) setError(result.error)
            refresh()
          }}
        >
          {info?.folder ? 'Change disk…' : 'Choose disk…'}
        </button>
        {running ? (
          <button onClick={() => window.api.cancelExternalBackup()}>Stop</button>
        ) : (
          <button
            disabled={!info?.folder || !!info.problem}
            onClick={async () => {
              setError(null)
              setProgress({ phase: 'scanning', filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0 })
              const result = await window.api.runExternalBackup()
              if (result && 'error' in result) setError(result.error)
              setProgress(null)
              refresh()
            }}
          >
            Back up now
          </button>
        )}
      </div>
    </Section>
  )
}
