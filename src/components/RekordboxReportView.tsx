// Rekordbox sync, phase 1 (docs/features/rekordbox-sync.md): what differs
// between Rekordbox's collection export and MCO, in four groups. Read-only —
// the wizard that applies changes comes next.
import { useEffect, useMemo, useState } from 'react'
import type { RekordboxCueMark, RekordboxInfoField, RekordboxReport } from '../types'
import { baseName } from '../paths'

type Group = 'playlists' | 'info' | 'cues' | 'files'

const FIELD_LABEL: Record<RekordboxInfoField, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  year: 'Year',
  genre: 'Genre ↔ MCO Tags',
  bpm: 'BPM',
  key: 'Key',
}

const FILE_LABEL: Record<RekordboxReport['files'][number]['kind'], { title: string; hint: string }> = {
  'outside-collection': {
    title: 'In Rekordbox, outside your collection folder',
    hint: 'Songs Rekordbox plays from elsewhere (copied from a USB stick, Downloads). MCO can’t see them until they’re in the collection folder.',
  },
  'not-scanned': { title: 'In Rekordbox, not scanned by MCO yet', hint: 'In the collection folder but not in MCO’s library — Update Collection picks them up.' },
  'gone-from-disk': { title: 'In Rekordbox, but the file is gone', hint: 'Rekordbox lists a file that isn’t on this Mac any more (moved, renamed or deleted).' },
  'only-in-mco': { title: 'In MCO, not in Rekordbox', hint: 'Songs in your collection Rekordbox doesn’t have yet.' },
  'missing-in-mco': { title: 'In Rekordbox, missing in MCO', hint: 'MCO’s last scan couldn’t find these files, but Rekordbox lists them.' },
}

