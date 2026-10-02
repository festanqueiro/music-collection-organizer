// Regenerates the website's screenshots and demo clips from the real app,
// driven by Playwright on a made-up demo collection. See README.md here.
//
//   npm run site:capture              everything (collection, library, shots, clips)
//   npm run site:capture -- shots     only screenshots (reuses the library)
//   npm run site:capture -- clips     only clips
//
// Linux: runs itself under xvfb-run (a 1600×1000 virtual screen) and records
// clips with ffmpeg's x11grab. macOS: the page is sized to 1600×1000 whatever
// the screen, and clips are recorded by Playwright (its own video of the page).
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { REPO, WORK, COLLECTION, WIDTH, HEIGHT, launch, freshDataFolder, saveLibrary, restoreLibrary, libraryReady } from './app.mjs'
import { setupLibrary } from './setup.mjs'

const OUT = path.join(REPO, 'website/assets')
const SHOTS = path.join(OUT, 'shots')
const CLIPS = path.join(OUT, 'clips')
const only = process.argv[2] // 'shots' | 'clips' | undefined

// Re-run under a virtual screen of exactly the window's size.
if (process.platform === 'linux' && !process.env.MCO_IN_XVFB) {
  const r = spawnSync('xvfb-run', ['-a', '-s', `-screen 0 ${WIDTH}x${HEIGHT}x24`, process.execPath, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, MCO_IN_XVFB: '1' },
  })
  process.exit(r.status ?? 1)
}

