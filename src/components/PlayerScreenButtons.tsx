// The right end of the player bar, in this order: Audio, Rec, Mic, Cast
// and Screen — set apart, since they route, record, add or send out the
// sound and picture rather than open a view —
// then the full-screen views: Visualizer, FX, Queue, and Live (queue, FX
// and mic together).
import { useCollectionStore, type PlayerScreen } from '../state/store'
import { activeEffects, activeMicEffects } from '../cast/fxIndicators'
import { castingToAScreen } from '../cast/castSession'
import { CastButton } from './CastButton'
import { RecordButton } from './RecordButton'
import { MicButton } from './MicButton'
import { AudioButton } from './AudioButton'
import { SecondScreenButton } from './SecondScreenButton'
import { barIconButtonStyle } from './playerBarStyles'

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
      aria-label={label}
      aria-pressed={open}
      style={barIconButtonStyle(open, lit)}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
        {icon}
      </span>
      {badge && <span style={{ color: 'var(--color-text-dim)', fontVariantNumeric: 'tabular-nums' }}>{badge}</span>}
    </button>
  )
}

// hasTrack: the visualizer needs something playing.
export function PlayerScreenButtons({ hasTrack }: { hasTrack: boolean }) {
  const queued = useCollectionStore((s) => s.playlist.length)
  // Lit while any effect is engaged — the music's or the mic's — so it's
  // visible from here.
  const fxActive = useCollectionStore(
    (s) => activeEffects(s.effectsSettings, s.sirenTriggered).length > 0 || activeMicEffects(s.micSettings).length > 0
  )
  const setVisualizerOpen = useCollectionStore((s) => s.setVisualizerOpen)
  const showToast = useCollectionStore((s) => s.showToast)
  // Lit while the mic is on, like FX while an effect is engaged.
  const micOn = useCollectionStore((s) => s.micSettings.enabled)
  // The TV's picture is picked in the Cast menu instead.
  const castingToScreen = useCollectionStore((s) => castingToAScreen(s.castStatus))
  return (
    // Two joined groups of icon buttons (names in the tooltips): where the
    // sound and picture go, then the views.
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
      <div className="bar-group" role="group" aria-label="Sound and picture">
        <AudioButton />
        <RecordButton />
        <MicButton />
        <CastButton />
        <SecondScreenButton />
      </div>
      <div className="bar-group" role="group" aria-label="Views">
      <button
        onClick={(e) => {
          if (castingToScreen) showToast('Go to the Cast menu to pick a visualizer')
          else setVisualizerOpen(true)
          // Otherwise focus stays on this button behind the overlay, and
          // the Space shortcut (which ignores focused buttons) stops
          // toggling play/pause while the visualizer is up.
          e.currentTarget.blur()
        }}
        disabled={!hasTrack}
        title={
          castingToScreen
            ? 'While casting, pick a visualizer in the Cast menu'
            : hasTrack
              ? 'Open the visualizer (full screen)'
              : 'Play a track to open the visualizer'
        }
        aria-label="Visualizer"
        // Looks off while casting, but still clicks, to say where it went.
        style={castingToScreen ? { opacity: 0.45 } : undefined}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
          graphic_eq
        </span>
      </button>
      <ScreenButton screen="fx" icon="tune" label="FX" lit={fxActive} />
      <ScreenButton screen="queue" icon="queue_music" label="Queue" badge={queued > 0 ? String(queued) : undefined} />
      <ScreenButton screen="live" icon="dashboard" label="Live" lit={micOn} />
      </div>
    </div>
  )
}
