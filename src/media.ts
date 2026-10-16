// Shared with electron/main/mediaProtocol.ts, which is the only thing that
// decodes this URL back to a file path. Kept dependency-free (no Node/Electron
// imports) so it can be imported directly from the renderer.
//
// `version` (the file's mtime) goes in the query, which the protocol ignores:
// Chromium's media cache reuses what it fetched for a URL for minutes without
// asking again, so after a tag edit rewrote the file (new size, bytes moved)
// the player mixed old and new bytes under the same URL and stalled. A
// changed file now gets a new URL.
export function trackPathToMediaUrl(trackPath: string, version?: number): string {
  const url = `media://track/${encodeURIComponent(trackPath)}`
  return version == null ? url : `${url}?v=${version}`
}
