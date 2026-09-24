import { app, BrowserWindow, net, protocol, session } from 'electron'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReadStream, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { openDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import {
  getCollectionFolder,
  getConfigFilePath,
  setLastBackupError,
  clearLastBackupError,
  getAutoCheckUpdates,
} from './config'
import { Updater, appBundlePathFromExecPath } from './updater'
import { getDbFilePath } from './dbPath'
import { mediaUrlToFilePath } from './mediaProtocol'
import { getPlayableFilePath, pruneMediaCache } from './audioTranscode'
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

// First automatic update check waits until well after launch (nothing
// competes with first paint or a startup backup), then repeats.
const UPDATE_CHECK_DELAY_MS = 20 * 1000
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

// Only the installed release app updates itself. `npm run dev` isn't an
// app bundle, and the BETA app (npm run dist:beta) is a local build that
// a release would silently replace.
function updatesDisabledReason(): string | null {
  if (process.platform !== 'darwin') return 'Automatic updates are only available on macOS.'
  if (!app.isPackaged) return 'Automatic updates are only available in the installed app.'
  if (/beta/i.test(app.getName()) || /-beta$/i.test(app.getPath('userData'))) {
    return "BETA builds don't update themselves — rebuild with npm run dist:beta."
  }
  return null
}

// Transcoded-AIFF cache cap (see pruneMediaCache).
const MEDIA_CACHE_MAX_BYTES = 10 * 1024 ** 3

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
  // On macOS the app outlives its last window, and IPC work (e.g. an
  // analysis run) can still be reporting progress — clear the reference
  // so nothing tries to talk to a destroyed window.
  mainWindow.on('closed', () => {
    if (currentWindow === mainWindow) currentWindow = null
  })

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

// Electron requires an explicit grant for permission-gated renderer APIs —
// without this, navigator.requestMIDIAccess() (the MIDI-learn feature)
// silently rejects, with no dialog and no visible error beyond a console
// message. Confirmed via a direct CDP check against a real running
// instance: a plain requestMIDIAccess() call with no sysex option still
// requests the 'midiSysex' permission type in this Electron/Chromium
// version, not 'midi' — granting only 'midi' left the request denied.
// Both are granted here even though this app never actually sends/
// receives sysex (only Control Change messages for knob mapping) — it's
// what the permission model in this version requires for
// requestMIDIAccess() to succeed at all. Everything else is explicitly
// denied, since this app has no other use for camera/geolocation/
// notifications/etc. Both handler types are set because Chromium checks
// some permission-gated APIs via a synchronous check
// (setPermissionCheckHandler) and others via the asynchronous
// prompt-style request (setPermissionRequestHandler), depending on the
// API.
//
// 'media' is granted to permission *checks* only, never to *requests*.
// enumerateDevices() consults the check to decide whether to expose real
// output device labels/IDs (and AudioContext.setSinkId() needs those IDs),
// so granting it there gives the Settings → Audio output picker real
// device names without ever opening an input stream. Requests
// (getUserMedia — mic/camera) stay denied: this app never records, and
// merely opening a mic stream makes macOS switch Bluetooth headphones
// (AirPods, etc.) into their low-quality hands-free profile, which is
// audible as a sudden drop in playback quality.
function registerPermissionHandlers(): void {
  const grantedRequests = new Set(['midi', 'midiSysex'])
  const grantedChecks = new Set(['midi', 'midiSysex', 'media'])
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(grantedRequests.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return grantedChecks.has(permission)
  })
}

app.whenReady().then(() => {
  registerPermissionHandlers()
  registerMediaProtocol()

  // Nothing is transcoding yet at this point, so it's safe to clear
  // leftover .tmp files along with evicting old FLACs.
  try {
    pruneMediaCache(getMediaCacheDir(), MEDIA_CACHE_MAX_BYTES)
  } catch (err) {
    console.error('media cache prune failed', err)
  }

  const db = openDatabase(getDbFilePath())
  setInterval(() => performBackupCheck(db), 60 * 60 * 1000)

  const updater = new Updater({
    currentVersion: app.getVersion(),
    arch: process.arch,
    disabledReason: updatesDisabledReason(),
    appPath: appBundlePathFromExecPath(process.execPath),
    tempDir: app.getPath('temp'),
    fetch: (url, init) => net.fetch(url, init),
    onState: (state) => {
      if (currentWindow && !currentWindow.isDestroyed()) currentWindow.webContents.send('updates:state', state)
    },
    quit: () => app.quit(),
  })
  setTimeout(() => {
    if (getAutoCheckUpdates()) updater.check()
  }, UPDATE_CHECK_DELAY_MS)
  setInterval(() => {
    if (getAutoCheckUpdates()) updater.check()
  }, UPDATE_CHECK_INTERVAL_MS)

  registerIpcHandlers(db, () => currentWindow, getBackupFolder(app.getPath('userData')), updater)

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
