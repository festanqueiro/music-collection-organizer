// Pure path resolution for the `media://` custom protocol (electron/main/index.ts
// registers the scheme and wires this into protocol.handle). Kept separate from
// Electron's protocol/net APIs so the containment check is unit-testable without
// a running app.
import { resolve, sep } from 'node:path'

// Renderer builds request URLs as `media://track/<encodeURIComponent(absolutePath)>`.
export function trackPathToMediaUrl(trackPath: string): string {
  return `media://track/${encodeURIComponent(trackPath)}`
}

// Resolves a `media://` request URL back to an absolute file path, but only if
// that path is inside the current collection folder — the renderer is untrusted,
// so this is what actually stops a compromised renderer from reading arbitrary
// files via this scheme.
export function mediaUrlToFilePath(url: string, collectionFolder: string | null): string | null {
  if (!collectionFolder) return null

  let encoded: string
  try {
    encoded = new URL(url).pathname.replace(/^\/+/, '')
  } catch {
    return null
  }

  let decoded: string
  try {
    decoded = decodeURIComponent(encoded)
  } catch {
    return null
  }

  const resolvedPath = resolve(decoded)
  const resolvedFolder = resolve(collectionFolder)
  const isInside =
    resolvedPath === resolvedFolder || resolvedPath.startsWith(resolvedFolder + sep)
  if (!isInside) return null

  return resolvedPath
}
