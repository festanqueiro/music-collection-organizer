// src/components/detail/CoverSection.tsx
import { useSectionOpen, DetailSection } from './DetailSection'

// The cover embedded in the file.
export function CoverSection({ artworkUrl }: { artworkUrl: string | null }) {
  const [open, toggleOpen] = useSectionOpen('cover')
  return (
    <DetailSection title="Cover" open={open} onToggle={toggleOpen}>
      {artworkUrl ? (
        <img
          src={artworkUrl}
          alt="Album artwork"
          style={{ display: 'block', width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: '6px' }}
        />
      ) : (
        <div style={{ color: 'var(--color-text-dim)' }}>No cover in this file</div>
      )}
    </DetailSection>
  )
}
