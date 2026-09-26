// The right end of the player bar, in this order: Cast — set apart, since
// it changes where the sound goes rather than opening a view — then the
// full-screen views: Visualizer, FX and Queue.
import { useCollectionStore, type PlayerScreen } from '../state/store'
import { activeEffects } from '../cast/fxIndicators'
import { CastButton } from './CastButton'
import { barButtonStyle } from './playerBarStyles'

function ScreenButton({
  screen,
  icon,
  label,
  badge,
  lit = false,
}: {
  screen: PlayerScreen
  icon: string
  label: string
  badge?: string
  lit?: boolean
}) {
  const open = useCollectionStore((s) => s.playerScreen === screen)
  const togglePlayerScreen = useCollectionStore((s) => s.togglePlayerScreen)
  return (
    <button
      onClick={() => togglePlayerScreen(screen)}
      title={open ? `Close ${label}` : `Open ${label}`}
      aria-pressed={open}
      style={barButtonStyle(open, lit)}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
        {icon}
      </span>
      {label}
      {badge && <span style={{ color: 'var(--color-text-dim)', fontVariantNumeric: 'tabular-nums' }}>{badge}</span>}
    </button>
  )
}

// hasTrack: the visualizer needs something playing.
export function PlayerScreenButtons({ hasTrack }: { hasTrack: boolean }) {
  const queued = useCollectionStore((s) => s.playlist.length)
  // Lit while any effect is audibly engaged, so it's visible from here.
  const fxActive = useCollectionStore((s) => activeEffects(s.effectsSettings, s.sirenTriggered).length > 0)
  const setVisualizerOpen = useCollectionStore((s) => s.setVisualizerOpen)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
      <CastButton />
      <span style={{ width: '1px', height: '20px', background: 'var(--color-border)', margin: '0 4px' }} />
      <button
        onClick={(e) => {
          setVisualizerOpen(true)
          // Otherwise focus stays on this button behind the overlay, and
          // the Space shortcut (which ignores focused buttons) stops
          // toggling play/pause while the visualizer is up.
          e.currentTarget.blur()
        }}
        disabled={!hasTrack}
        title={hasTrack ? 'Open the visualizer (full screen, or on the TV while casting)' : 'Play a track to open the visualizer'}
        style={barButtonStyle(false)}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
          graphic_eq
        </span>
        Visualizer
      </button>
      <ScreenButton screen="fx" icon="tune" label="FX" lit={fxActive} />
      <ScreenButton screen="queue" icon="queue_music" label="Queue" badge={queued > 0 ? String(queued) : undefined} />
    </div>
  )
}
