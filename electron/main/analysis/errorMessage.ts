// Why analysing a track failed, in a line someone can act on — kept in
// tracks.analysis_error and shown in the table and the details panel.
// ffmpeg's errors carry its whole log; the useful part is usually its last
// line ("Invalid data found when processing input").

const KNOWN: [RegExp, string][] = [
  [/ENOENT|No such file or directory/i, "The file isn't there any more (moved, renamed or deleted)."],
  [/EACCES|EPERM|Permission denied/i, "MCO isn't allowed to read the file."],
  [/Invalid data found when processing input|moov atom not found|could not find codec parameters/i,
    "The file is damaged or isn't really audio — ffmpeg couldn't read it."],
  [/Resource deadlock avoided|EDEADLK|Operation timed out|ETIMEDOUT/i,
    "The file couldn't be read — if it's in Google Drive or iCloud, it may not be fully downloaded yet."],
  [/End-Of-Stream/i, "The file ends before it should — it's probably still syncing with the cloud. Try again once it's done."],
  [/does not contain any stream|Output file #0 does not contain any stream|no audio/i, 'The file has no audio in it.'],
]

export function describeAnalysisError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  for (const [pattern, text] of KNOWN) if (pattern.test(raw)) return text
  // Else the last non-empty line of the message (ffmpeg's log ends with the
  // reason), without ffmpeg's "[format @ 0x…]" prefix, kept short.
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const last = (lines.length > 1 ? lines[lines.length - 1] : lines[0] ?? '').replace(/^\[[^\]]*\]\s*/, '').replace(/^Error:\s*/, '')
  if (!last) return 'Analysis failed for an unknown reason.'
  return last.length > 200 ? last.slice(0, 197) + '…' : last
}
