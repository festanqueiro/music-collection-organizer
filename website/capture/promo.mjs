// A promo video of MCO, recorded from the real app on the demo collection:
//
//   npx electron-vite build
//   node website/capture/promo.mjs ~/Desktop/MCO-promo.mp4 [--music file --music-start 93]
//
// The script — the scenes and the words shown in each — is promo.md, next
// to this file, with how it's made and what to watch for. This file is what
// happens in each scene; the words are read from there. What is drawn
// around and over the app (the window frame, the zooms, the words above
// it) is promoStage.js. The frames come from Chromium's own screencast and
// ffmpeg puts them together. It writes nothing to website/assets.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { COLLECTION, REPO, WORK, launch, libraryReady, restoreLibrary } from './app.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args.splice(i, 2)[1] : fallback
}
// The soundtrack: any audio file, from `--music-start` seconds in.
// Without one, a demo track.
const music = option('music', path.join(COLLECTION, 'Bandcamp', 'Dub & Steppers', 'Amber Riddim - Basement (Dub).aiff'))
const musicStart = Number(option('music-start', 0))
const out = path.resolve(args[0] ?? path.join(WORK, 'MCO-promo.mp4'))

// The words of each scene, from promo.md: under a "## id" heading, the
// lines that start with ">".
const script = new Map()
{
  let id = null
  for (const line of fs.readFileSync(new URL('./promo.md', import.meta.url), 'utf8').split('\n')) {
    const heading = /^## ([a-z]+)\s*$/.exec(line)
    if (heading) id = heading[1]
    else if (/^## /.test(line)) id = null
    else if (id && line.startsWith('> ')) script.set(id, [...(script.get(id) ?? []), line.slice(2).trim()])
  }
}
const words = (id) => {
  const lines = script.get(id)
  if (!lines?.length) throw new Error(`promo.md has no words for the scene "${id}"`)
  return lines
}

const ffmpeg = createRequire(path.join(REPO, 'x.js'))('ffmpeg-static')
if (!libraryReady()) throw new Error('No demo library yet: run npm run test:app once (it prepares it)')
if (!fs.existsSync(music)) throw new Error(`No such soundtrack: ${music}`)
restoreLibrary()

const frames = path.join(WORK, 'promo-frames')
fs.rmSync(frames, { recursive: true, force: true })
fs.mkdirSync(frames, { recursive: true })

const { app, win } = await launch()
const sleep = (ms) => win.waitForTimeout(ms)
await win.waitForSelector('text=PLAYLISTS', { timeout: 30000 })
await sleep(1500)

// ---- the stage: the frame around the app, and what is drawn over it ----
await win.evaluate(fs.readFileSync(new URL('./promoStage.js', import.meta.url), 'utf8'))
const stage = (method, ...values) => win.evaluate(([m, v]) => window.promo[m](...v), [method, values])
const accents = await win.evaluate(() => window.promo.accents)
// A scene opens with its colour and its words.
const scene = async (id, color) => {
  await stage('spot', null)
  await stage('accent', accents[color])
  await stage('caption', words(id)[0])
  await sleep(500)
}

// ---- recording: Chromium's screencast, a JPEG per painted frame ----
const cdp = await win.context().newCDPSession(win)
const shots = []
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const file = path.join(frames, `f${String(shots.length).padStart(6, '0')}.jpg`)
  fs.writeFileSync(file, Buffer.from(data, 'base64'))
  shots.push({ file, t: metadata.timestamp })
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})

