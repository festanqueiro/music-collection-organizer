import { watch as fsWatch, type FSWatcher } from 'node:fs'
import { extname } from 'node:path'
import { AUDIO_EXTENSIONS } from './folderWalk'

// Watches the collection folder so new/removed/replaced audio files show
// up without clicking "Update Collection". fs.watch is recursive here
// (FSEvents on macOS), and every burst of changes — copying in an album
// fires dozens of events, a cloud sync many more — is debounced into one
// callback, which runs an ordinary scan (see ipc.ts).

// The app's own data folder (collection.db, config.json) lives inside the
// collection by default and is written constantly — changes there must
// never trigger a scan, or every DB write would schedule another one.
const DATA_FOLDER = '.mco'

// `filename` is relative to the watched folder, and null when the OS
// doesn't say which file changed — treated as relevant, since it may well
// be an audio file. `event` is fs.watch's 'rename' (something appeared,
// disappeared, or moved) or 'change' (contents modified).
export function isRelevantChange(filename: string | null | undefined, event: string = 'rename'): boolean {
  if (filename == null) return true
  const parts = filename.split(/[\\/]/)
  if (parts.includes(DATA_FOLDER)) return false
  const base = parts[parts.length - 1]
  // The watched folder itself.
  if (base === '' || base === '.') return false
  // macOS resource forks / Finder metadata, and partial downloads.
  if (base.startsWith('._') || base === '.DS_Store') return false
  const ext = extname(base).toLowerCase()
  // A folder added, removed, or moved as a whole (how albums usually
  // arrive) only reports the folder's own path, so an extensionless
  // 'rename' counts. A 'change' on a folder just means something inside
  // it changed — macOS's FSEvents reports those too — and the file that
  // actually changed gets its own event if it matters.
  if (ext === '') return event === 'rename'
  return AUDIO_EXTENSIONS.has(ext)
}

type WatchFn = (
  folder: string,
  options: { recursive: boolean },
  listener: (event: string, filename: string | Buffer | null) => void
) => FSWatcher

export class FolderWatcher {
  private watcher: FSWatcher | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private folder: string | null = null

  constructor(
    private readonly opts: {
      debounceMs: number
      onChange: () => void
      watch?: WatchFn
    }
  ) {}

  get watchedFolder(): string | null {
    return this.folder
  }

  start(folder: string): void {
    if (this.folder === folder && this.watcher) return
    this.stop()
    const watch = this.opts.watch ?? (fsWatch as unknown as WatchFn)
    try {
      this.watcher = watch(folder, { recursive: true }, (event, filename) => {
        const name = filename == null ? null : String(filename)
        if (isRelevantChange(name, event)) this.schedule()
      })
    } catch (err) {
      // e.g. the folder is on a drive that isn't mounted right now — the
      // manual "Update Collection" still works.
      console.error('could not watch collection folder', folder, err)
      return
    }
    this.watcher.on('error', (err) => {
      console.error('collection folder watcher stopped', err)
      this.stop()
    })
    this.folder = folder
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.watcher?.close()
    this.watcher = null
    this.folder = null
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.opts.onChange()
    }, this.opts.debounceMs)
  }
}
