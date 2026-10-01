// Words that depend on the operating system (macOS first, Windows too —
// ADR 0049). window.api is missing in tests, which read as macOS.
const platform = typeof window !== 'undefined' ? window.api?.platform : undefined

export const isWindows = platform === 'win32'

// The file manager's own name for "show this file".
export const REVEAL_IN_FILE_MANAGER = isWindows ? 'Show in File Explorer' : 'Show in Finder'
