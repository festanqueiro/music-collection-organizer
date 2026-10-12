import { app, BrowserWindow, dialog, Menu, net, protocol, session, shell } from 'electron'
import { dirname, join } from 'node:path'
import { hostname } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { openDatabase } from './db'
import { resetInterruptedAnalysis } from './analysis/queue'
import { registerIpcHandlers } from './ipc'
import { buildAppMenuTemplate } from './appMenu'
import {
  getCollectionFolder,
  getConfigFilePath,
  setLastBackupError,
  clearLastBackupError,
  getAutoCheckUpdates,
  getAppThemeId,
} from './config'
import { APP_THEME_ARG, getAppTheme } from '../../src/appThemes'
import { Updater, appBundlePathFromExecPath } from './updater'
import { getDbFilePath } from './dbPath'
import { getDataFolder } from './bootstrap'
import { clearOpenMarker, isOpenElsewhere, readOpenMarker, writeOpenMarker } from './openElsewhere'
import { mediaUrlToFilePath } from './mediaProtocol'
import { attachScreenWindowPolicy } from './screenWindow'
import { getPlayableFilePath, pruneMediaCache } from './audioTranscode'
import { getMediaCacheDir, getTagEditRecoveryDir } from './mediaCacheDir'
import { discardInterruptedTagWrite, interruptedTagWrites, restoreInterruptedTagWrite } from './tagWriter'
import { parseRangeHeader } from './rangeHeader'
import { mimeTypeFor } from './mediaTypes'
import { runBackupIfNeeded, getBackupFolder } from './backup'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// The app menu (About/Hide/Quit …) shows app.name, which is package.json's
// name — v1-library-organizer, or v1-library-organizer-beta for BETA. That
// name is also the userData folder (database, config, backups), so it
// can't just change: pin userData to where it is, then give the menus a
// readable name.
const userDataPath = app.getPath('userData')
app.setName(/-beta$/i.test(userDataPath) ? 'MCO BETA' : 'MCO')
app.setPath('userData', userDataPath)

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
  const theme = getAppTheme(getAppThemeId())
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    // Matches the theme's background (the startup loader's too), so
    // there's no flash of another colour before the first paint.
    backgroundColor: theme.background,
    webPreferences: {
      // The preload puts the theme on <html> before the page paints.
      additionalArguments: [`${APP_THEME_ARG}${theme.id}`],
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  currentWindow = mainWindow
  // The second screen is the only window MCO's page may open (ADR 0046).
  attachScreenWindowPolicy(mainWindow)
  // On macOS the app outlives its last window, and IPC work (e.g. an
  // analysis run) can still be reporting progress — clear the reference
  // so nothing tries to talk to a destroyed window.
  mainWindow.on('closed', () => {
    if (currentWindow === mainWindow) currentWindow = null
  })

  // The window only ever shows MCO's own page. Without this a file or a
  // link dropped outside a drop area would replace the app with it — and
  // that page would get the preload's API.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const samePage = (a: string) => a.split('#')[0]
    if (samePage(url) !== samePage(mainWindow.webContents.getURL())) event.preventDefault()
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
// device names without ever opening an input stream. A 'media' *request*
// (getUserMedia) is granted for audio only — the mic in record mode, only
// ever opened when the user switches the Mic on (audio/mic.ts). Camera
// stays denied. Opening a mic stream makes macOS switch Bluetooth
// headphones (AirPods, etc.) into their low-quality hands-free profile if
// the mic is theirs, which is why it never opens on its own.
function registerPermissionHandlers(): void {
  const grantedRequests = new Set(['midi', 'midiSysex'])
  const grantedChecks = new Set(['midi', 'midiSysex', 'media'])
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const mediaTypes = (details as { mediaTypes?: string[] }).mediaTypes ?? []
    const audioOnly = permission === 'media' && mediaTypes.length > 0 && mediaTypes.every((t) => t === 'audio')
    callback(grantedRequests.has(permission) || audioOnly)
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

  // A tag save cut short by a quit, a crash or a power cut: the file may be
  // half written, and its original is waiting. Asked, never done unasked —
  // MCO writes to an audio file only when told to.
  for (const write of interruptedTagWrites(getTagEditRecoveryDir())) {
    if (!write.changed) {
      discardInterruptedTagWrite(write)
      continue
    }
    const restore = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Put the Original Back', 'Keep the File As It Is'],
      defaultId: 0,
      cancelId: 1,
      message: 'MCO was closed while saving tags to a file',
      detail: `${write.path}\n\nThe file may be incomplete. MCO kept its original from before the save and can put it back; the tags you were saving will then be the old ones.`,
    })
    try {
      if (restore === 0) restoreInterruptedTagWrite(write)
      else discardInterruptedTagWrite(write)
    } catch (err) {
      dialog.showErrorBox('The original could not be put back', `${err instanceof Error ? err.message : String(err)}\n\nIt is kept at:\n${write.backupPath}`)
    }
  }

  // The data folder was moved somewhere of the user's (an external or a
  // synced drive) and the database isn't in it: not plugged in, or not
  // synced yet. Opening would quietly make a new, empty one there.
  const movedDataFolder = getDataFolder()
  if (movedDataFolder && !existsSync(getDbFilePath())) {
    const startEmpty = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Quit', 'Start With an Empty Collection'],
      defaultId: 0,
      cancelId: 0,
      message: "MCO's database isn't where it should be",
      detail: `No collection.db in ${movedDataFolder}.\n\nIf that folder is on a drive that isn't connected, or is still syncing, quit and try again when it is there. Starting empty makes a new database in that folder.`,
    })
    if (startEmpty !== 1) {
      app.quit()
      return
    }
  }

  // The same collection open on another computer (a data folder in a
  // synced folder): the two would overwrite each other's changes. A
  // warning when the other's note is there; see openElsewhere.ts.
  const dataFolder = dirname(getDbFilePath())
  const host = hostname()
  const other = readOpenMarker(dataFolder)
  if (isOpenElsewhere(other, host, Date.now())) {
    const openAnyway = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Quit', 'Open Anyway'],
      defaultId: 0,
      cancelId: 0,
      message: `This collection looks open on another computer (${other!.host})`,
      detail: 'Its data folder is shared between them. If both have it open, whichever syncs last replaces the other: tags, playlists and cues changed on one of them are lost.\n\nQuit MCO on the other computer, let the folder finish syncing, then open it here.',
    })
    if (openAnyway !== 1) {
      app.quit()
      return
    }
  }
  writeOpenMarker(dataFolder, host, Date.now())
  setInterval(() => writeOpenMarker(dataFolder, host, Date.now()), 60 * 1000)
  app.on('will-quit', () => clearOpenMarker(dataFolder, host))

  const db = openDatabase(getDbFilePath())
  resetInterruptedAnalysis(db)
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

  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildAppMenuTemplate({
        isMac: process.platform === 'darwin',
        isDev: !app.isPackaged,
        appName: app.name,
        send: (command) => {
          // With every window closed (macOS), the menu is still there:
          // nothing to act on until one is reopened.
          if (!currentWindow || currentWindow.isDestroyed()) return
          currentWindow.show()
          currentWindow.webContents.send('menu:command', command)
        },
        openUrl: (url) => void shell.openExternal(url),
        showCollectionFolder: () => {
          const folder = getCollectionFolder()
          if (folder) void shell.openPath(folder)
        },
      })
    )
  )

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
}).catch((err: unknown) => {
  // The database or the settings file couldn't be opened (a drive
  // unplugged, a damaged file): say so, rather than a Dock icon and no window.
  console.error('startup failed', err)
  const folder = (() => {
    try {
      return getDataFolder() ?? app.getPath('userData')
    } catch {
      return app.getPath('userData')
    }
  })()
  dialog.showErrorBox(
    'MCO could not start',
    `${err instanceof Error ? err.message : String(err)}\n\nIts data (collection.db, config.json) is in:\n${folder}\n\nIf that is on a drive that isn't connected, connect it and open MCO again. A damaged file can be replaced by one from the backups folder.`
  )
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