// ---- helpers for driving the app ----
// Where things are is always asked of the page as it is now, zoomed or not.
const box = async (locator) => {
  await locator.first().scrollIntoViewIfNeeded()
  return locator.first().boundingBox()
}
const centre = async (locator) => {
  const b = await box(locator)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
const move = (x, y) => win.mouse.move(x, y, { steps: 26 })
const click = async (locator, options) => {
  const { x, y } = await centre(locator)
  await move(x, y)
  await sleep(160)
  await win.mouse.click(x, y, options)
}
const rowOf = (title) => win.locator(`td:has-text("${title}")`).first()
// The whole app in its frame, or closer on something.
const home = async () => { await stage('spot', null); await stage('home'); await sleep(1000) }
const zoomTo = async (locator, scale) => {
  const { x, y } = await centre(locator)
  await stage('zoomAt', x, y, scale)
  await sleep(1050)
}
// The marching frame around one thing, or around several taken together,
// grown downwards by `extra` pixels of the page as it is shown.
const spot = async (locators, extra = 0) => {
  const boxes = []
  for (const l of [locators].flat()) boxes.push(await l.first().boundingBox())
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.width))
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + extra
  const height = Math.min(bottom, (await win.evaluate(() => innerHeight)) - 12) - y
  await stage('spot', { x, y, width: right - x, height })
  await sleep(450)
}
const header = (name) => win.locator(`th:has-text("${name}")`).first()

// ---- title: the card alone, then the app arrives in its frame ----
await stage('away', true)
await stage('card', words('title')[0], words('title').slice(1))
await sleep(900)
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 1 })
await sleep(3200)
await stage('card', null)
await stage('away', false)
await sleep(1100)

// collection
await scene('collection', 'yellow')
await move(...Object.values(await centre(rowOf('Cold Fire (Dub)'))))
for (let i = 0; i < 3; i++) { await win.mouse.wheel(0, 240); await sleep(360) }
for (let i = 0; i < 3; i++) { await win.mouse.wheel(0, -240); await sleep(240) }
await zoomTo(header('Key'), 1.7)
await spot([header('BPM'), header('Volume Score')], 520)
await sleep(2400)
await home()

// tags
await scene('tags', 'pink')
await click(win.locator('button[aria-label="Tags"]'))
await sleep(600)
await click(win.locator('text=Dubstep').first())
await sleep(700)
await zoomTo(header('Subtags'), 1.7)
await spot([header('Tags'), header('Subtags')], 520)
await sleep(2200)
await home()
await click(win.locator('button[aria-label="Folders"]'))
await sleep(300)

// details: the playlists a track is in, and the tracks that go with it
await scene('details', 'blue')
const inSeveral = await win.evaluate(async () => {
  let best = null
  for (const t of await window.api.getTracks()) {
    const n = (await window.api.getTrackPlaylistIds(t.id)).length
    if (!best || n > best.n) best = { title: t.title, n }
  }
  return best
})
await click(rowOf(inSeveral.title))
await sleep(800)
const section = (name) => win.locator(`button[aria-expanded]:has-text("${name}")`).first()
// Up the panel, so the zoom has the whole section rather than its top edge.
await section('Playlists').evaluate((el) => el.scrollIntoView({ block: 'center' }))
await sleep(400)
await zoomTo(section('Playlists'), 2.3)
await spot(section('Playlists').locator('xpath=..'), 60 + inSeveral.n * 46)
await sleep(2400)
await stage('spot', null)
await section('Similar tracks').evaluate((el) => el.scrollIntoView({ block: 'start' }))
await sleep(400)
await zoomTo(section('Similar tracks'), 2.3)
await spot(section('Similar tracks').locator('xpath=..'), 330)
await sleep(2800)

// player
await scene('player', 'lime')
await home()
await click(rowOf('Basement (Dub)'), { button: 'right' })
await sleep(450)
await click(win.locator('button:has-text("Play track now")'))
await win.waitForSelector('button[aria-label="Hot cue A (set)"]', { timeout: 15000 })
await sleep(900)
await click(win.locator('button[aria-label="Larger player"]'))
await sleep(900)
await zoomTo(win.locator('svg[preserveAspectRatio="none"]'), 1.6)
await sleep(900)
await click(win.locator('button[aria-label="Hot cue B (set)"]'))
await sleep(1100)
await click(win.locator('button[aria-label="Hot cue C (set)"]'))
await sleep(1100)
await click(win.locator('button[aria-label="Hot cue A (set)"]'))
await sleep(900)

