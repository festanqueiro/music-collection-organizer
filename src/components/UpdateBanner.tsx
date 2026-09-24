import { useCollectionStore } from '../state/store'

// Top-of-window notice for the auto-updater (see electron/main/updater.ts).
// Only shows once a newer release has been found — "Later" hides it for
// that version until the next launch — and while it downloads/installs.
// Nothing installs without a click on Update.
export function UpdateBanner() {
  const updateState = useCollectionStore((s) => s.updateState)
  const dismissedUpdateVersion = useCollectionStore((s) => s.dismissedUpdateVersion)
  const installUpdate = useCollectionStore((s) => s.installUpdate)
  const dismissUpdate = useCollectionStore((s) => s.dismissUpdate)

  if (!updateState) return null
  const { status, latestVersion } = updateState
  const busy = status === 'downloading' || status === 'installing'
  const installFailed = status === 'error' && !!updateState.error?.startsWith('Update failed')
  const barStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 12px',
    fontSize: '13px',
    background: 'var(--color-surface-raised)',
    borderBottom: '1px solid var(--color-accent)',
  }

  if (installFailed) {
    return (
      <div style={barStyle}>
        <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-secondary)' }}>
          error
        </span>
        <span>{updateState.error}</span>
        <button onClick={() => window.api.openReleasePage()} style={{ fontSize: '12px' }}>
          Download it instead
        </button>
      </div>
    )
  }
  if (!busy && status !== 'available') return null
  if (status === 'available' && latestVersion === dismissedUpdateVersion) return null

  if (busy) {
    const percent = Math.round((updateState.progress ?? 0) * 100)
    return (
      <div style={barStyle}>
        <span className="material-symbols-outlined spin" style={{ fontSize: '18px', color: 'var(--color-accent)' }}>
          progress_activity
        </span>
        {status === 'downloading'
          ? `Downloading MCO ${latestVersion}… ${percent}%`
          : `Installing MCO ${latestVersion} — the app will restart in a moment…`}
      </div>
    )
  }

  return (
    <div style={barStyle}>
      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-accent)' }}>
        system_update_alt
      </span>
      <span>
        <strong>MCO {latestVersion}</strong> is available (you have {updateState.currentVersion}).
      </span>
      {updateState.canInstall ? (
        <button onClick={() => installUpdate()} style={{ fontSize: '12px' }}>
          Update and restart
        </button>
      ) : (
        <button
          onClick={() => window.api.openReleasePage()}
          title={updateState.installBlocker}
          style={{ fontSize: '12px' }}
        >
          Download
        </button>
      )}
      <button onClick={() => window.api.openReleasePage()} style={{ fontSize: '12px' }}>
        What's new
      </button>
      <button onClick={dismissUpdate} style={{ fontSize: '12px' }}>
        Later
      </button>
      {!updateState.canInstall && updateState.installBlocker && (
        <span style={{ color: 'var(--color-text-dim)', fontSize: '12px' }}>{updateState.installBlocker}</span>
      )}
    </div>
  )
}
