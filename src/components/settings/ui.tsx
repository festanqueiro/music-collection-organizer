// The building blocks every Settings page is made of, so they all look
// and space the same.
import type { ReactNode } from 'react'
import { ToggleSwitch } from '../ToggleSwitch'

export function Page({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <header>
        <h2 style={{ margin: 0, fontSize: '16px' }}>{title}</h2>
        {description && <Hint style={{ marginTop: '4px' }}>{description}</Hint>}
      </header>
      {children}
    </div>
  )
}

// One group of related settings, in a card.
export function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontWeight: 500 }}>{title}</h3>
        {description && <Hint style={{ marginTop: '4px' }}>{description}</Hint>}
      </div>
      {children}
    </section>
  )
}

export function Hint({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <p style={{ margin: 0, color: 'var(--color-text-dim)', lineHeight: 1.5, ...style }}>{children}</p>
}

// Feedback after an action (exported to…, imported…, failed…).
export function Message({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <p style={{ margin: 0, color: error ? 'var(--color-error)' : 'var(--color-text-dim)', wordBreak: 'break-all' }}>
      {children}
    </p>
  )
}

// A file or folder location, selectable so it can be copied.
export function PathText({ children }: { children: ReactNode }) {
  return (
    <code
      style={{
        display: 'block',
        padding: '6px 8px',
        borderRadius: '4px',
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: '11px',
        wordBreak: 'break-all',
        userSelect: 'text',
      }}
    >
      {children}
    </code>
  )
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '16px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span>
        {label}
        {hint && <Hint style={{ marginTop: '2px' }}>{hint}</Hint>}
      </span>
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} title={label} />
    </label>
  )
}

export function ButtonRow({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>{children}</div>
}
