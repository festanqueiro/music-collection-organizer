// The sidebar's Filters view. Each filter narrows the track table on top
// of the folder/tag selection and the search box; the active ones also
// show as chips above the table, so they're visible from any view.
import { useMemo, type ReactNode } from 'react'
import { useCollectionStore, type AnalysedFilter, type McoTagsFilter } from '../state/store'
import { toCamelot, formatKey } from '../state/harmonic'
import { findDuplicates } from '../state/duplicates'
import { isMissingId3Metadata, matchesEnergy, matchesMcoTagsFilter, type EnergyRange } from '../state/trackFilters'
import { isSlowBpm } from '../state/trackFilters'

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

const MCO_TAGS_OPTIONS: { value: McoTagsFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'no-tags', label: 'No Tags' },
  { value: 'no-subtags', label: 'No Subtags' },
]

// A row of choices, one selected — the Analysed and MCO tags filters.
function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          style={{
            fontSize: '12px',
            padding: '4px 8px',
            border: value === option.value ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
            color: value === option.value ? 'var(--color-accent)' : undefined,
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// Quick picks for the Energy filter, then the exact range.
const ENERGY_PRESETS: { label: string; range: EnergyRange | null }[] = [
  { label: 'Any', range: null },
  { label: 'Warm-up 1–4', range: [1, 4] },
  { label: 'Build 5–7', range: [5, 7] },
  { label: 'Peak 8–10', range: [8, 10] },
]

function EnergyRangePicker({ value, onChange }: { value: EnergyRange | null; onChange: (range: EnergyRange | null) => void }) {
  const same = (r: EnergyRange | null) => (r === null ? value === null : value !== null && r[0] === value[0] && r[1] === value[1])
  const levels = Array.from({ length: 10 }, (_, i) => i + 1)
  const [from, to] = value ?? [1, 10]
  const select = (current: number, set: (n: number) => void, label: string) => (
    <select aria-label={label} value={current} onChange={(e) => set(Number(e.target.value))} style={{ fontSize: '12px' }}>
      {levels.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {ENERGY_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => onChange(preset.range)}
            aria-pressed={same(preset.range)}
            style={{
              fontSize: '12px',
              padding: '4px 8px',
              border: same(preset.range) ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
              color: same(preset.range) ? 'var(--color-accent)' : undefined,
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-dim)' }}>
        From {select(from, (n) => onChange([n, Math.max(n, to)]), 'Lowest energy')} to{' '}
        {select(to, (n) => onChange([Math.min(from, n), n]), 'Highest energy')}
      </div>
    </div>
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
  const energyFilter = useCollectionStore((s) => s.energyFilter)
  const setEnergyFilter = useCollectionStore((s) => s.setEnergyFilter)
  const duplicatesFilter = useCollectionStore((s) => s.duplicatesFilter)
  const setDuplicatesFilter = useCollectionStore((s) => s.setDuplicatesFilter)
  const slowBpmFilter = useCollectionStore((s) => s.slowBpmFilter)
  const setSlowBpmFilter = useCollectionStore((s) => s.setSlowBpmFilter)
  const slowestBpm = useCollectionStore((s) => s.slowestBpm)
  const slowCount = useCollectionStore((s) => s.tracks.filter((t) => isSlowBpm(t, s.slowestBpm)).length)
  const trackTags = useCollectionStore((s) => s.trackTags)
  const mcoTagsFilter = useCollectionStore((s) => s.mcoTagsFilter)
  const setMcoTagsFilter = useCollectionStore((s) => s.setMcoTagsFilter)
  const missingMetadataFilter = useCollectionStore((s) => s.missingMetadataFilter)
  const setMissingMetadataFilter = useCollectionStore((s) => s.setMissingMetadataFilter)
  const tagReadRemaining = useCollectionStore((s) => s.tagReadRemaining)
  const missingTracks = useCollectionStore((s) => s.missingTracks)
  const cloudOnlyFilter = useCollectionStore((s) => s.cloudOnlyFilter)
  const setCloudOnlyFilter = useCollectionStore((s) => s.setCloudOnlyFilter)
  const cloudOnlyCount = useMemo(() => tracks.filter((t) => t.cloudStatus === 'cloud_only').length, [tracks])
  const missingTracksFilter = useCollectionStore((s) => s.missingTracksFilter)
  const setMissingTracksFilter = useCollectionStore((s) => s.setMissingTracksFilter)

  const current = playlist[0] != null ? tracks.find((t) => t.id === playlist[0]) : undefined
  const canFilterCompatible = !!current && toCamelot(current.musicalKey) !== null
  const duplicateCount = useMemo(() => findDuplicates(tracks).size, [tracks])
  const unanalysedCount = useMemo(() => tracks.filter((t) => t.analysisStatus !== 'done').length, [tracks])
  const noTagsCount = useMemo(
    () => tracks.filter((t) => matchesMcoTagsFilter(trackTags.get(t.id), 'no-tags')).length,
    [tracks, trackTags]
  )
  const noSubtagsCount = useMemo(
    () => tracks.filter((t) => matchesMcoTagsFilter(trackTags.get(t.id), 'no-subtags')).length,
    [tracks, trackTags]
  )
  const missingMetadataCount = useMemo(() => tracks.filter(isMissingId3Metadata).length, [tracks])
  const ratedCount = useMemo(() => tracks.filter((t) => t.energy !== null).length, [tracks])
  const inEnergyRange = useMemo(
    () => (energyFilter ? tracks.filter((t) => matchesEnergy(t.energy, energyFilter)).length : null),
    [tracks, energyFilter]
  )

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
        <Choice options={ANALYSED_OPTIONS} value={analysedFilter} onChange={setAnalysedFilter} />
      </Section>

      <Section
        title="Energy"
        hint={`How driving a track is, 1 (calm) to 10 (peak), from its loudness and how busy it is. ${ratedCount} of ${tracks.length} tracks are rated${inEnergyRange !== null ? `; ${inEnergyRange} in this range` : ''}.`}
      >
        <EnergyRangePicker value={energyFilter} onChange={setEnergyFilter} />
      </Section>

      <Section
        title="Duplicates"
        hint={`The same song more than once — matching artist and title, or filename — in any folder or format. ${duplicateCount} tracks have a copy.`}
      >
        <Toggle on={duplicatesFilter} onChange={setDuplicatesFilter} label="Only tracks with a duplicate" />
      </Section>

      <Section
        title="Slow BPM"
        hint={
          slowestBpm > 0
            ? `Tracks analysed slower than ${slowestBpm} BPM — probably at half time (82.5 for 165). ${slowCount} now. Check them, then right-click → Refine BPM of all… → Double, or Measure it again. The limit is in Settings → Library.`
            : 'Off: no slowest tempo is set in Settings → Library.'
        }
      >
        <Toggle on={slowBpmFilter} onChange={setSlowBpmFilter} label="Only tracks below the slowest tempo" />
      </Section>

      <Section
        title="MCO tags"
        hint={`Tracks you haven't tagged in MCO yet: ${noTagsCount} have no Tags, ${noSubtagsCount} have no Subtags.`}
      >
        <Choice options={MCO_TAGS_OPTIONS} value={mcoTagsFilter} onChange={setMcoTagsFilter} />
      </Section>

      <Section
        title="Missing ID3 Metadata"
        hint={`Tracks whose file has no artist or no title in its tags — only the filename to go by. Select one to see tags suggested from its filename. ${missingMetadataCount} tracks${tagReadRemaining > 0 ? ` so far (still reading tags from ${tagReadRemaining} files)` : ''}.`}
      >
        <Toggle on={missingMetadataFilter} onChange={setMissingMetadataFilter} label="Only tracks missing an artist or title" />
      </Section>

      <Section
        title="Not Locally Available"
        hint={`Tracks that are only in the cloud (e.g. Google Drive), not downloaded to this Mac yet — they're downloaded when you play or analyse them. ${cloudOnlyCount} tracks.`}
      >
        <Toggle on={cloudOnlyFilter} onChange={setCloudOnlyFilter} label="Only tracks not downloaded yet" />
      </Section>

      <Section
        title="Missing Tracks"
        hint={`Tracks whose file is no longer in the collection folder (deleted, moved, renamed or not synced). Their tags are kept, and they come back if the file returns to the same place. ${missingTracks.length} tracks.`}
      >
        <Toggle on={missingTracksFilter} onChange={setMissingTracksFilter} label="Show the missing tracks instead" />
      </Section>
    </div>
  )
}
