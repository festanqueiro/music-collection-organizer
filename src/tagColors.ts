// The colours offered for tags (genres), one per hue round the wheel.
// All dark enough for the white text on the tag chips in the track table.
export const TAG_COLORS = [
  '#dc2626', // red
  '#ea580c', // orange
  '#ca8a04', // amber
  '#65a30d', // lime
  '#16a34a', // green
  '#0d9488', // teal
  '#0891b2', // cyan
  '#2563eb', // blue
  '#4f46e5', // indigo
  '#7c3aed', // violet
  '#c026d3', // fuchsia
  '#db2777', // pink
]

// The colour a new tag gets: the palette colour the fewest tags already
// use (the first such one, so a fresh collection goes round in order).
export function nextTagColor(usedColors: (string | null)[]): string {
  const uses = new Map(TAG_COLORS.map((c) => [c, 0]))
  for (const color of usedColors) {
    const key = color?.toLowerCase()
    if (key && uses.has(key)) uses.set(key, uses.get(key)! + 1)
  }
  const fewest = Math.min(...uses.values())
  return TAG_COLORS.find((c) => uses.get(c) === fewest)!
}
