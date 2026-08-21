import { app, BrowserWindow, protocol } from 'electron'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReadStream, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { openDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { getCollectionFolder, getConfigFilePath, setLastBackupError, clearLastBackupError } from './config'
import { mediaUrlToFilePath } from './mediaProtocol'
import { getPlayableFilePath } from './audioTranscode'
import { getMediaCacheDir } from './mediaCacheDir'
import { parseRangeHeader } from './rangeHeader'
import { runBackupIfNeeded, getBackupFolder } from './backup'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Must run before app.whenReady() — Electron only honors privileged-scheme
// registration at module load time.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    // corsEnabled matters even though nothing actually cross-origin-fetches
    // this scheme: without it, Chromium treats media:// resources as
    // "tainted" for Web Audio API purposes, so createMediaElementSource
    // (used by the delay/reverb FX graph) silently outputs silence —
    // playback otherwise looks completely normal (play state, progress,
    // duration all work), just with no sound.
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      bypassCSP: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

const MEDIA_MIME_TYPES: Record<string, string> = {
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
}

function mimeTypeFor(filePath: string): string {
  return MEDIA_MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

function registerMediaProtocol(): void {
  protocol.handle('media', async (request) => {
    const filePath = mediaUrlToFilePath(request.url, getCollectionFolder())
    if (!filePath) return new Response('Not found', { status: 404 })

    // Chromium's <audio> element can't decode AIFF — transcode (and cache)
    // to a playable format first. Every other format passes through
    // unchanged.
    let playablePath: string
    try {
      playablePath = await getPlayableFilePath(filePath, getMediaCacheDir())
    } catch (err) {
      console.error('audio transcode failed', err)
      return new Response('Transcode failed', { status: 500 })
    }

    let fileSize: number
    try {
      fileSize = statSync(playablePath).size
    } catch {
      return new Response('Not found', { status: 404 })
    }

    // net.fetch(pathToFileURL(...)) was tried first, forwarding the
    // incoming Range header along — but Chromium's file:// loader doesn't
    // reliably honor Range on a forwarded request the way an http(s)
    // origin server would, so every seek came back as a fresh 200 OK from
    // byte 0 instead of a 206 Partial Content at the requested offset.
    // The <audio> element interprets that as "seeking isn't supported":
    // duration can get stuck at Infinity (so the progress bar/waveform
    // never animates) and any currentTime assignment effectively resets
    // to the start. Serving Range requests manually — reading exactly the
    // requested byte span off disk and returning a real 206 — is what
    // actually makes seeking (and duration/progress) work correctly.
    const rangeHeader = request.headers.get('range')
    const contentType = mimeTypeFor(playablePath)

    if (!rangeHeader) {
      const stream = createReadStream(playablePath)
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 200,
        headers: {
          'Content-Length': String(fileSize),
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
        },
      })
    }

    const range = parseRangeHeader(rangeHeader, fileSize)
    if (!range) {
      return new Response('Invalid Range', { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } })
    }
    const { start, end } = range

    const stream = createReadStream(playablePath, { start, end })
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Content-Type': contentType,
      },
    })
  })
}

function performBackupCheck(db: ReturnType<typeof openDatabase>): void {
  try {
    runBackupIfNeeded(db, getConfigFilePath(), getBackupFolder(app.getPath('userData')), new Date())
    clearLastBackupError()
  } catch (err) {
    console.error('backup failed', err)
    setLastBackupError(err instanceof Error ? err.message : String(err))
  }
}

// Tracks the currently-open window so registerIpcHandlers's dialog/event
// targets stay valid across a macOS 'activate' re-open — a captured
// BrowserWindow reference from the first createWindow() call would be a
// destroyed window object after the user closes it.
let currentWindow: BrowserWindow | null = null

// db, IPC handler registration, the backup check, and the hourly interval
// are all set up exactly once (in app.whenReady() below), not inside
// createWindow() — createWindow() can run again on macOS's 'activate'
// event (which re-creates a window after the user closes all of them
// without quitting), and both opening a second db handle and calling
// ipcMain.handle() a second time for the same channel would throw.
// onShown runs after the window actually paints, not before — so a
// (roughly daily) VACUUM INTO in performBackupCheck doesn't sit on the
// main thread ahead of first paint.
function createWindow(onShown?: () => void): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  currentWindow = mainWindow

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    onShown?.()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerMediaProtocol()

  const db = openDatabase(join(app.getPath('userData'), 'collection.db'))
  setInterval(() => performBackupCheck(db), 60 * 60 * 1000)

  registerIpcHandlers(db, () => currentWindow!, getBackupFolder(app.getPath('userData')))

  createWindow(() => performBackupCheck(db))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // A reopen after closing all windows is close enough to "on launch"
      // to also re-check the backup, in case the hourly timer hasn't
      // fired yet — shouldBackupToday's dedup makes this a no-op most of
      // the time anyway.
      createWindow(() => performBackupCheck(db))
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
