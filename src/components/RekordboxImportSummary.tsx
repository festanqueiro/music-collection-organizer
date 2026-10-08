// src/components/RekordboxImportSummary.tsx
//
// What a Rekordbox import will do, shown before anything is written
// (docs/features/playlists.md): the totals, where the new playlists go, and
// tabs over one list — the playlists, the ones MCO already has, the songs
// found at another path, the ones no longer in the export.
import { useState } from 'react'
import type { PlaylistNode, RekordboxDuplicateAction, RekordboxImportChoices, RekordboxImportDestination, RekordboxImportPlan } from '../types'
import { baseName } from '../paths'
import { playlistFolders } from '../state/savedPlaylist'

export function RekordboxImportSummary({
  plan,
  choices,
  onChoices,
  nodes,
  destination,
  onDestination,
  rejected,
  onToggle,
  onSetAll,
  duplicateChoices,
  onDuplicateChoice,
}: {
  plan: RekordboxImportPlan
  choices: RekordboxImportChoices
  onChoices: (choices: RekordboxImportChoices) => void
  nodes: PlaylistNode[]
  destination: RekordboxImportDestination
  onDestination: (destination: RekordboxImportDestination) => void
  rejected: Set<string>
  onToggle: (from: string) => void
  onSetAll: (on: boolean) => void
  duplicateChoices: Record<string, RekordboxDuplicateAction>
  onDuplicateChoice: (key: string, action: RekordboxDuplicateAction) => void
}) {
  const duplicates = plan.playlists.filter((p) => p.duplicate)
  const refreshed = plan.playlists.filter((p) => p.refresh).length
  const fresh = plan.playlists.length - refreshed
  const relinked = plan.playlists.reduce((sum, p) => sum + p.relinked, 0)
  const missing = plan.songs - plan.matched - relinked
  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  // The box's folders as places to import into, each with the folders it
  // sits in. The Rekordbox folder is the first choice already.
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const folderPath = (node: PlaylistNode): string => [...playlistFolders(node, byId), node.name].join(' / ')
  const folders = nodes.filter((n) => n.kind === 'folder' && !(n.parentId === null && n.source === 'rekordbox' && n.name === 'Rekordbox'))
  // One list at a time, in a box of a fixed height, so the dialog stays
  // the same size however long an import is. It opens on the first list
  // that asks for a decision.
  type Tab = 'playlists' | 'duplicates' | 'relinks' | 'gone'
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'playlists' as const, label: 'Playlists', count: plan.playlists.length },
    { id: 'duplicates' as const, label: 'Already in MCO', count: duplicates.length },
    { id: 'relinks' as const, label: 'Different path', count: plan.relinks.length },
    { id: 'gone' as const, label: 'Not in this export', count: plan.gone.length },
  ].filter((t) => t.id === 'playlists' || t.count > 0)
  const [tab, setTab] = useState<Tab>(duplicates.length > 0 ? 'duplicates' : plan.relinks.length > 0 ? 'relinks' : 'playlists')
  const used = plan.relinks.filter((r) => !rejected.has(r.from)).length
  const note: React.CSSProperties = { fontSize: '11px', color: 'var(--color-text-dim)' }
  const ellipsis: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  const extras = plan.extras ?? null
  // With a collection export the playlists can be left out; a playlist file has nothing else.
  const takePlaylists = !extras || choices.playlists
  const choice = (key: keyof RekordboxImportChoices, label: string, detail: string, available: boolean) => (
    <label key={key} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', opacity: available ? 1 : 0.5 }}>
      <input
        type="checkbox"
        checked={choices[key] && available}
        disabled={!available}
        onChange={(e) => onChoices({ ...choices, [key]: e.target.checked })}
        style={{ marginTop: '3px' }}
      />
      <span>
        <span style={{ color: 'var(--color-text)' }}>{label}</span>
        <span style={{ display: 'block', ...note }}>{detail}</span>
      </span>
    </label>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {extras && (
        // A collection export holds more than playlists: take what's wanted.
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingBottom: '10px', borderBottom: '1px solid var(--color-border)' }}>
          <strong style={{ color: 'var(--color-text)' }}>What to import</strong>
          {choice('playlists', 'Playlists', `${count(plan.playlists.length, 'playlist')}${plan.folders > 0 ? ` in ${count(plan.folders, 'folder')}` : ''} — the details are below.`, true)}
          {choice(
            'cues',
            'Hot cues, memory cues and loops',
            extras.cues.songs > 0
              ? `${count(extras.cues.cues, 'cue')} on ${count(extras.cues.songs, 'song')} with none in MCO yet.${extras.cues.skipped > 0 ? ` ${count(extras.cues.skipped, 'song')} that already ${extras.cues.skipped === 1 ? 'has' : 'have'} cues in MCO ${extras.cues.skipped === 1 ? 'is' : 'are'} left as ${extras.cues.skipped === 1 ? 'it is' : 'they are'}.` : ''}`
              : extras.cues.skipped > 0
                ? `Nothing to bring: the ${count(extras.cues.skipped, 'song')} with cues in Rekordbox already ${extras.cues.skipped === 1 ? 'has' : 'have'} cues in MCO.`
                : 'No cues in this export for songs in your collection.',
            extras.cues.songs > 0
          )}
          {choice(
            'bpm',
            'BPM',
            extras.bpm.songs > 0
              ? `Rekordbox’s BPM for ${count(extras.bpm.songs, 'song')} where MCO has none or a different one. It replaces MCO’s and is kept when the song is analysed again.`
              : 'Nothing to bring: MCO’s BPMs match Rekordbox’s.',
            extras.bpm.songs > 0
          )}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', ...(takePlaylists ? {} : { opacity: 0.4, pointerEvents: 'none' }) }} aria-hidden={!takePlaylists}>
      <p style={{ margin: 0 }}>
        {count(plan.playlists.length, 'playlist')}
        {plan.folders > 0 ? ` in ${count(plan.folders, 'folder')}` : ''} — {fresh} new
        {refreshed > 0 ? `, ${refreshed} to refresh` : ''}.{fresh === 0 ? ' They’re refreshed where they are.' : ''}
      </p>
      {fresh > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 8px' }}>
          <label htmlFor="import-destination" style={{ flexShrink: 0 }}>
            New ones go in
          </label>
          <select
            id="import-destination"
            value={destination.kind === 'folder' ? String(destination.id) : destination.kind}
            onChange={(e) => {
              const value = e.target.value
              if (value === 'rekordbox' || value === 'top') onDestination({ kind: value })
              else if (value === 'new') onDestination({ kind: 'new', name: '' })
              else onDestination({ kind: 'folder', id: Number(value) })
            }}
            style={{ flex: 1, minWidth: 0, fontSize: '12px' }}
          >
            <option value="rekordbox">The Rekordbox folder</option>
            <option value="top">The top level (no folder)</option>
            {folders.length > 0 && (
              <optgroup label="Your folders">
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {folderPath(f)}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="new">A new folder…</option>
          </select>
          {destination.kind === 'new' && (
            <input
              autoFocus
              value={destination.name}
              placeholder="Folder name"
              aria-label="New folder name"
              onChange={(e) => onDestination({ kind: 'new', name: e.target.value })}
              // Keep the table's shortcuts (Space, P…) out of the field.
              onKeyDown={(e) => e.key !== 'Escape' && e.stopPropagation()}
              style={{ flexBasis: '100%', height: '24px', padding: '0 6px' }}
            />
          )}
        </div>
      )}
      <p style={{ margin: 0 }}>
        {count(plan.songs, 'song')}: {plan.matched} found in your collection
        {relinked > 0 ? `, ${relinked} at a different path` : ''}
        {missing > 0 && (
          <>
            ,{' '}
            <span
              title="Outside the collection folder, not scanned yet, or — from a .txt — a different title or artist"
              style={{ color: 'var(--color-cue)' }}
            >
              {missing} not found (left out)
            </span>
          </>
        )}
        .
      </p>
      {refreshed > 0 && (
        <p style={{ margin: 0 }}>Refreshed playlists get Rekordbox's songs; changes you made to them in MCO are replaced.</p>
      )}
      <div>
        <div role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', borderBottom: '1px solid var(--color-border)' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${tab === t.id ? 'var(--color-accent)' : 'transparent'}`,
                borderRadius: 0,
                padding: '4px 0',
                marginBottom: '-1px',
                fontSize: '12px',
                color: tab === t.id ? 'var(--color-text)' : 'var(--color-text-dim)',
                cursor: 'pointer',
              }}
            >
              {t.label} <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.7 }}>{t.count}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '30px', ...note }}>
          {tab === 'playlists' && <span>Songs found{relinked > 0 ? ' + at a different path' : ''} / songs in the playlist. ↻ is a refresh.</span>}
          {tab === 'duplicates' && (
            // Playlists MCO already seems to have — same name or same songs.
            <span>Updating links MCO’s playlist to Rekordbox: it stays where it is, and importing again refreshes it.</span>
          )}
          {tab === 'relinks' && (
            // An old USB stick's paths, a moved file: the same song in the
            // collection, used only if left ticked — and remembered.
            <>
              <span style={{ flex: 1 }}>
                The same song in your collection — {used} of {plan.relinks.length} used.
              </span>
              <button onClick={() => onSetAll(true)} style={{ fontSize: '11px' }}>
                All
              </button>
              <button onClick={() => onSetAll(false)} style={{ fontSize: '11px' }}>
                None
              </button>
            </>
          )}
          {tab === 'gone' && <span>Imported before and no longer in Rekordbox’s export. They’re kept; delete them yourself if you want.</span>}
        </div>
        <div
          role="tabpanel"
          style={{
            height: '240px',
            overflowY: 'auto',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '4px 8px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {tab === 'playlists' &&
            plan.playlists.map((p, i) => (
              <div key={i} title={p.name} style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
                <span style={ellipsis}>
                  {p.name}
                  {p.refresh ? ' ↻' : ''}
                </span>
                <span style={{ color: p.matched + p.relinked < p.songs ? 'var(--color-cue)' : 'var(--color-text-dim)', flexShrink: 0 }}>
                  {p.matched}
                  {p.relinked > 0 ? ` + ${p.relinked}` : ''}/{p.songs}
                </span>
              </div>
            ))}
          {tab === 'duplicates' &&
            duplicates.map((p) => {
              const d = p.duplicate!
              const why = [
                d.sameName ? 'same name' : null,
                d.songs === 'same' ? 'same songs' : d.songs === 'most' ? `mostly the same songs (${d.shared} shared)` : `${d.shared} of its ${d.mcoSongs} songs shared`,
              ]
                .filter(Boolean)
                .join(', ')
              return (
                <div key={p.key} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 0' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', ...ellipsis }}>{p.name}</span>
                    <span style={{ display: 'block', ...note }}>
                      MCO’s “{d.name}”: {why}
                    </span>
                  </span>
                  <select
                    aria-label={`What to do with ${p.name}`}
                    value={duplicateChoices[p.key] ?? 'new'}
                    onChange={(e) => onDuplicateChoice(p.key, e.target.value as RekordboxDuplicateAction)}
                    style={{ fontSize: '12px', flexShrink: 0 }}
                  >
                    <option value="skip">Skip — keep MCO’s</option>
                    <option value="new">Import as a new playlist</option>
                    <option value="update">Update MCO’s with these songs</option>
                  </select>
                </div>
              )
            })}
          {tab === 'relinks' &&
            plan.relinks.map((r) => (
              <label
                key={r.from}
                title={`${r.from}\n→ ${r.to}`}
                style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '3px 0', cursor: 'pointer' }}
              >
                <input type="checkbox" checked={!rejected.has(r.from)} onChange={() => onToggle(r.from)} style={{ marginTop: '2px' }} />
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ ...ellipsis, color: 'var(--color-text-dim)' }}>{baseName(r.from)}</span>
                  <span style={ellipsis}>
                    → {r.label} <span style={note}>({r.reason})</span>
                  </span>
                </span>
              </label>
            ))}
          {tab === 'gone' &&
            plan.gone.map((name) => (
              <div key={name} title={name} style={ellipsis}>
                {name}
              </div>
            ))}
        </div>
      </div>
      </div>
    </div>
  )
}
