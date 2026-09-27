// The Live screen (the player bar's Live button): everything for running a
// show on one screen — the queue on the left, the track's effects and the
// Mic (with its own effects) on the right. The Queue and FX screens still
// exist on their own.
import { useCollectionStore } from '../state/store'
import { activeEffects } from '../cast/fxIndicators'
import { PlaylistView } from './PlaylistView'
import { FxPanel } from './FxPanel'
import { MicPanel } from './MicPanel'
import { FitToArea } from './FitToArea'

export function LiveView() {
  const playlist = useCollectionStore((s) => s.playlist)
  const tracks = useCollectionStore((s) => s.tracks)
  const effectsSettings = useCollectionStore((s) => s.effectsSettings)
  const sirenTriggered = useCollectionStore((s) => s.sirenTriggered)
  const micOn = useCollectionStore((s) => s.micSettings.enabled)
  const micLive = useCollectionStore((s) => s.micLive)
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
          dashboard
        </span>
        <h3 style={{ margin: 0 }}>Live</h3>
        <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
          {active.length > 0 ? `Engaged: ${active.join(', ')}` : 'No effects engaged'}
          {' · '}
          {micOn ? (micLive ? 'Mic live' : 'Mic muted') : 'Mic off'}
        </span>
        <button
          onClick={() => setPlayerScreen(null)}
          title="Close Live"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ width: 'clamp(320px, 32%, 520px)', flexShrink: 0, borderRight: '1px solid var(--color-border)' }}>
          <PlaylistView embedded />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <FitToArea>
            <div>
              <FxPanel track={currentTrack} />
              <MicPanel track={currentTrack} />
            </div>
          </FitToArea>
        </div>
      </div>
    </div>
  )
}
