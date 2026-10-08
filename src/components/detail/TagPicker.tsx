// src/components/detail/TagPicker.tsx
import { useId, useState } from 'react'

// One control for a track's genre/sub-genre/mood tags: badges for the
// currently-applied ones (each with an × to remove), and a single
// text input backed by a <datalist> of existing names — type to filter
// and pick from the dropdown, or type something new and press Enter/+Add
// to create it (then apply it) in one step. Replaces what used to be a
// full checkbox list per tag type plus a separate "new tag" input.
export function TagPicker({
  label,
  options,
  selectedIds,
  disabled,
  placeholder,
  onToggle,
  onCreate,
}: {
  label: string
  options: { id: number; name: string }[]
  selectedIds: number[]
  disabled?: boolean
  placeholder: string
  onToggle: (id: number) => void
  onCreate: (name: string) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const datalistId = useId()
  const selected = options.filter((o) => selectedIds.includes(o.id))

  async function submit() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    const existing = options.find((o) => o.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      if (!selectedIds.includes(existing.id)) onToggle(existing.id)
      setValue('')
      return
    }
    try {
      setError(null)
      await onCreate(trimmed)
      setValue('')
    } catch {
      setError('Could not create — name may already exist.')
    }
  }

  return (
    <div>
      <div style={{ fontWeight: 600, marginTop: '8px' }}>{label}</div>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', margin: '4px 0' }}>
          {selected.map((o) => (
            <span
              key={o.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: '2px 4px 2px 10px',
                fontSize: '12px',
              }}
            >
              {o.name}
              <button
                onClick={() => onToggle(o.id)}
                title={`Remove ${o.name}`}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0 2px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                  close
                </span>
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ marginTop: '4px' }}>
        <input
          type="text"
          list={datalistId}
          // A disabled picker (Subtag with no Tag yet) shows its placeholder,
          // never leftover text that would read like an assigned subtag.
          value={disabled ? '' : value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            padding: '4px 6px',
            color: 'var(--color-text)',
            fontSize: '12px',
            marginRight: '4px',
          }}
        />
        <datalist id={datalistId}>
          {options.map((o) => (
            <option key={o.id} value={o.name} />
          ))}
        </datalist>
        <button onClick={submit} disabled={disabled || !value.trim()}>
          + Add
        </button>
        {error && <div style={{ color: 'var(--color-secondary)' }}>{error}</div>}
      </div>
    </div>
  )
}