const PLAYLIST_LABEL: Record<RekordboxReport['playlists'][number]['kind'], string> = {
  different: 'Different',
  'only-rekordbox': 'Only in Rekordbox',
  'only-mco': 'Only in MCO',
  same: 'The same',
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`
const time = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

function Cue({ mark }: { mark: RekordboxCueMark }) {
  const name = mark.kind === 'hot' ? 'ABCDEFGH'[mark.slot] ?? '?' : mark.kind === 'loop' ? '↻' : 'M'
  return (
    <span
      title={`${mark.kind === 'hot' ? `Hot cue ${name}` : mark.kind === 'loop' ? 'Loop' : 'Memory cue'} at ${time(mark.start)}${mark.end !== undefined ? `–${time(mark.end)}` : ''}`}
      style={{
        display: 'inline-flex',
        gap: '4px',
        alignItems: 'center',
        fontSize: '11px',
        padding: '1px 6px',
        borderRadius: '8px',
        border: `1px solid ${mark.color ?? 'var(--color-border)'}`,
        marginRight: '4px',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <strong style={{ color: mark.color ?? undefined }}>{name}</strong> {time(mark.start)}
    </span>
  )
}

const cellStyle = { padding: '4px 8px', borderBottom: '1px solid var(--color-border)', verticalAlign: 'top' as const }

export function RekordboxReportView({
  report,
  onClose,
  onCompareAgain,
  onPickFile,
  onImportCues,
}: {
  report: RekordboxReport
  onClose: () => void
  onCompareAgain: () => void
  onPickFile: () => void
  // Brings Rekordbox's cues into MCO: all of them for a song with none, the empty pads of one with cues.
  onImportCues: () => Promise<string>
}) {
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [group, setGroup] = useState<Group>('playlists')
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    // First, and only this: Esc mustn't also close Settings underneath.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const counts = useMemo(
    () => ({
      playlists: report.playlists.filter((p) => p.kind !== 'same').length,
      info: report.info.reduce((n, f) => n + f.count, 0),
      cues: report.cues.rows.length,
      files: report.files.reduce((n, f) => n + f.count, 0),
    }),
    [report]
  )

  const groups: { key: Group; label: string; icon: string }[] = [
    { key: 'playlists', label: 'Playlists', icon: 'queue_music' },
    { key: 'info', label: 'Music info', icon: 'info' },
    { key: 'cues', label: 'Cue points', icon: 'bookmark' },
    { key: 'files', label: 'Files', icon: 'folder' },
  ]
  const more = (shown: number, count: number) =>
    count > shown && <div style={{ color: 'var(--color-text-dim)', fontSize: '12px', padding: '6px 8px' }}>…and {count - shown} more</div>

  return (
    <div
      role="dialog"
      aria-label="Compare with Rekordbox"
      style={{ position: 'fixed', inset: 0, background: 'var(--color-bg)', zIndex: 45, display: 'flex', flexDirection: 'column' }}
    >
      <header
        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 18px', borderBottom: '1px solid var(--color-border)' }}
      >
        <span className="material-symbols-outlined">compare_arrows</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>Rekordbox ↔ MCO</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {baseName(report.file)}
            {report.rekordboxVersion ? ` · Rekordbox ${report.rekordboxVersion}` : ''} · {report.rekordboxTracks.toLocaleString()} songs in
            Rekordbox, {report.matched.toLocaleString()} found in MCO (of {report.mcoTracks.toLocaleString()})
          </div>
        </div>
        <button onClick={onCompareAgain} title="Read the same file again — after exporting again from Rekordbox">
          Compare again
        </button>
        <button onClick={onPickFile}>Another file…</button>
        <button onClick={onClose} title="Close (Esc)" aria-label="Close" style={{ display: 'flex' }}>
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <nav style={{ width: '220px', borderRight: '1px solid var(--color-border)', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {groups.map((g) => (
            <button
              key={g.key}
              onClick={() => setGroup(g.key)}
              aria-pressed={group === g.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                justifyContent: 'flex-start',
                padding: '8px 10px',
                border: group === g.key ? '1px solid var(--color-accent)' : '1px solid transparent',
                color: group === g.key ? 'var(--color-accent)' : undefined,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                {g.icon}
              </span>
              <span style={{ flex: 1, textAlign: 'left' }}>{g.label}</span>
              <span style={{ color: 'var(--color-text-dim)', fontVariantNumeric: 'tabular-nums' }}>{counts[g.key].toLocaleString()}</span>
            </button>
          ))}
          <div style={{ marginTop: 'auto', fontSize: '12px', color: 'var(--color-text-dim)', lineHeight: 1.45 }}>
            Read-only: nothing is changed in MCO or Rekordbox. Applying differences, one by one or in bulk, comes next.
          </div>
        </nav>

        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '14px 18px' }}>
          {group === 'playlists' && (
            <>
              <p style={{ marginTop: 0, color: 'var(--color-text-dim)', fontSize: '13px' }}>
                Matched by their name and folders; playlists imported from Rekordbox by where they came from.
              </p>
              {report.playlists.length === 0 && <p>No playlists on either side.</p>}
              {report.playlists.map((p) => {
                const key = `${p.kind}:${p.name}`
                const detail = p.onlyRekordbox.length + p.onlyMco.length > 0 || p.orderDiffers
                return (
                  <div key={key} style={{ borderBottom: '1px solid var(--color-border)', padding: '8px 0' }}>
                    <div
                      onClick={() => detail && setOpen(open === key ? null : key)}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: detail ? 'pointer' : 'default' }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '1px 8px',
                          borderRadius: '8px',
                          minWidth: '112px',
                          textAlign: 'center',
                          border: '1px solid var(--color-border)',
                          color: p.kind === 'same' ? 'var(--color-text-dim)' : p.kind === 'different' ? 'var(--color-cue)' : 'var(--color-accent)',
                        }}
                      >
                        {PLAYLIST_LABEL[p.kind]}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ color: 'var(--color-text-dim)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {p.rekordboxSongs !== null && `Rekordbox ${p.rekordboxSongs}`}
                        {p.rekordboxSongs !== null && p.mcoSongs !== null && ' · '}
                        {p.mcoSongs !== null && `MCO ${p.mcoSongs}`}
                        {p.notInCollection > 0 && ` · ${p.notInCollection} not in your collection`}
                        {p.goneFromRekordbox && ' · no longer in Rekordbox'}
                      </span>
                      {detail && (
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                          {open === key ? 'expand_less' : 'expand_more'}
                        </span>
                      )}
                    </div>
                    {open === key && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px', fontSize: '13px' }}>
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Only in Rekordbox’s playlist ({p.onlyRekordbox.length})</div>
                          {p.onlyRekordbox.map((s) => (
                            <div key={s}>+ {s}</div>
                          ))}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Only in MCO’s playlist ({p.onlyMco.length})</div>
                          {p.onlyMco.map((s) => (
                            <div key={s}>+ {s}</div>
                          ))}
                        </div>
                        {p.orderDiffers && <div style={{ color: 'var(--color-text-dim)' }}>The songs they share are in a different order.</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {group === 'info' &&
            report.info.map((f) => (
              <section key={f.field} style={{ marginBottom: '14px' }}>
                <div
                  onClick={() => f.count > 0 && setOpen(open === f.field ? null : f.field)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: f.count ? 'pointer' : 'default', padding: '6px 0' }}
                >
                  <strong style={{ flex: 1 }}>{FIELD_LABEL[f.field]}</strong>
                  <span style={{ color: f.count ? 'var(--color-cue)' : 'var(--color-text-dim)' }}>
                    {f.count ? `${plural(f.count, 'song')} ${f.count === 1 ? 'differs' : 'differ'}` : 'All the same'}
                  </span>
                  {f.count > 0 && (
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      {open === f.field ? 'expand_less' : 'expand_more'}
                    </span>
                  )}
                </div>
                {open === f.field && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--color-text-dim)' }}>
                        <th style={cellStyle}>Song</th>
                        <th style={cellStyle}>Rekordbox</th>
                        <th style={cellStyle}>MCO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.rows.map((r) => (
                        <tr key={r.trackId}>
                          <td style={cellStyle}>{r.song}</td>
                          <td style={cellStyle}>{r.rekordbox}</td>
                          <td style={cellStyle}>{r.mco}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {open === f.field && more(f.rows.length, f.count)}
              </section>
            ))}

          {group === 'cues' && (
            <>
              <p style={{ marginTop: 0, color: 'var(--color-text-dim)', fontSize: '13px' }}>
                Songs both have, whose cue points differ: {plural(report.cues.onlyRekordbox, 'song')} with cues only in Rekordbox,{' '}
                {plural(report.cues.onlyMco, 'song')} only in MCO, {plural(report.cues.different, 'song')} with different ones.
              </p>
              {report.cues.onlyRekordbox > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <button
                    disabled={importing}
                    onClick={async () => {
                      setImporting(true)
                      try {
                        setImportMessage(await onImportCues())
                      } finally {
                        setImporting(false)
                      }
                    }}
                  >
                    {importing ? 'Bringing them in…' : `Bring Rekordbox’s cues into MCO (${plural(report.cues.onlyRekordbox, 'song')})`}
                  </button>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
                    A song with no cues in MCO gets them all; one with its own keeps them and only has its empty pads filled.
                  </span>
                </div>
              )}
              {importMessage && <p style={{ fontSize: '13px' }}>{importMessage}</p>}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--color-text-dim)' }}>
                    <th style={cellStyle}>Song</th>
                    <th style={cellStyle}>Rekordbox</th>
                    <th style={cellStyle}>MCO</th>
                  </tr>
                </thead>
                <tbody>
                  {report.cues.rows.map((r) => (
                    <tr key={r.trackId}>
                      <td style={{ ...cellStyle, width: '30%' }}>{r.song}</td>
                      <td style={cellStyle}>
                        {r.rekordbox.length ? r.rekordbox.map((m, i) => <Cue key={i} mark={m} />) : '—'}
                      </td>
                      <td style={cellStyle}>{r.mco.length ? r.mco.map((m, i) => <Cue key={i} mark={m} />) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {more(report.cues.rows.length, report.cues.onlyRekordbox + report.cues.onlyMco + report.cues.different)}
            </>
          )}

          {group === 'files' &&
            report.files.map((f) => (
              <section key={f.kind} style={{ marginBottom: '14px' }}>
                <div
                  onClick={() => f.count > 0 && setOpen(open === f.kind ? null : f.kind)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: f.count ? 'pointer' : 'default', padding: '6px 0' }}
                >
                  <div style={{ flex: 1 }}>
                    <strong>{FILE_LABEL[f.kind].title}</strong>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>{FILE_LABEL[f.kind].hint}</div>
                  </div>
                  <span style={{ color: f.count ? 'var(--color-cue)' : 'var(--color-text-dim)' }}>{f.count.toLocaleString()}</span>
                  {f.count > 0 && (
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      {open === f.kind ? 'expand_less' : 'expand_more'}
                    </span>
                  )}
                </div>
                {open === f.kind && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <tbody>
                      {f.rows.map((r) => (
                        <tr key={r.path}>
                          <td style={{ ...cellStyle, width: '40%' }}>{r.song}</td>
                          <td style={{ ...cellStyle, color: 'var(--color-text-dim)', wordBreak: 'break-all' }}>{r.path}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {open === f.kind && more(f.rows.length, f.count)}
              </section>
            ))}
        </main>
      </div>
    </div>
  )
}
