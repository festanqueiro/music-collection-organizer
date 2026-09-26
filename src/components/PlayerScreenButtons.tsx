// The player bar's Queue and FX icons: each opens its own full-screen
// view (PlaylistView / FxView), and closes it again when it's open.
import { useCollectionStore, type PlayerScreen } from '../state/store'
import { activeEffects } from '../cast/fxIndicators'

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
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        fontSize: '12px',
        border: open ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
        background: open ? 'var(--color-selected)' : 'var(--color-surface-raised)',
        color: open || lit ? 'var(--color-accent)' : 'var(--color-text)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
        {icon}
      </span>
      {label}
      {badge && <span style={{ color: 'var(--color-text-dim)', fontVariantNumeric: 'tabular-nums' }}>{badge}</span>}
    </button>
  )
}

export function PlayerScreenButtons() {
  const queued = useCollectionStore((s) => s.playlist.length)
  // Lit while any effect is audibly engaged, so it's visible from here.
  const fxActive = useCollectionStore((s) => activeEffects(s.effectsSettings, s.sirenTriggered).length > 0)
  return (
    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
      <ScreenButton screen="queue" icon="queue_music" label="Queue" badge={queued > 0 ? String(queued) : undefined} />
      <ScreenButton screen="fx" icon="tune" label="FX" lit={fxActive} />
    </div>
  )
}