// convert
await scene('convert', 'orange')
await home()
await click(rowOf('Bassline Science'), { button: 'right' })
await sleep(800)
await click(win.locator('button:has-text("Convert to…")'))
await sleep(700)
await zoomTo(win.locator('[role="dialog"]'), 1.75)
await sleep(2800)
await win.keyboard.press('Escape')
await sleep(300)

// playlists
await scene('playlists', 'pink')
await home()
await click(win.locator('text=Sunday Session').first())
await sleep(500)
await zoomTo(win.locator('text=Jungle Selects').first(), 2.2)
await sleep(900)
await click(win.locator('button[aria-label="Search playlists"]'))
await sleep(400)
await win.keyboard.type('late', { delay: 140 })
await sleep(1500)
await win.keyboard.press('Escape')
await sleep(300)

// The demo tracks are 48 s long: the first has about played out by now, and
// the screens that follow need one playing.
await home()
await click(rowOf('Basement (Dub)'), { button: 'right' })
await sleep(350)
await click(win.locator('button:has-text("Play track now")'))
await sleep(600)

// effects
await scene('effects', 'red')
await click(win.locator('button[aria-label="FX"]'))
await sleep(700)
await stage('zoomAt', 800, 360, 1.4)
await sleep(2600)
await home()
await click(win.locator('button[aria-label="FX"]'))
await sleep(400)

// visualizer
await stage('caption', '')
const visualizerOpen = () =>
  win.waitForFunction(() => [...document.querySelectorAll('select')].some((s) => [...s.options].some((o) => o.value === 'tangle')), null, { timeout: 5000 })
await click(win.locator('button[aria-label="Visualizer"]'))
await visualizerOpen().catch(async () => {
  // The first click can land while the FX screen is still closing.
  await click(win.locator('button[aria-label="Visualizer"]'))
  await visualizerOpen()
})
await scene('visualizer', 'blue')
await sleep(2400)
for (const theme of ['tangle', 'crystal', 'sponge']) {
  await win.evaluate((id) => {
    const select = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === id))
    select.value = id
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }, theme)
  await move(800 + Math.random() * 40, 500 + Math.random() * 40)
  await sleep(3000)
}
await win.keyboard.press('Escape')
await sleep(300)

// end: the frame leaves, the card closes
await stage('caption', '')
await stage('home')
await sleep(500)
await stage('away', true)
await stage('card', words('end')[0], words('end').slice(1))
await sleep(4200)
await cdp.send('Page.stopScreencast')
await sleep(300)
// Leave the demo app as it was found.
await win.evaluate(() => { localStorage.setItem('waveformStyle', 'classic'); localStorage.setItem('playerLarge', 'false') })
await app.close()

// ---- put it together ----
if (shots.length < 50) throw new Error(`Only ${shots.length} frames were recorded`)
const list = shots.map((s, i) => `file '${s.file}'\nduration ${Math.max(0.001, (shots[i + 1]?.t ?? s.t + 0.04) - s.t).toFixed(4)}`).join('\n') + `\nfile '${shots[shots.length - 1].file}'\n`
const listFile = path.join(frames, 'frames.txt')
fs.writeFileSync(listFile, list)
const seconds = shots[shots.length - 1].t - shots[0].t
const made = spawnSync(ffmpeg, [
  '-y', '-loglevel', 'error',
  '-f', 'concat', '-safe', '0', '-i', listFile,
  '-ss', String(musicStart), '-stream_loop', '-1', '-i', music,
  '-map', '0:v:0', '-map', '1:a:0',
  '-vf', 'fps=30,scale=1600:900:force_original_aspect_ratio=decrease,pad=1600:900:(ow-iw)/2:(oh-ih)/2:color=0c0e13,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
  '-af', `volume=0.9,afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, seconds - 3.5).toFixed(2)}:d=3.5`, '-c:a', 'aac', '-b:a', '224k',
  '-t', seconds.toFixed(2), '-movflags', '+faststart', out,
], { stdio: 'inherit' })
if (made.status !== 0) throw new Error('ffmpeg failed')
console.log(`[promo] ${shots.length} frames over ${seconds.toFixed(1)} s (${(shots.length / seconds).toFixed(1)} a second) → ${out}`)
