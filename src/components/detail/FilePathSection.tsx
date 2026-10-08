// src/components/detail/FilePathSection.tsx
import { useEffect, useState } from 'react'
import { useCollectionStore } from '../../state/store'
import { REVEAL_IN_FILE_MANAGER } from '../../platform'
import { ConfirmDialog } from '../ConfirmDialog'
import { decodeHtmlEntities } from '../../format'
import type { Track } from '../../types'
import { useSectionOpen, DetailSection } from './DetailSection'

// The file's full path, at the very bottom — selectable, with shortcuts to
// copy it or reveal the file in Finder.
export function FilePathSection({ track, onTrashed }: { track: Track; onTrashed: () => void }) {
  const [copied, setCopied] = useState(false)
  const [confirmingTrash, setConfirmingTrash] = useState(false)
  const [trashError, setTrashError] = useState<string | null>(null)
  const trashTrack = useCollectionStore((s) => s.trashTrack)
  const runAnalysis = useCollectionStore((s) => s.runAnalysis)
  const analysing = track.analysisStatus === 'analyzing'
  const analysed = track.analysisStatus === 'done'
  // A status with its icon on the left and, where there's something to do, a button on the right.
  const status = (icon: string, color: string, text: string, action?: { label: string; title: string; run: () => void; disabled?: boolean }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '24px' }}>
      <span className="material-symbols-outlined" style={{ fontSize: '16px', color, flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{text}</span>
      {action && (
        <button onClick={action.run} disabled={action.disabled} title={action.title} style={{ fontSize: '12px', flexShrink: 0 }}>
          {action.label}
        </button>
      )}
    </div>
  )
  const [open, toggleOpen] = useSectionOpen('file')
  useEffect(() => {
    setCopied(false)
    setConfirmingTrash(false)
    setTrashError(null)
  }, [track.id])
  return (
    <DetailSection title="File" open={open} onToggle={toggleOpen}>
      {/* Whether the file is on this computer, and whether it has been analysed. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
        {track.cloudStatus === 'local'
          ? status('cloud_done', 'var(--color-accent)', 'Synced locally')
          : status('cloud', 'var(--color-text-dim)', 'In the cloud only', {
              label: 'Sync',
              title: 'Download the file to this computer',
              run: () => void window.api.downloadTrack(track.id).then(() => useCollectionStore.getState().loadAll()),
            })}
        {analysing
          ? status('progress_activity', 'var(--color-text-dim)', 'Analysing…')
          : analysed
            ? status('check_circle', 'var(--color-accent)', `Analysed${track.analyzedAt ? ` on ${new Date(track.analyzedAt).toLocaleDateString()}` : ''}`, {
                label: 'Re-analyse',
                title: 'Analyse it again: BPM, key, waveform, loudness. Your cues, Tags and a BPM you set are kept.',
                run: () => void runAnalysis([track.id]),
              })
            : status(
                track.analysisStatus === 'error' ? 'error' : 'radio_button_unchecked',
                track.analysisStatus === 'error' ? 'var(--color-error)' : 'var(--color-text-dim)',
                track.analysisStatus === 'error' ? 'Analysis failed' : 'Not analysed',
                { label: 'Analyse', title: 'Work out its BPM, key, waveform and loudness', run: () => void runAnalysis([track.id]) }
              )}
      </div>
      <div style={{ userSelect: 'text', overflowWrap: 'anywhere', lineHeight: 1.4 }}>{track.path}</div>
      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
        <button
          onClick={() => {
            navigator.clipboard
              .writeText(track.path)
              .then(() => setCopied(true))
              .catch((err) => console.error('copying the path failed', err))
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            {copied ? 'check' : 'content_copy'}
          </span>
          {copied ? 'Copied' : 'Copy path'}
        </button>
        <button
          onClick={() => window.api.showTrackInFolder(track.id)}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            folder_open
          </span>
          {REVEAL_IN_FILE_MANAGER}
        </button>
        <button
          onClick={() => setConfirmingTrash(true)}
          title="Move this file to the Trash"
          style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', marginLeft: 'auto', color: 'var(--color-error)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            delete
          </span>
          Delete
        </button>
      </div>
      {trashError && <div style={{ color: 'var(--color-error)', marginTop: '6px' }}>{trashError}</div>}
      {confirmingTrash && (
        <ConfirmDialog
          title="Delete this file?"
          icon="delete"
          confirmLabel="Move to Trash"
          onCancel={() => setConfirmingTrash(false)}
          onConfirm={async () => {
            setConfirmingTrash(false)
            const error = await trashTrack(track.id)
            if (error) setTrashError(error)
            else onTrashed()
          }}
        >
          <div style={{ color: 'var(--color-text)', fontWeight: 500, overflowWrap: 'anywhere' }}>
            {decodeHtmlEntities(track.title ?? track.filename)}
          </div>
          <div style={{ marginTop: '6px' }}>
            The file is moved to the Trash (and, in a synced folder, the cloud's trash), so it can be restored. It's
            removed from the collection and the queue; its tags come back if you restore it.
          </div>
        </ConfirmDialog>
      )}
    </DetailSection>
  )
}
