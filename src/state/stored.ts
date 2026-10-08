// Small things remembered on this computer between sessions (a view, a
// width, a switch): the window's localStorage. Reading or writing it can
// throw — a private window, storage turned off, Vitest's node environment —
// and none of these are worth failing over, so both are quiet about it:
// a value that can't be read is the fallback, one that can't be written is
// just not remembered.
//
// Not for anything that must survive: these aren't in MCO's backups.

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not remembered.
  }
}

// A switch stored as 'true' or 'false'; anything else is the fallback.
export function readStoredFlag(key: string, fallback: boolean): boolean {
  const stored = readStored(key)
  return stored === 'true' ? true : stored === 'false' ? false : fallback
}
