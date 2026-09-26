// The sidebar's Filters view. Each filter narrows the track table on top
// of the folder/tag selection and the search box; the active ones also
// show as chips above the table, so they're visible from any view.
import { useMemo, type ReactNode } from 'react'
import { useCollectionStore, type AnalysedFilter } from '../state/store'
import { toCamelot, formatKey } from '../state/harmonic'
import { findDuplicates } from '../state/duplicates'

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontWeight: 600, marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-dim)', marginBottom: '6px', lineHeight: 1.4 }}>{hint}</div>
      {children}
    </div>
  )
}

function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', opacity: disabled ? 0.5 : 1 }}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

const ANALYSED_OPTIONS: { value: AnalysedFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'analysed', label: 'Analysed' },
  { value: 'unanalysed', label: 'Not analysed' },
]

export function FiltersPanel() {
  const tracks = useCollectionStore((s) => s.tracks)
  const playlist = useCollectionStore((s) => s.playlist)
  const keyNotation = useCollectionStore((s) => s.keyNotation)
  const compatibleFilter = useCollectionStore((s) => s.compatibleFilter)
  const setCompatibleFilter = useCollectionStore((s) => s.setCompatibleFilter)
  const analysedFilter = useCollectionStore((s) => s.analysedFilter)
  const setAnalysedFilter = useCollectionStore((s) => s.setAnalysedFilter)
  const duplicatesFilter = useCollectionStore((s) => s.duplicatesFilter)
  const setDuplicatesFilter = useCollectionStore((s) => s.setDuplicatesFilter)

  const current = playlist[0] != null ? tracks.find((t) => t.id === playlist[0]) : undefined
  const canFilterCompatible = !!current && toCamelot(current.musicalKey) !== null
  const duplicateCount = useMemo(() => findDuplicates(tracks).size, [tracks])
  const unanalysedCount = useMemo(() => tracks.filter((t) => t.analysisStatus !== 'done').length, [tracks])

  return (
    <div>
      <Section
        title="Compatible"
        hint={
          canFilterCompatible
            ? `Tracks that mix with the playing track (${formatKey(current?.musicalKey, keyNotation)}): the same Camelot key, one step either way, or its relative major/minor — and a BPM within 6% (or half/double time).`
            : 'Tracks that mix with the playing track, by key and BPM. Play an analysed track to use it.'
        }
      >
        <Toggle
          on={compatibleFilter}
          onChange={setCompatibleFilter}
          disabled={!canFilterCompatible && !compatibleFilter}
          label="Only compatible tracks"
        />
      </Section>

      <Section title="Analysed" hint={`${unanalysedCount} of ${tracks.length} tracks aren't analysed yet (no BPM, key or waveform).`}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {ANALYSED_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setAnalysedFilter(option.value)}
              aria-pressed={analysedFilter === option.value}
              style={{
                fontSize: '12px',
                padding: '4px 8px',
                border: analysedFilter === option.value ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                color: analysedFilter === option.value ? 'var(--color-accent)' : undefined,
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Duplicates"
        hint={`The same song more than once — matching artist and title, or filename — in any folder or format. ${duplicateCount} tracks have a copy.`}
      >
        <Toggle on={duplicatesFilter} onChange={setDuplicatesFilter} label="Only tracks with a duplicate" />
      </Section>
    </div>
  )
}
