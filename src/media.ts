// Shared with electron/main/mediaProtocol.ts, which is the only thing that
// decodes this URL back to a file path. Kept dependency-free (no Node/Electron
// imports) so it can be imported directly from the renderer.
export function trackPathToMediaUrl(trackPath: string): string {
  return `media://track/${encodeURIComponent(trackPath)}`
}
