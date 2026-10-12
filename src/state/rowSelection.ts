// Selecting rows in the track table without checkboxes (ADR 0068): a click
// selects one row, shift extends from the anchor, ⌘ (Ctrl on Windows) adds
// or takes out a row. Pure, over the ids in table order.

// The rows from `anchorId` to `toId`, both included, in table order; null
// when either isn't listed (the caller then selects the one row).
export function rangeBetween(order: number[], anchorId: number | null, toId: number): number[] | null {
  if (anchorId === null) return null
  const from = order.indexOf(anchorId)
  const to = order.indexOf(toId)
  if (from === -1 || to === -1) return null
  return from <= to ? order.slice(from, to + 1) : order.slice(to, from + 1)
}

// ⌘-click on `clickedId`: the selection with that row added, or taken out
// if it was in. `selected` is the rows selected together (empty when only
// one is, which is then `singleId`). In table order, rows no longer listed
// last.
export function toggleInSelection(order: number[], selected: Set<number>, singleId: number | null, clickedId: number): number[] {
  const next = new Set(selected)
  if (next.size === 0 && singleId !== null) next.add(singleId)
  if (next.has(clickedId)) next.delete(clickedId)
  else next.add(clickedId)
  const listed = order.filter((id) => next.has(id))
  const listedSet = new Set(listed)
  return [...listed, ...[...next].filter((id) => !listedSet.has(id))]
}

// Whether a key press belongs to what has the focus rather than to the
// table: a field being typed in, a menu being chosen from, a slider. A
// button or a tick box keeps the focus after a click and uses none of the
// table's keys.
export function keysBelongToFocus(target: { tagName: string; type?: string; isContentEditable?: boolean } | null): boolean {
  if (!target) return false
  if (target.isContentEditable) return true
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true
  if (target.tagName !== 'INPUT') return false
  return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes((target.type ?? 'text').toLowerCase())
}
