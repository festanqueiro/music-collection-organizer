// Settings → Appearance → Theme: one card per theme, each drawn in its own
// colours (data-theme scopes that theme's palette to the card — see
// src/themes.css), dark themes on the first row and light on the second.
import { useCollectionStore } from '../../state/store'
import { APP_THEMES, type AppTheme } from '../../appThemes'

function ThemeCard({ theme, selected, onSelect }: { theme: AppTheme; selected: boolean; onSelect: () => void }) {
  return (
    <button
      data-theme={theme.id}
      onClick={onSelect}
      aria-pressed={selected}
      title={theme.name}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '8px',
        textAlign: 'left',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        border: selected ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
        // Keep the text from shifting by the border's extra pixel.
        margin: selected ? 0 : '1px',
        borderRadius: '8px',
      }}
    >
      {/* A tiny app: a sidebar, a selected row and a play button. */}
      <div style={{ display: 'flex', gap: '4px', height: '44px' }}>
        <div style={{ width: '22%', background: 'var(--color-surface)', borderRadius: '3px' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ height: '8px', background: 'var(--color-surface-raised)', borderRadius: '2px' }} />
          <div
            style={{
              height: '8px',
              background: 'color-mix(in srgb, var(--color-accent) 22%, transparent)',
              borderRadius: '2px',
            }}
          />
          <div style={{ height: '8px', background: 'var(--color-surface-raised)', borderRadius: '2px' }} />
        </div>
        <div style={{ alignSelf: 'flex-end', width: '14px', height: '14px', borderRadius: '50%', background: 'var(--color-accent)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 500 }}>
        {theme.name}
        {/* Always laid out, so the selected card isn't taller than the rest. */}
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '16px', lineHeight: 1, color: 'var(--color-accent)', visibility: selected ? 'visible' : 'hidden' }}
        >
          check_circle
        </span>
      </div>
    </button>
  )
}

export function ThemePicker() {
  const appTheme = useCollectionStore((s) => s.appTheme)
  const setAppTheme = useCollectionStore((s) => s.setAppTheme)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
      {[true, false].flatMap((dark) =>
        APP_THEMES.filter((theme) => theme.dark === dark).map((theme) => (
          <ThemeCard key={theme.id} theme={theme} selected={theme.id === appTheme} onSelect={() => setAppTheme(theme.id)} />
        )),
      )}
    </div>
  )
}
