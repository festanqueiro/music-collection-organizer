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

// `grow`/`basis`: side by side as columns on a wide screen (the Mic, with
// the most cards, twice as wide), wrapping to rows on a narrow one.
function FxGroup({ icon, title, hint, color, grow, children }: { icon: string; title: string; hint: string; color: string; grow: number; children: ReactNode }) {
  return (
    <section style={{ flex: `${grow} 1 ${grow * 260}px`, minWidth: 0, borderLeft: `3px solid ${color}`, paddingLeft: '12px' }}>
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

export function FxGroups({ track }: { track: Track | null }) {
  const micOn = useCollectionStore((s) => s.micSettings.enabled)
  return (
    <div style={{ padding: '16px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '16px' }}>
      <FxGroup icon="music_note" title="Music FX" hint="On the playing track" color="var(--color-accent)" grow={1}>
        <FxPanel track={track} />
      </FxGroup>
      <FxGroup
        icon="mic"
        title="Mic FX"
        hint={micOn ? 'On your voice — recorded; heard only with Hear myself' : 'Switch the Mic on to use your voice'}
        color="var(--color-cue)"
        grow={2}
      >
        <MicPanel track={track} />
      </FxGroup>
      <FxGroup icon="campaign" title="Instruments" hint="Played over the music" color="var(--color-secondary)" grow={1}>
        <InstrumentsPanel />
      </FxGroup>
    </div>
  )
}
