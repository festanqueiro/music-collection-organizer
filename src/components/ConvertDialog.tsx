// src/components/ConvertDialog.tsx
//
// "Convert to…" from a row's right-click menu (docs/features/convert.md):
// the format, bit depth or bit rate, sampling frequency and where to save,
// then the conversion's progress and what happened to each file.
import { useEffect, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { parentPath } from '../paths'
import { REVEAL_IN_FILE_MANAGER } from '../platform'
import type { AudioInfo, ConvertFormat, ConvertOptions, ConvertProgress, ConvertResult } from '../types'
import { writeStored } from '../state/stored'

const OPTIONS_KEY = 'convertOptions'
const FORMATS: { id: ConvertFormat; label: string; lossy: boolean }[] = [
  { id: 'wav', label: 'WAV', lossy: false },
  { id: 'aiff', label: 'AIFF', lossy: false },
  { id: 'flac', label: 'FLAC', lossy: false },
  { id: 'alac', label: 'Apple Lossless (.m4a)', lossy: false },
  { id: 'mp3', label: 'MP3', lossy: true },
  { id: 'aac', label: 'AAC (.m4a)', lossy: true },
]
const BITRATES = [320, 256, 192, 128]
const SAMPLE_RATES = [44100, 48000, 88200, 96000]
const kHz = (rate: number) => `${rate / 1000} kHz`

type Remembered = Pick<ConvertOptions, 'format' | 'bitDepth' | 'bitrate' | 'sampleRate'>
const DEFAULTS: Remembered = { format: 'aiff', bitDepth: null, bitrate: 320, sampleRate: null }

// The format and quality last used, per computer. Where to save and
// whether to replace the original are asked afresh every time.
function loadOptions(): Remembered {
  try {
    const stored = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? 'null')
    return {
      format: FORMATS.some((f) => f.id === stored?.format) ? stored.format : DEFAULTS.format,
      bitDepth: stored?.bitDepth === 16 || stored?.bitDepth === 24 ? stored.bitDepth : null,
      bitrate: BITRATES.includes(stored?.bitrate) ? stored.bitrate : DEFAULTS.bitrate,
      sampleRate: SAMPLE_RATES.includes(stored?.sampleRate) ? stored.sampleRate : null,
    }
  } catch {
    return DEFAULTS
  }
}

function describe(info: AudioInfo): string {
  const codec = info.codec.startsWith('pcm_') ? 'PCM' : info.codec.toUpperCase()
  const depth = info.bitDepth ? `${info.bitDepth}-bit${/pcm_f/.test(info.codec) ? ' float' : ''}` : null
  return [codec, depth, info.sampleRate ? kHz(info.sampleRate) : null].filter(Boolean).join(' · ')
}

const rowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '130px 1fr', alignItems: 'center', gap: '8px' }
const noteStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--color-text-dim)', lineHeight: 1.4 }