const log = (...a) => console.log('[capture]', ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- the demo collection and its library ----
if (!fs.existsSync(path.join(REPO, 'out/main/index.js'))) throw new Error('Build first: npx electron-vite build')
if (!fs.existsSync(COLLECTION)) {
  log('making the demo collection in', COLLECTION)
  const r = spawnSync('python3', [path.join(REPO, 'website/capture/make-demo-collection.py'), COLLECTION], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error('make-demo-collection.py failed')
}
if (!only || !libraryReady()) {
  log('scanning, analysing, tagging…')
  freshDataFolder()
  const { app, win } = await launch()
  await setupLibrary(win)
  await app.close()
  saveLibrary()
}

// ---- helpers ----
// A visible pointer that follows Playwright's mouse, and a ring on click.
const POINTER = `(() => {
  if (document.getElementById('capture-pointer')) return
  const p = document.createElement('div')
  p.id = 'capture-pointer'
  p.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.5 L12 13.5 L19 13.5 Z" fill="white" stroke="black" stroke-width="1.4" stroke-linejoin="round"/></svg>'
  Object.assign(p.style, { position: 'fixed', left: '-40px', top: '-40px', zIndex: 2147483647, pointerEvents: 'none', transition: 'none' })
  document.documentElement.appendChild(p)
  addEventListener('mousemove', (e) => { p.style.left = e.clientX - 3 + 'px'; p.style.top = e.clientY - 2 + 'px' }, true)
  addEventListener('mousedown', (e) => {
    const r = document.createElement('div')
    Object.assign(r.style, { position: 'fixed', left: e.clientX - 14 + 'px', top: e.clientY - 14 + 'px', width: '28px', height: '28px',
      borderRadius: '50%', border: '2px solid #4fd1c5', zIndex: 2147483646, pointerEvents: 'none', transition: 'transform .35s, opacity .35s' })
    document.documentElement.appendChild(r)
    requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0' })
    setTimeout(() => r.remove(), 400)
  }, true)
})()`

function helpers(win) {
  const pointer = { x: WIDTH / 2, y: HEIGHT / 2 }
  async function moveTo(locator) {
    const box = await locator.boundingBox()
    if (!box) throw new Error('not visible: ' + locator)
    const x = box.x + Math.min(box.width / 2, 40)
    const y = box.y + box.height / 2
    await win.mouse.move(x, y, { steps: 18 })
    Object.assign(pointer, { x, y })
    await sleep(180)
  }
  return {
    async click(locator, opts) {
      await moveTo(locator)
      await locator.click(opts)
      await sleep(350)
    },
    async rightClick(locator) {
      await moveTo(locator)
      await locator.click({ button: 'right' })
      await sleep(400)
    },
    async type(locator, text) {
      await this.click(locator)
      await locator.pressSequentially(text, { delay: 90 })
    },
    moveTo,
    btn: (re) => win.getByRole('button', { name: re }).first(),
    row: (title) => win.locator('tr.track-row', { hasText: title }).first(),
    view: (label) => win.locator(`button[title="${label}"]:visible`).first(),
    tag: (name) => win.locator('label').filter({ has: win.locator('span', { hasText: new RegExp(`^${name}$`) }) }).locator('input[type=checkbox]').first(),
  }
}

async function open({ video } = {}) {
  restoreLibrary()
  const { app, win } = await launch({ video })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setPosition(0, 0))
  // A Mac screen is usually smaller than the window: size the page itself.
  if (process.platform === 'darwin') await win.setViewportSize({ width: WIDTH, height: HEIGHT })
  await win.reload()
  await win.waitForLoadState('domcontentloaded')
  await sleep(2500)
  await win.evaluate(POINTER)
  const h = helpers(win)
  // The sidebar remembers its view; start each session on Folders.
  await h.view('Folders').click()
  await sleep(300)
  await win.mouse.move(WIDTH * 0.6, HEIGHT * 0.45)
  return { app, win, h }
}

const shot = (win, name) => win.screenshot({ path: path.join(SHOTS, `${name}.png`) })

// ---- screenshots ----
async function screenshots() {
  fs.mkdirSync(SHOTS, { recursive: true })
  const { app, win, h } = await open()
  await win.evaluate(() => document.getElementById('capture-pointer')?.remove())
  await h.row('Deep Water').locator('button[title="Play track now"]').click()
  await sleep(4000)
  await shot(win, 'library')

  await h.view('Tags').click()
  await h.tag('Dub').check()
  await h.tag('Dubstep').check()
  await sleep(800)
  await shot(win, 'tags')
  await h.tag('Dub').uncheck()
  await h.tag('Dubstep').uncheck()

  await win.getByText('Sunday Session', { exact: true }).click()
  await sleep(1200)
  await shot(win, 'playlists')
  await win.locator('[title="Back to All Tracks"], [title*="Clear"]').first().click().catch(() => {})
  await h.view('Folders').click()
  await win.getByText('All Tracks', { exact: true }).click().catch(() => {})

  await h.view('Filters').click()
  await win.locator('label', { hasText: 'Compatible' }).locator('input').first().check()
  await sleep(800)
  await shot(win, 'compatible')
  await win.locator('label', { hasText: 'Compatible' }).locator('input').first().uncheck()
  await h.view('Folders').click()

  await win.locator('button[title^="Stats"]').click()
  await sleep(1500)
  await shot(win, 'stats')
  await win.keyboard.press('Escape')
  await sleep(500)

  await h.btn(/\bFX$/).click()
  await sleep(1200)
  await shot(win, 'fx')
  await win.keyboard.press('Escape')
  await sleep(500)

  await h.btn(/\bLive$/).click()
  await sleep(1500)
  await shot(win, 'live')
  await win.locator('[title="Close Live"]').first().click()
  await sleep(500)

  // Hot cues: a cue being dragged, with the zoom open above the waveform.
  await h.row('Deep Water').locator('button[title="Play track now"]').click()
  await sleep(1500)
  const marker = win.locator('[title^="Hot cue C: drag"]').first()
  const box = await marker.boundingBox()
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await win.mouse.down()
  await win.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 10 })
  await sleep(1500)
  await shot(win, 'hotcues')
  await win.keyboard.press('Escape')
  await win.mouse.up()
  await sleep(300)

  await h.row('Harbour Lights').locator('button[title="Play track now"]').click()
  await sleep(800)
  await h.btn(/\bVisualizer$/).click()
  await sleep(5000)
  await shot(win, 'visualizer')
  await app.close()
}

