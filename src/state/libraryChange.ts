// Toast text for a background scan triggered by the folder watcher, e.g.
// "3 new tracks, 1 missing". Empty when nothing actually changed.
export function describeLibraryChange(result: { inserted: number; updated: number; missing: number }): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const parts: string[] = []
  if (result.inserted) parts.push(plural(result.inserted, 'new track'))
  if (result.updated) parts.push(plural(result.updated, 'changed track'))
  if (result.missing) parts.push(`${result.missing} missing`)
  return parts.join(', ')
}
