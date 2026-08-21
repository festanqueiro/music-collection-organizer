// Path resolution for the `media://` custom protocol (electron/main/index.ts
// registers the scheme and wires this into protocol.handle). Kept separate from
// Electron's protocol/net APIs so the containment check is unit-testable without
// a running app.
import { resolve, sep } from 'node:path'
import { realpathSync } from 'node:fs'

export { trackPathToMediaUrl } from '../../src/media'

// Resolves a `media://` request URL back to an absolute file path, but only if
// that path is inside the current collection folder — the renderer is
// untrusted, so this is what actually stops a compromised renderer from
// reading arbitrary files via this scheme. Resolves symlinks (realpathSync)
// before the containment check, not just `path.resolve` (which is purely
// lexical): otherwise a symlink placed inside the collection folder pointing
// outside it would pass a lexical check while net.fetch happily follows it at
// the OS level. A path that doesn't exist on disk (or a broken symlink) is
// rejected the same as one outside the folder — both end up as a 404.
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

  let realPath: string
  let realFolder: string
  try {
    realPath = realpathSync(resolve(decoded))
    realFolder = realpathSync(resolve(collectionFolder))
  } catch {
    return null
  }

  const isInside = realPath === realFolder || realPath.startsWith(realFolder + sep)
  if (!isInside) return null

  return realPath
}
