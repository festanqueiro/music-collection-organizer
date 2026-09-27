// src/components/FxGroups.tsx
//
// The FX and Live screens' effects, in three clearly separate groups:
// Music FX (on the playing track), Mic FX (on your voice) and Instruments
// (sound sources of their own, like the Dub Siren). Each group has its own
// header and colour stripe, so it's obvious which knobs touch what.
import type { ReactNode } from 'react'
import { useCollectionStore } from '../state/store'
import { FxPanel, InstrumentsPanel } from './FxPanel'
import { MicPanel } from './MicPanel'
import type { Track } from '../types'

function FxGroup({ icon, title, hint, color, children }: { icon: string; title: string; hint: string; color: string; children: ReactNode }) {
  return (
    <section style={{ minWidth: 0, borderLeft: `3px solid ${color}`, paddingLeft: '12px' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '18px', color, alignSelf: 'center' }}>
          {icon}
        </span>
        <h3 style={{ margin: 0, fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase', color }}>{title}</h3>
        <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>{hint}</span>
      </header>
      {children}
    </section>
  )
}

// `columns` (the FX screen): the three groups side by side, equal widths.
// `stacked` (the Live screen, next to the queue): one above the other.
export function FxGroups({ track, layout = 'columns' }: { track: Track | null; layout?: 'columns' | 'stacked' }) {
  const micOn = useCollectionStore((s) => s.micSettings.enabled)
  return (
    // Columns: three equal ones on a wide screen, fewer (then one) as it narrows.
    <div
      style={{
        padding: '16px',
        display: 'grid',
        gridTemplateColumns: layout === 'columns' ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr',
        alignItems: 'start',
        gap: layout === 'columns' ? '16px' : '22px',
      }}
    >
      <FxGroup icon="music_note" title="Music FX" hint="On the playing track" color="var(--color-accent)">
        <FxPanel track={track} />
      </FxGroup>
      <FxGroup
        icon="mic"
        title="Mic FX"
        hint={micOn ? 'On your voice — recorded; heard only with Hear myself' : 'Switch the Mic on to use your voice'}
        color="var(--color-cue)"
      >
        <MicPanel track={track} />
      </FxGroup>
      <FxGroup icon="campaign" title="Instruments" hint="Played over the music" color="var(--color-secondary)">
        <InstrumentsPanel />
      </FxGroup>
    </div>
  )
}
