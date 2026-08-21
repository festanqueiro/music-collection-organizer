import { app, BrowserWindow, net, protocol } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { openDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { getCollectionFolder, getConfigFilePath, setLastBackupError, clearLastBackupError } from './config'
import { mediaUrlToFilePath } from './mediaProtocol'
import { runBackupIfNeeded, getBackupFolder } from './backup'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Must run before app.whenReady() — Electron only honors privileged-scheme
// registration at module load time.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, stream: true, bypassCSP: true, supportFetchAPI: true }
  }
])

function registerMediaProtocol(): void {
  protocol.handle('media', async (request) => {
    const filePath = mediaUrlToFilePath(request.url, getCollectionFolder())
    if (!filePath) return new Response('Not found', { status: 404 })
    // Forward the incoming Range header so seeking in the <audio> element
    // gets a 206 Partial Content response instead of re-fetching the whole
    // file from byte 0 on every seek — matters for large lossless tracks.
    return net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers })
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
