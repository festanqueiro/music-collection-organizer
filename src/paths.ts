// File paths reach the renderer as the OS wrote them: "/Users/me/Music/a.mp3"
// on macOS, "C:\Users\me\Music\a.mp3" on Windows. These helpers split and
// compare them with the right separator for the path they're given.

export function pathSeparator(path: string): '/' | '\\' {
  return /^[A-Za-z]:\\|^\\\\/.test(path) ? '\\' : '/'
}

// The last segment: a file or folder's name ("a.mp3", "Music").
export function baseName(path: string): string {
  return path.split(pathSeparator(path)).filter(Boolean).pop() ?? path
}

// The folder a path is in, or the path itself at the root.
export function parentPath(path: string): string {
  const cut = path.lastIndexOf(pathSeparator(path))
  return cut > 0 ? path.slice(0, cut) : path
}

// `path` is `folder` itself or anywhere inside it.
export function isInFolder(path: string, folder: string): boolean {
  if (path === folder) return true
  const sep = pathSeparator(folder)
  return path.startsWith(folder.endsWith(sep) ? folder : folder + sep)
}
