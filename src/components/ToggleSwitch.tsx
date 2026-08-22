// src/components/ToggleSwitch.tsx

// A pill-style on/off switch — used for each FX module's enabled state,
// placed next to its section title, instead of a plain checkbox.
export function ToggleSwitch({
  checked,
  onChange,
  title,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  title?: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      title={title}
      style={{
        width: '32px',
        height: '18px',
        borderRadius: '9px',
        border: '1px solid var(--color-border)',
        background: checked ? 'var(--color-accent)' : 'var(--color-surface)',
        position: 'relative',
        padding: 0,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '1px',
          left: checked ? '15px' : '1px',
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          background: checked ? 'var(--color-bg)' : 'var(--color-text-dim)',
          transition: 'left 100ms ease',
        }}
      />
    </button>
  )
}
