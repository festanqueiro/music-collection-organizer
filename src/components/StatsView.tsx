// src/components/StatsView.tsx
//
// Stats (docs/features/stats.md): the collection in numbers — counts,
// quality, tempo, keys, top genres and artists, years and when songs were
// added — for the whole collection or one folder. A full-screen overlay
// opened from the toolbar; the numbers come from src/state/collectionStats.ts.
import { useEffect, useMemo, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { computeStats, LOW_BITRATE_KBPS, type Count, type QualityVerdict } from '../state/collectionStats'
import { baseName, isInFolder, parentPath } from '../paths'

const number = new Intl.NumberFormat()
// A few songs out of thousands read "<1%", not "0%" (nor "100%" for the rest).
function percent(part: number, whole: number): string {
  if (whole <= 0) return '—'
  const share = Math.round((part / whole) * 100)
  if (share === 0 && part > 0) return '<1%'
  if (share === 100 && part < whole) return '>99%'
  return `${share}%`
}

function playtime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours >= 24) return `${Math.floor(hours / 24)} d ${hours % 24} h`
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`
}

function size(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  return `${Math.round(bytes / 1e6)} MB`
}

// The quality bar's segments, best first.
const QUALITY: { key: QualityVerdict; label: string; color: string; hint: string }[] = [
  { key: 'lossless', label: 'Lossless', color: 'var(--color-accent)', hint: 'WAV, AIFF, FLAC…' },
  { key: 'lossy', label: 'Lossy, OK', color: 'var(--color-secondary)', hint: `${LOW_BITRATE_KBPS} kbps or more` },
  { key: 'low', label: 'Lossy, low', color: 'var(--color-cue)', hint: `under ${LOW_BITRATE_KBPS} kbps` },
  { key: 'unknown', label: 'Not analysed', color: 'var(--color-border)', hint: 'lossy, bitrate not known yet' },
]

const card: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: '10px',
  padding: '14px 16px',
  minWidth: 0,
}
const heading: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--color-text-dim)',
}
const dim: React.CSSProperties = { color: 'var(--color-text-dim)' }

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={card}>
      <div style={{ ...dim, fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {note && <div style={{ ...dim, marginTop: '2px' }}>{note}</div>}
    </div>
  )
}

// Vertical bars, one per bin; every `labelEvery`-th bin is labelled below
// and every bar says its number on hover.
function Columns({ data, labelEvery = 1, height = 120 }: { data: Count[]; labelEvery?: number; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  if (data.length === 0) return <div style={dim}>Nothing to show yet.</div>
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: data.length > 60 ? '1px' : '2px', height }}>
        {data.map((d) => (
          <div
            key={d.label}
            title={`${d.label}: ${number.format(d.count)}`}
            style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'flex-end' }}
          >
            <div
              style={{
                width: '100%',
                height: d.count > 0 ? `max(2px, ${(d.count / max) * 100}%)` : 0,
                background: 'var(--color-accent)',
                borderRadius: '3px 3px 0 0',
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: data.length > 60 ? '1px' : '2px', marginTop: '4px', borderTop: '1px solid var(--color-border)', paddingTop: '4px' }}>
        {data.map((d, i) => (
          <div key={d.label} style={{ flex: 1, minWidth: 0, position: 'relative', height: '14px' }}>
            {i % labelEvery === 0 && (
              <span style={{ ...dim, position: 'absolute', left: 0, fontSize: '10px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {d.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// A ranked list with a bar behind each count.
function Ranking({ data, empty }: { data: Count[]; empty: string }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  if (data.length === 0) return <div style={dim}>{empty}</div>
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {data.map((d, i) => (
        <li key={d.label} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) 48px', alignItems: 'center', gap: '8px' }}>
          <span style={{ ...dim, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
          <div style={{ position: 'relative', minWidth: 0 }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: `${(d.count / max) * 100}%`,
                background: 'var(--color-accent)',
                opacity: 0.18,
                borderRadius: '4px',
              }}
            />
            <div style={{ position: 'relative', padding: '3px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.label}
            </div>
          </div>
          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{number.format(d.count)}</span>
        </li>
      ))}
    </ol>
  )
}

// Enough labels to read the axis without them running into each other.
const labelStep = (count: number, fit: number) => Math.max(1, Math.ceil(count / fit))

export function StatsView({ onClose }: { onClose: () => void }) {
  const tracks = useCollectionStore((s) => s.tracks)
  const missingTracks = useCollectionStore((s) => s.missingTracks)
  const trackTags = useCollectionStore((s) => s.trackTags)
  const genres = useCollectionStore((s) => s.genres)
  const keyNotation = useCollectionStore((s) => s.keyNotation)
  const collectionFolder = useCollectionStore((s) => s.collectionFolder)
  // '' = the whole collection, else a folder's path.
  const [scope, setScope] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Every folder with songs in it (or under it), inside the collection.
  const folders = useMemo(() => {
    const all = new Set<string>()
    for (const t of tracks) {
      for (let folder = t.folder; collectionFolder && folder !== collectionFolder && isInFolder(folder, collectionFolder); ) {
        if (all.has(folder)) break
        all.add(folder)
        const parent = parentPath(folder)
        if (parent === folder) break
        folder = parent
      }
    }
    return [...all].sort((a, b) => a.localeCompare(b))
  }, [tracks, collectionFolder])

  const stats = useMemo(() => {
    const inScope = <T extends { path: string }>(list: T[]) => (scope ? list.filter((t) => isInFolder(t.path, scope)) : list)
    return computeStats(inScope(tracks), inScope(missingTracks), trackTags, genres, keyNotation)
  }, [tracks, missingTracks, trackTags, genres, keyNotation, scope])

  const depth = (folder: string) => (collectionFolder ? folder.slice(collectionFolder.length).split(/[\\/]/).filter(Boolean).length - 1 : 0)
  const s = stats

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        background: 'var(--color-bg)',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 20px',
          background: 'var(--color-bg)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
          query_stats
        </span>
        <span style={{ fontSize: '15px', fontWeight: 700 }}>Stats</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ marginLeft: '12px', maxWidth: '360px' }}>
          <option value="">Whole collection</option>
          {folders.map((folder) => (
            <option key={folder} value={folder}>
              {'  '.repeat(depth(folder))}
              {baseName(folder)}
            </option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close stats"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', padding: 0 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            close
          </span>
        </button>
      </div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          <Tile label="Songs" value={number.format(s.songs)} />
          <Tile label="Playtime" value={playtime(s.playtimeSeconds)} note={s.noLength > 0 ? `${number.format(s.noLength)} with no length` : undefined} />
          <Tile label="Size on disk" value={size(s.sizeBytes)} />
          <Tile label="Artists" value={number.format(s.artists)} />
          <Tile label="Albums" value={number.format(s.albums)} />
          <Tile label="Genres" value={number.format(s.genres)} note="MCO tags in use" />
        </div>

        <section style={card}>
          <h2 style={heading}>Quality</h2>
          <div style={{ display: 'flex', gap: '2px', height: '14px', borderRadius: '4px', overflow: 'hidden', background: 'var(--color-surface-raised)' }}>
            {QUALITY.filter((q) => s.quality[q.key] > 0).map((q) => (
              <div
                key={q.key}
                title={`${q.label}: ${number.format(s.quality[q.key])} (${percent(s.quality[q.key], s.songs)})`}
                style={{ flex: s.quality[q.key], background: q.color }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginTop: '10px' }}>
            {QUALITY.map((q) => (
              <div key={q.key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title={q.hint}>
                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: q.color }} />
                <span>{q.label}</span>
                <span style={{ ...dim, fontVariantNumeric: 'tabular-nums' }}>
                  {number.format(s.quality[q.key])} · {percent(s.quality[q.key], s.songs)}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px', alignItems: 'center' }}>
            <span style={dim}>Formats</span>
            {s.formats.map((f) => (
              <span
                key={f.label}
                style={{ padding: '2px 8px', borderRadius: '99px', border: '1px solid var(--color-border)', fontVariantNumeric: 'tabular-nums' }}
              >
                {f.label} <span style={dim}>{number.format(f.count)}</span>
              </span>
            ))}
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '16px' }}>
          <section style={card}>
            <h2 style={heading}>Tempo</h2>
            <div style={{ ...dim, marginBottom: '10px' }}>
              {s.bpmMin !== null
                ? `${Math.round(s.bpmMin)}–${Math.round(s.bpmMax!)} BPM · median ${Math.round(s.bpmMedian!)}`
                : 'No BPMs yet — analyse the collection.'}
              {s.noBpm > 0 && s.bpmMin !== null ? ` · ${number.format(s.noBpm)} without` : ''}
            </div>
            <Columns data={s.bpmBins} labelEvery={labelStep(s.bpmBins.length, 10)} />
          </section>
          <section style={card}>
            <h2 style={heading}>Keys</h2>
            <div style={{ ...dim, marginBottom: '10px' }}>
              {s.noKey > 0 ? `${number.format(s.noKey)} without a key` : 'Every song has a key'}
            </div>
            <Columns data={s.keys} labelEvery={labelStep(s.keys.length, keyNotation === 'both' ? 6 : 12)} />
          </section>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          <section style={card}>
            <h2 style={heading}>Top genres</h2>
            <Ranking data={s.topGenres} empty="No songs tagged yet." />
          </section>
          <section style={card}>
            <h2 style={heading}>Top artists</h2>
            <Ranking data={s.topArtists} empty="No artists yet." />
          </section>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '16px' }}>
          <section style={card}>
            <h2 style={heading}>Years of release</h2>
            <div style={{ ...dim, marginBottom: '10px' }}>
              {s.decades.map((d) => `${d.label} ${number.format(d.count)}`).join(' · ') || 'No years yet.'}
              {s.noYear > 0 && s.decades.length > 0 ? ` · ${number.format(s.noYear)} without` : ''}
            </div>
            <Columns data={s.years} labelEvery={labelStep(s.years.length, 8)} />
          </section>
          <section style={card}>
            <h2 style={heading}>Added per month</h2>
            <div style={{ ...dim, marginBottom: '10px' }}>
              When the file arrived on this drive
              {s.noAddedDate > 0 ? ` · ${number.format(s.noAddedDate)} without a date` : ''}
            </div>
            <Columns data={s.addedPerMonth} labelEvery={labelStep(s.addedPerMonth.length, 8)} />
          </section>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          <Tile label="Analysed" value={number.format(s.analysed)} note={percent(s.analysed, s.songs)} />
          <Tile label="Tagged" value={number.format(s.tagged)} note={`${percent(s.tagged, s.songs)} with a genre tag`} />
          <Tile label="File not found" value={number.format(s.missing)} note="Missing since the last scan" />
          <Tile label="In iCloud only" value={number.format(s.cloudOnly)} note="Not downloaded here" />
        </div>
      </div>
    </div>
  )
}
