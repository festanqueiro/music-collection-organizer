// src/components/QueueDialog.tsx
import { useEffect } from 'react'
import { useCollectionStore } from '../state/store'

// Shown for bulk "add to queue" (toolbar, folder context menu, checked
// tracks) whenever there's a choice to make — see the store's
// requestAddManyToQueue. With unanalysed tracks it asks whether to analyse
// them all now or leave each to be analysed when it's loaded in the
// player; otherwise it's a plain confirmation for a large batch.
export function QueueDialog() {
  const request = useCollectionStore((s) => s.queueRequest)
  const resolve = useCollectionStore((s) => s.resolveQueueRequest)

  useEffect(() => {
    if (!request) return
    function handleKeyDown(e: KeyboardEvent) {
      // Enter is handled by the autoFocused primary button itself, so
      // tabbing to another button and pressing Enter picks that one.
      if (e.key === 'Escape') resolve('cancel')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [request, resolve])

  if (!request) return null

  const total = request.trackIds.length
  const { unanalysedCount } = request
  const tracksLabel = `${total} track${total === 1 ? '' : 's'}`
  const primaryStyle = {
    background: 'var(--color-accent)',
    color: 'var(--color-bg)',
    border: '1px solid var(--color-accent)',
    fontWeight: 500,
  }

  return (
    <div
      onClick={() => resolve('cancel')}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 30,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '20px 24px',
          width: '420px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <h3 style={{ margin: 0 }}>Add {tracksLabel} to the queue?</h3>
        {unanalysedCount > 0 ? (
          <p style={{ margin: 0, color: 'var(--color-text-dim)', lineHeight: 1.5 }}>
            {unanalysedCount === total ? 'None of them have' : `${unanalysedCount} of them haven't`} been analysed yet.
            Analyse {unanalysedCount === 1 ? 'it' : 'them all'} now, or let each track be analysed when it's loaded
            in the player?
          </p>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
          <button onClick={() => resolve('cancel')}>Cancel</button>
          {unanalysedCount > 0 ? (
            <>
              <button onClick={() => resolve('queue-only')}>Queue only</button>
              <button onClick={() => resolve('analyse')} style={primaryStyle} autoFocus>
                Queue &amp; analyse all
              </button>
            </>
          ) : (
            <button onClick={() => resolve('queue-only')} style={primaryStyle} autoFocus>
              Add to queue
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
