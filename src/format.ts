// src/format.ts
// Reused across calls instead of creating a fresh element per call — this
// runs on every title/artist/album cell render, so a table with hundreds
// of rows would otherwise churn through hundreds of detached DOM nodes on
// every re-render.
let entityDecoderEl: HTMLTextAreaElement | null = null

// Decodes HTML entities (e.g. "Rock &amp; Roll" -> "Rock & Roll") for
// *display* only — some tag-writing tools leave ID3 text fields HTML-
// encoded. Never write the decoded value back to the file or DB; this is
// purely how it's rendered on screen. Delegates to the browser's own HTML
// parser (via a detached <textarea>) rather than a hand-rolled entity
// table, so every named/numeric entity Chromium recognizes is covered.
export function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text // cheap bailout for the common case
  if (!entityDecoderEl) entityDecoderEl = document.createElement('textarea')
  entityDecoderEl.innerHTML = text
  return entityDecoderEl.value
}

export function formatDate(epochMs: number | null): string {
  if (!epochMs) return '—'
  return new Date(epochMs).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDuration(totalSeconds: number): string {
  const total = Math.round(totalSeconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}
