// The FX screen (the player bar's FX icon): every effect, full screen.
import { useCollectionStore } from '../state/store'
import { FxPanel } from './FxPanel'
import { activeEffects } from '../cast/fxIndicators'

export function FxView() {
  const playlist = useCollectionStore((s) => s.playlist)
  const tracks = useCollectionStore((s) => s.tracks)
  const effectsSettings = useCollectionStore((s) => s.effectsSettings)
  const sirenTriggered = useCollectionStore((s) => s.sirenTriggered)
  const setPlayerScreen = useCollectionStore((s) => s.setPlayerScreen)
  const currentTrack = playlist[0] != null ? (tracks.find((t) => t.id === playlist[0]) ?? null) : null
  const active = activeEffects(effectsSettings, sirenTriggered)

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-accent)' }}>
          tune
        </span>
        <h3 style={{ margin: 0 }}>Effects</h3>
        <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
          {active.length > 0 ? `Engaged: ${active.join(', ')}` : 'Nothing engaged'}
        </span>
        <button
          onClick={() => setPlayerScreen(null)}
          title="Close effects"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <FxPanel track={currentTrack} />
      </div>
    </div>
  )
}
