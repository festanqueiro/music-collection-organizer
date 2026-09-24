import { useEffect, useMemo, useRef, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { findDuplicateGroups, displayName } from '../state/duplicates'
import { decodeHtmlEntities, formatDuration } from '../format'
import type { Track } from '../types'

function formatSize(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

// Left-panel "Duplicates" view. Lists groups of likely duplicates (see
// state/duplicates.ts) and filters the track table to them: all
// duplicates by default, or one group once it's clicked. MCO never
// deletes files — "Show in Finder" is the way to remove a copy — but
// "Merge tags" gives every copy in a group all of the group's tags, so
// nothing is lost whichever copy is kept.
export function DuplicatesPanel({ onFilterChange }: { onFilterChange: (filter: (track: Track) => boolean) => void }) {
  const tracks = useCollectionStore((s) => s.tracks)
  const trackTags = useCollectionStore((s) => s.trackTags)
  const mergeTagsAcross = useCollectionStore((s) => s.mergeTagsAcross)
  const showToast = useCollectionStore((s) => s.showToast)
  // App passes a fresh onFilterChange every render; reading it through a
  // ref keeps the filter effect below from re-running (and re-rendering
  // App) in a loop.
  const onFilterChangeRef = useRef(onFilterChange)
  onFilterChangeRef.current = onFilterChange

  const groups = useMemo(() => findDuplicateGroups(tracks), [tracks])

  // Keyed by the group's track ids rather than its index, so a rescan that
  // reshuffles the groups doesn't leave a different group selected.
  const groupKeys = useMemo(() => groups.map((g) => g.map((t) => t.id).join(',')), [groups])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selectedIndex = selectedKey ? groupKeys.indexOf(selectedKey) : -1
  const selectedGroup = selectedIndex === -1 ? null : selectedIndex

  // Only re-filter when the set of shown ids actually changes (a tag edit
  // re-runs `groups` without changing membership).
  const shownIdsKey =
    selectedGroup !== null ? groupKeys[selectedGroup] : groupKeys.join(',')
  useEffect(() => {
    const ids = new Set(shownIdsKey ? shownIdsKey.split(',').map(Number) : [])
    onFilterChangeRef.current((track) => ids.has(track.id))
  }, [shownIdsKey])

  function tagCount(trackId: number): number {
    const tags = trackTags.get(trackId)
    return (tags?.genreIds.length ?? 0) + (tags?.subgenreIds.length ?? 0)
  }

  if (groups.length === 0) {
    return <p style={{ color: 'var(--color-text-dim)', fontSize: '13px' }}>No duplicates found.</p>
  }

  return (
    <div style={{ fontSize: '13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ color: 'var(--color-text-dim)' }}>
          {groups.length} group{groups.length === 1 ? '' : 's'} of likely duplicates
        </span>
        {selectedGroup !== null && (
          <button style={{ fontSize: '12px' }} onClick={() => setSelectedKey(null)}>
            Show all
          </button>
        )}
      </div>
      {groups.map((group, index) => {
        const selected = index === selectedGroup
        const tagsDiffer = new Set(group.map((t) => JSON.stringify(trackTags.get(t.id) ?? null))).size > 1
        return (
          <div
            key={groupKeys[index]}
            style={{
              border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
              borderRadius: '6px',
              padding: '6px 8px',
              marginBottom: '6px',
            }}
          >
            <div
              onClick={() => setSelectedKey(selected ? null : groupKeys[index])}
              style={{ cursor: 'pointer', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title="Show this group in the table"
            >
              {decodeHtmlEntities(displayName(group[0]))}
            </div>
            {group.map((t) => (
              <div
                key={t.id}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-dim)', fontSize: '12px' }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.path}>
                  {t.format.toUpperCase()} · {formatSize(t.size)}
                  {t.duration ? ` · ${formatDuration(t.duration)}` : ''}
                  {tagCount(t.id) > 0 ? ` · ${tagCount(t.id)} tag${tagCount(t.id) === 1 ? '' : 's'}` : ''}
                </span>
                <button
                  title="Show in Finder"
                  onClick={() => window.api.showTrackInFolder(t.id)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                    folder_open
                  </span>
                </button>
              </div>
            ))}
            {tagsDiffer && (
              <button
                style={{ fontSize: '12px', marginTop: '4px' }}
                title="Give every copy all the tags any copy has"
                onClick={async () => {
                  await mergeTagsAcross(group.map((t) => t.id))
                  showToast('Tags merged across copies')
                }}
              >
                Merge tags
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
