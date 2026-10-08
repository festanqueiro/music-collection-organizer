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
  const [open, toggleOpen] = useSectionOpen('file')
  useEffect(() => {
    setCopied(false)
    setConfirmingTrash(false)
    setTrashError(null)
  }, [track.id])
  return (
    <DetailSection title="File" open={open} onToggle={toggleOpen}>
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
