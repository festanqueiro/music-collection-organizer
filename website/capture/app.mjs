// Launches the built app (out/) on the demo collection with its own data
// folder, sized for screenshots. See website/capture/README.md.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const WORK = process.env.MCO_CAPTURE_DIR ?? path.join(REPO, 'website/capture/.work')
// The collection's path shows in the details panel, so somewhere that reads
// naturally: /Users/demo/Music when it can be made (a Linux container),
// else ~/Music. Override with MCO_DEMO_COLLECTION.
function collectionPath() {
  if (process.env.MCO_DEMO_COLLECTION) return process.env.MCO_DEMO_COLLECTION
  // macOS can't make /Users/demo without sudo; /Users/Shared keeps your
  // user name out of the screenshots.
  for (const base of ['/Users/demo/Music', '/Users/Shared/Music', path.join(process.env.HOME ?? WORK, 'Music')]) {
    try {
      fs.mkdirSync(base, { recursive: true })
      fs.accessSync(base, fs.constants.W_OK)
      return path.join(base, 'MCO Demo Collection')
    } catch {}
  }
  return path.join(WORK, 'MCO Demo Collection')
}
export const COLLECTION = collectionPath()
const DATA = path.join(WORK, 'xdg')
const PRISTINE = path.join(WORK, 'xdg-pristine')

// Playwright comes from the environment (npx playwright, or a global install).
function playwright() {
  const places = [REPO, process.env.PLAYWRIGHT_MODULE_DIR, '/root/node-tools/node_modules/'].filter(Boolean)
  for (const p of places) {
    try {
      return createRequire(path.join(p, 'x.js'))('playwright')
    } catch {}
  }
  throw new Error('Playwright not found: npm i -g playwright, or set PLAYWRIGHT_MODULE_DIR')
}

export function freshDataFolder() {
  fs.rmSync(DATA, { recursive: true, force: true })
  const dir = path.join(DATA, 'music-collection-organizer')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({
      collectionFolder: COLLECTION,
      // Columns worth showing off; Filename etc. hidden.
      columnOrder: ['title', 'artist', 'tags', 'subtags', 'bpm', 'musicalKey', 'duration', 'format', 'album', 'filename', 'bitrate', 'dateAdded', 'dateModified'],
      hiddenColumns: ['filename', 'bitrate', 'dateModified', 'album', 'duration', 'dateAdded', 'format'],
      autoCheckUpdates: false,
    })
  )
}

// After setup, the data folder is kept as it was, and every capture session
// starts from that copy — so clips that add to playlists don't leak into
// the next one, and re-running only the clips gives the same results.
export function saveLibrary() {
  fs.rmSync(PRISTINE, { recursive: true, force: true })
  fs.cpSync(DATA, PRISTINE, { recursive: true })
}
export const libraryReady = () => fs.existsSync(PRISTINE)
export function restoreLibrary() {
  fs.rmSync(DATA, { recursive: true, force: true })
  fs.cpSync(PRISTINE, DATA, { recursive: true })
}

export const WIDTH = 1600
export const HEIGHT = 1000

export async function launch({ video } = {}) {
  const { _electron } = playwright()
  const mac = process.platform === 'darwin'
  const app = await _electron.launch({
    // The electron package's main export is the binary's path, on any OS.
    executablePath: createRequire(path.join(REPO, 'x.js'))('electron'),
    // Software WebGL so the visualizer draws without a GPU (CI, xvfb). On a
    // Mac the GPU is there, and 1× pixels keep shots the same size as Linux's.
    args: ['.', '--no-sandbox', '--autoplay-policy=no-user-gesture-required',
      // XDG_CONFIG_HOME means nothing to a Mac app: point userData there.
      ...(mac ? ['--force-device-scale-factor=1', `--user-data-dir=${path.join(DATA, 'music-collection-organizer')}`] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])],
    cwd: REPO,
    env: { ...process.env, XDG_CONFIG_HOME: DATA },
    ...(video ? { recordVideo: { dir: video, size: { width: WIDTH, height: HEIGHT } } } : {}),
  })
  const win = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }, [w, h]) => {
    const b = BrowserWindow.getAllWindows()[0]
    // Linux shows Electron's menu bar inside the window; macOS doesn't.
    b.setMenuBarVisibility(false)
    b.setContentSize(w, h)
    b.center()
  }, [WIDTH, HEIGHT])
  await win.waitForLoadState('domcontentloaded')
  await win.evaluate(() => {
    localStorage.setItem(
      'mco-track-table-column-widths',
      JSON.stringify({ title: 190, artist: 130, tags: 110, subtags: 110, bpm: 56, musicalKey: 78, energy: 78, loudness: 64, gain: 104 })
    )
    // No MIDI learn badge next to every button.
    localStorage.setItem('showMidiControls', 'false')
  })
  return { app, win }
}
