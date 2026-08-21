// Parses an HTTP Range request header (e.g. "bytes=200-499", "bytes=200-",
// "bytes=-500") against a known file size. Pure/no I/O so it's directly
// testable — the byte-offset arithmetic here is exactly the kind of thing
// that's easy to get subtly wrong (off-by-one on `end`, an open-ended
// suffix range, an out-of-bounds start).
export function parseRangeHeader(header: string, fileSize: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) return null

  const [, startStr, endStr] = match
  // "bytes=-500" (a suffix range) means "the last 500 bytes" — start is
  // derived from the end of the file, not from startStr (which is empty).
  const start = startStr ? parseInt(startStr, 10) : Math.max(0, fileSize - parseInt(endStr, 10))
  const end = endStr && startStr ? Math.min(parseInt(endStr, 10), fileSize - 1) : fileSize - 1

  if (start >= fileSize || start > end) return null

  return { start, end }
}
