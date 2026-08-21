import { app, BrowserWindow, net, protocol } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { openDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { getCollectionFolder, getConfigFilePath } from './config'
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
  } catch (err) {
    console.error('backup failed', err)
  }
}

// db, the backup check, and the hourly interval are created once here
// rather than inside createWindow() — createWindow() can run again (macOS's
// 'activate' event re-creates a window after the user closes all of them
// without quitting), and opening a second db handle / re-arming the
// interval on every call would be wasteful and confusing to reason about.
function createWindow(db: ReturnType<typeof openDatabase>): void {
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

  registerIpcHandlers(db, mainWindow, getBackupFolder(app.getPath('userData')))

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
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
  performBackupCheck(db)
  setInterval(() => performBackupCheck(db), 60 * 60 * 1000)

  createWindow(db)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(db)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
