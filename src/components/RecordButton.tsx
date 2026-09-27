// src/components/RecordButton.tsx
import { useEffect, useRef, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { isCastActive } from '../cast/castSession'
import { getActiveRecorder, startRecording, stopRecording } from '../audio/recordingSession'
import { formatDuration } from '../format'
import { barButtonStyle } from './playerBarStyles'
import type { RecordingFormat } from '../types'

const POPOVER_WIDTH = 300

const FORMATS: { id: RecordingFormat; name: string; hint: string }[] = [
  { id: 'wav', name: 'WAV', hint: 'Lossless, 24-bit, largest (~1 GB an hour)' },
  { id: 'flac', name: 'FLAC', hint: 'Lossless, about half the size of WAV' },
  { id: 'mp3', name: 'MP3', hint: '192 kbps, ready to upload (~85 MB an hour)' },
]

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  return `${(bytes / 1e6).toFixed(1)} MB`
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path
}

// Elapsed time and file size while recording, refreshed twice a second
// without re-rendering anything else.
function useRecordingStats(active: boolean, format: RecordingFormat): { seconds: number; bytes: number } {
  const [stats, setStats] = useState({ seconds: 0, bytes: 0 })
  useEffect(() => {
    if (!active) {
      setStats({ seconds: 0, bytes: 0 })
      return
    }
    const tick = () => {
      const recorder = getActiveRecorder()
      if (recorder) setStats({ seconds: recorder.elapsedSeconds, bytes: recorder.estimatedFileBytes(format) })
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [active, format])
  return stats
}

// Player-bar button + popover for record mode (docs/features/recording.md):
// records what MCO plays to a file. Dimmed while casting — the two never
// run together.
export function RecordButton() {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const state = useCollectionStore((s) => s.recordingState)
  const format = useCollectionStore((s) => s.recordingFormat)
  const setFormat = useCollectionStore((s) => s.setRecordingFormat)
  const lastPath = useCollectionStore((s) => s.lastRecordingPath)
  const casting = useCollectionStore((s) => isCastActive(s.castStatus))
  const recording = state === 'recording'
  const busy = state === 'starting' || state === 'stopping'
  const stats = useRecordingStats(recording, format)

  useEffect(() => {
    if (!open) return
    window.api.getRecordingFolder().then(setFolder)
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (!popoverRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function toggleOpen(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    setAnchor({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8)),
      bottom: window.innerHeight - rect.top + 8,
    })
    setOpen((v) => !v)
    // Otherwise the focused button swallows Space (play/pause).
    e.currentTarget.blur()
  }

  async function chooseFolder() {
    const chosen = await window.api.chooseRecordingFolder()
    if (chosen) setFolder(chosen)
  }

  const sectionLabel = { fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-dim)' } as const

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        title={recording ? 'Recording — open to stop' : casting ? 'Stop casting to record' : 'Record what MCO plays to a file'}
        style={{
          ...barButtonStyle(open),
          ...(recording ? { color: 'var(--color-error)', borderColor: 'var(--color-error)' } : {}),
          ...(casting && !recording ? { opacity: 0.45 } : {}),
        }}
      >
        <span
          className={recording ? 'material-symbols-outlined rec-pulse' : 'material-symbols-outlined'}
          style={{ fontSize: '18px', color: recording ? 'var(--color-error)' : undefined }}
        >
          {recording ? 'radio_button_checked' : 'fiber_manual_record'}
        </span>
        {recording ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDuration(Math.floor(stats.seconds))}</span> : 'Rec'}
      </button>
      {open && anchor && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            left: anchor.left,
            bottom: anchor.bottom,
            width: POPOVER_WIDTH,
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '10px',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontWeight: 500 }}>Record</div>

          {recording || state === 'stopping' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="material-symbols-outlined rec-pulse" style={{ fontSize: '18px', color: 'var(--color-error)' }}>
                radio_button_checked
              </span>
              <div style={{ flex: 1, fontVariantNumeric: 'tabular-nums' }}>
                <div>{formatDuration(Math.floor(stats.seconds))}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
                  {format.toUpperCase()} · {format === 'wav' ? '' : '~'}
                  {formatSize(stats.bytes)}
                </div>
              </div>
              <button onClick={() => void stopRecording()} disabled={state === 'stopping'}>
                {state === 'stopping' ? (format === 'wav' ? 'Saving…' : `Making ${format.toUpperCase()}…`) : 'Stop'}
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={sectionLabel}>Format</div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {FORMATS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFormat(f.id)}
                      aria-pressed={format === f.id}
                      style={{ ...barButtonStyle(format === f.id), flex: 1, justifyContent: 'center' }}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>{FORMATS.find((f) => f.id === format)?.hint}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={sectionLabel}>Save to</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    title={folder ?? undefined}
                    style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left', fontSize: '12px' }}
                  >
                    {folder ?? '…'}
                  </span>
                  <button onClick={() => void chooseFolder()}>Change…</button>
                </div>
              </div>

              {casting && <div style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>Stop casting to record.</div>}
              <button
                onClick={() => void startRecording()}
                disabled={casting || busy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '6px',
                  border: '1px solid var(--color-error)',
                  color: 'var(--color-error)',
                  background: 'transparent',
                  opacity: casting || busy ? 0.5 : 1,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  fiber_manual_record
                </span>
                {state === 'starting' ? 'Starting…' : 'Start recording'}
              </button>

              {lastPath && (
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span title={lastPath} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                    {fileName(lastPath)}
                  </span>
                  <button onClick={() => void window.api.revealRecording(lastPath)}>Show in Finder</button>
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>
                Records what you hear: the track with its effects and the siren. Keeps recording through pauses and
                track changes until you stop.
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