export function ConvertDialog({ trackIds, onClose }: { trackIds: number[]; onClose: () => void }) {
  const tracks = useCollectionStore((s) => s.tracks)
  const setModalOpen = useCollectionStore((s) => s.setModalOpen)
  const loadAll = useCollectionStore((s) => s.loadAll)
  const runScan = useCollectionStore((s) => s.runScan)
  const [options, setOptions] = useState(loadOptions)
  const [folder, setFolder] = useState<string | null>(null)
  const [replace, setReplace] = useState(false)
  const [info, setInfo] = useState<AudioInfo | null>(null)
  const [progress, setProgress] = useState<ConvertProgress | null>(null)
  const [outcome, setOutcome] = useState<{ results: ConvertResult[] } | { error: string } | null>(null)
  const running = progress !== null && outcome === null

  const first = tracks.find((t) => t.id === trackIds[0])
  const single = trackIds.length === 1
  const format = FORMATS.find((f) => f.id === options.format)!
  // MP3 and AAC stop at 48 kHz.
  const rates = format.lossy ? SAMPLE_RATES.filter((r) => r <= 48000) : SAMPLE_RATES
  const sampleRate = options.sampleRate !== null && rates.includes(options.sampleRate) ? options.sampleRate : null

  // The table's and the player's shortcuts stay out while it's open.
  useEffect(() => {
    setModalOpen(true)
    return () => setModalOpen(false)
  }, [setModalOpen])

  // What the file is now — for one track; a batch would mean reading every file.
  useEffect(() => {
    if (!single) return
    let cancelled = false
    window.api
      .getTrackAudioInfo(trackIds[0])
      .then((found) => {
        if (!cancelled) setInfo(found)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => window.api.onConvertProgress(setProgress), [])

  // Esc closes, except while files are being written.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      if (!running) onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [running, onClose])

  function update(patch: Partial<Remembered>) {
    setOptions((current) => {
      const next = { ...current, ...patch }
      writeStored(OPTIONS_KEY, JSON.stringify(next))
      return next
    })
  }

  async function chooseFolder() {
    const picked = await window.api.pickConvertFolder(folder ?? (first ? parentPath(first.path) : null))
    if (!picked) return
    // Picking the original's own folder is the same as not picking one.
    const same = single && first && picked === parentPath(first.path)
    setFolder(same ? null : picked)
    if (!same) setReplace(false)
  }

  async function convert() {
    setProgress({ done: 0, total: trackIds.length, name: '' })
    const result = await window.api
      .convertTracks(trackIds, { ...options, sampleRate, folder, replace: replace && folder === null })
      .catch((err) => ({ error: err instanceof Error ? err.message : String(err) }))
    setOutcome(result)
    if ('error' in result) return
    // New files inside the collection are found by a scan (which reloads
    // the list); otherwise only the replaced tracks changed.
    if (result.rescan) void runScan()
    else if (result.results.some((r) => r.replaced)) void loadAll()
  }

  const results = outcome && 'results' in outcome ? outcome.results : []
  const converted = results.filter((r) => r.status === 'converted')
  const notConverted = results.filter((r) => r.status !== 'converted' || r.message)
  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        if (!running) onClose()
      }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        // Keep the table's shortcuts (Space, P…) out of the dialog.
        onKeyDown={(e) => e.key !== 'Escape' && e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Convert to another format"
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '20px 24px',
          width: '460px',
          maxWidth: 'calc(100vw - 32px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-secondary)' }}>
            swap_horiz
          </span>
          Convert {single ? '' : `${trackIds.length} tracks `}to…
        </h3>
        <div style={{ ...noteStyle, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={single ? first?.path : undefined}>
          {single ? `${first?.filename ?? ''}${info ? ` — ${describe(info)}` : ''}` : 'Each file is converted with the same settings.'}
        </div>

        {outcome === null && !running && (
          <>
            <label style={rowStyle}>
              Format
              <select value={options.format} onChange={(e) => update({ format: e.target.value as ConvertFormat })}>
                {FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            {format.lossy ? (
              <label style={rowStyle}>
                Bit rate
                <select value={options.bitrate} onChange={(e) => update({ bitrate: Number(e.target.value) })}>
                  {BITRATES.map((b) => (
                    <option key={b} value={b}>
                      {b} kbps
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label style={rowStyle}>
                Bit depth
                <select
                  value={options.bitDepth ?? 'same'}
                  onChange={(e) => update({ bitDepth: e.target.value === 'same' ? null : (Number(e.target.value) as 16 | 24) })}
                >
                  <option value="same">Same as the file (24-bit at most)</option>
                  <option value="16">16-bit</option>
                  <option value="24">24-bit</option>
                </select>
              </label>
            )}
            <label style={rowStyle}>
              Sampling frequency
              <select value={sampleRate ?? 'same'} onChange={(e) => update({ sampleRate: e.target.value === 'same' ? null : Number(e.target.value) })}>
                <option value="same">Same as the file{format.lossy ? ' (48 kHz at most)' : ''}</option>
                {rates.map((r) => (
                  <option key={r} value={r}>
                    {kHz(r)}
                  </option>
                ))}
              </select>
            </label>
            <div style={rowStyle}>
              <span>Save in</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <span title={folder ?? undefined} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: folder ? 'rtl' : undefined, textAlign: 'left' }}>
                  {folder ?? (single ? 'The same folder as the original' : 'The same folder as each original')}
                </span>
                {folder !== null && (
                  <button onClick={() => setFolder(null)} title="Back to the original's folder" style={{ fontSize: '12px', flexShrink: 0 }}>
                    Reset
                  </button>
                )}
                <button onClick={() => void chooseFolder()} style={{ fontSize: '12px', flexShrink: 0 }}>
                  Choose…
                </button>
              </span>
            </div>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', opacity: folder === null ? 1 : 0.5 }}>
              <input type="checkbox" checked={replace && folder === null} disabled={folder !== null} onChange={(e) => setReplace(e.target.checked)} style={{ marginTop: '3px' }} />
              <span>
                Replace the original
                <span style={{ display: 'block', ...noteStyle }}>
                  {folder !== null
                    ? 'Only when saving in the original’s folder.'
                    : replace
                      ? 'The converted file takes the track’s place — its Tags, cues, playlists and play count stay — and the original goes to the Trash.'
                      : 'Off: the converted file is a copy, and the original stays as it is. Inside the collection the copy shows as a new track.'}
                </span>
              </span>
            </label>
            {info && !info.lossless && !format.lossy && (
              <div style={noteStyle}>This file is {info.codec.toUpperCase()}: converting it to a lossless format makes it bigger, not better.</div>
            )}
          </>
        )}

        {running && progress && (
          <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div>
              Converting {Math.min(progress.done + 1, progress.total)} of {progress.total}…
            </div>
            <div style={{ height: '4px', borderRadius: '2px', background: 'var(--color-border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(progress.done / Math.max(1, progress.total)) * 100}%`, background: 'var(--color-accent)' }} />
            </div>
            <div style={{ ...noteStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{progress.name}</div>
          </div>
        )}

        {outcome && 'error' in outcome && <div style={{ color: 'var(--color-error)' }}>{outcome.error}</div>}
        {outcome && 'results' in outcome && (
          <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div>
              {count(converted.length, 'file')} converted
              {results.length < trackIds.length ? `, stopped before the other ${trackIds.length - results.length}` : ''}.
            </div>
            {notConverted.length > 0 && (
              <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '4px 8px' }}>
                {notConverted.map((r) => (
                  <div key={r.trackId} style={{ padding: '2px 0' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    <div style={{ ...noteStyle, color: r.status === 'failed' ? 'var(--color-error)' : 'var(--color-text-dim)' }}>
                      {r.status === 'skipped' ? 'Skipped: ' : r.status === 'failed' ? 'Not converted: ' : ''}
                      {r.message}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
          {outcome === null && !running && (
            <>
              <button onClick={onClose}>Cancel</button>
              <button
                onClick={() => void convert()}
                autoFocus
                style={{ background: 'var(--color-secondary)', color: 'var(--color-on-accent)', border: '1px solid var(--color-secondary)', fontWeight: 500 }}
              >
                Convert
              </button>
            </>
          )}
          {running && (
            <button onClick={() => window.api.stopConverting()} title="Finishes the file being converted, then stops">
              Stop
            </button>
          )}
          {outcome !== null && (
            <>
              {single && converted[0]?.path && !converted[0].replaced && (
                <button onClick={() => void window.api.revealRecording(converted[0].path!)}>{REVEAL_IN_FILE_MANAGER}</button>
              )}
              <button onClick={onClose} autoFocus>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