// ---- clips ----
// Records the screen (Linux) or the page (macOS) while `run` drives the app, then makes an mp4
// (for the site) and a small gif (for READMEs and posts).
async function clip(name, run, { gifWidth = 800, crf = 24 } = {}) {
  fs.mkdirSync(CLIPS, { recursive: true })
  const linux = process.platform === 'linux'
  const videoDir = path.join(WORK, 'video')
  fs.rmSync(videoDir, { recursive: true, force: true })
  const started = Date.now()
  const { app, win, h } = await open(linux ? {} : { video: videoDir })
  const raw = path.join(WORK, `${name}.mkv`)
  // Playwright's video starts at launch: skip to where `run` begins.
  const skip = ((Date.now() - started) / 1000 + 0.6).toFixed(2)
  const rec = linux
    ? spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30',
        '-video_size', `${WIDTH}x${HEIGHT}`, '-i', process.env.DISPLAY, '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', raw], { stdio: ['pipe', 'inherit', 'inherit'] })
    : null
  await sleep(600)
  try {
    await run(win, h)
  } finally {
    await sleep(800)
    if (rec) {
      rec.stdin.write('q')
      await new Promise((r) => rec.on('close', r))
    }
    await app.close()
  }
  if (!linux) {
    const webm = await win.video().path()
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', skip, '-i', webm, '-r', '30', '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', raw], { stdio: 'inherit' })
    if (r.status !== 0) throw new Error('ffmpeg failed on ' + webm)
    fs.rmSync(videoDir, { recursive: true, force: true })
  }
  const mp4 = path.join(CLIPS, `${name}.mp4`)
  const gif = path.join(CLIPS, `${name}.gif`)
  const poster = path.join(CLIPS, `${name}.jpg`)
  const ff = (...args) => {
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
    if (r.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' '))
  }
  ff('-i', raw, '-vf', 'scale=1280:-2:flags=lanczos', '-c:v', 'libx264', '-crf', String(crf), '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4)
  ff('-sseof', '-1.2', '-i', raw, '-frames:v', '1', '-vf', 'scale=1280:-2:flags=lanczos', '-q:v', '4', poster)
  ff('-i', raw, '-vf', `fps=12,scale=${gifWidth}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, gif)
  fs.rmSync(raw)
  log(`clip ${name}: ${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB mp4, ${(fs.statSync(gif).size / 1e6).toFixed(1)} MB gif`)
}

async function clips() {
  // Tags: tick a Tag, add a second, narrow with a Subtag-ish search.
  await clip('tags', async (win, h) => {
    await sleep(600)
    await h.click(h.view('Tags'))
    await sleep(500)
    await h.click(h.tag('Dub'))
    await sleep(1200)
    await h.click(h.tag('Jungle'))
    await sleep(1200)
    await h.type(win.locator('input[placeholder^="Search"]'), 'version')
    await sleep(1800)
  })

  // Playlists: check three songs, add them to a playlist, open it.
  await clip('playlists', async (win, h) => {
    await sleep(500)
    for (const title of ['Deep Water', 'Dreamer', 'Long Way Home (Dub)']) await h.click(h.row(title).locator('input[type=checkbox]'))
    await sleep(500)
    await h.rightClick(h.row('Dreamer'))
    await h.click(win.getByRole('button', { name: /Add all to playlist/ }))
    await sleep(500)
    await h.click(win.getByRole('button', { name: /Late Night 140/ }))
    await sleep(1400)
    await h.click(win.getByText('Late Night 140', { exact: true }))
    await sleep(2000)
  })

  // Harmonic mixing: play a song, show only what mixes with it.
  await clip('compatible', async (win, h) => {
    await sleep(500)
    await h.click(h.row('Deep Water').locator('button[title="Play track now"]'))
    await sleep(1200)
    await h.click(h.view('Filters'))
    await sleep(500)
    await h.click(win.locator('label', { hasText: 'Compatible' }).locator('input').first())
    await sleep(2500)
  })

  // Hot cues: jump between pads, take a suggested cue, drag one with the zoom.
  await clip('hotcues', async (win, h) => {
    await sleep(500)
    await h.click(h.row('Deep Water').locator('button[title="Play track now"]'))
    await sleep(1500)
    for (const pad of ['A', 'B', 'C']) {
      await h.click(win.getByRole('button', { name: `Hot cue ${pad} (set)` }))
      await sleep(1100)
    }
    await h.click(win.locator('button[aria-label^="Suggested cue at bar"]').first())
    await sleep(1400)
    const marker = win.locator('[title^="Hot cue C: drag"]').first()
    await h.moveTo(marker)
    const box = await marker.boundingBox()
    const y = box.y + box.height / 2
    await win.mouse.down()
    for (const dx of [30, 70, 50]) {
      await win.mouse.move(box.x + box.width / 2 + dx, y, { steps: 25 })
      await sleep(700)
    }
    await win.mouse.up()
    await sleep(1500)
  })

  // The visualizer, full screen, flicking through a few themes.
  await clip('visualizer', async (win, h) => {
    await h.click(h.row('Harbour Lights').locator('button[title="Play track now"]'))
    await sleep(800)
    await h.click(h.btn(/\bVisualizer$/))
    await sleep(4000)
    for (const key of ['2', '3', '4']) {
      await win.keyboard.press(key)
      await sleep(3000)
    }
  }, { gifWidth: 480, crf: 30 })

  // Stats: open it and scroll through.
  await clip('stats', async (win, h) => {
    await sleep(500)
    await h.click(win.locator('button[title^="Stats"]'))
    await sleep(1500)
    await win.mouse.move(WIDTH / 2, HEIGHT / 2, { steps: 10 })
    for (let i = 0; i < 6; i++) {
      await win.mouse.wheel(0, 260)
      await sleep(500)
    }
    await sleep(1200)
  })
}

if (only !== 'clips') {
  log('screenshots…')
  await screenshots()
}
if (only !== 'shots') {
  log('clips…')
  await clips()
}
log('done →', path.relative(REPO, OUT))
