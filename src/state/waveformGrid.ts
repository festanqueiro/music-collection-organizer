// The beat grid drawn over the player's whole-track waveform
// (docs/features/player.md): a line where a bar begins, counted from the
// start of the tune at the track's BPM, 4 beats a bar — the same grid the
// bar counter and the suggested cues use (src/state/hotCues.ts).
export interface GridLine {
  time: number
  bar: number
  // Where a 16-bar phrase begins (or, on a sparser grid, every fourth line).
  strong: boolean
}

// A whole track has hundreds of bars and the waveform a thousand pixels or
// so: every bar would be a wall of lines. The step doubles (1, 2, 4… bars)
// until there are no more than `maxLines`.
export function waveformGridLines(duration: number, bpm: number | null, start: number, maxLines = 128): GridLine[] {
  if (!bpm || !(bpm > 0) || !(duration > 0) || !(start < duration)) return []
  const bar = (4 * 60) / bpm
  const bars = Math.floor((duration - Math.max(0, start)) / bar)
  let step = 1
  while (bars / step > maxLines) step *= 2
  const phrase = Math.max(16, step * 4)
  const lines: GridLine[] = []
  for (let n = 0; n <= bars; n += step) {
    const time = start + n * bar
    if (time < 0 || time >= duration) continue
    lines.push({ time: Math.round(time * 1000) / 1000, bar: n, strong: n % phrase === 0 })
  }
  return lines
}
