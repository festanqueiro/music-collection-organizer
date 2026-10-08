// A promo video of MCO, recorded from the real app on the demo collection:
//
//   npx electron-vite build && node website/capture/promo.mjs ~/Desktop/MCO-promo.mp4
//
// The script — the scenes and the words shown in each — is promo.md, next
// to this file, with how it's made and what to watch for. This file is what
// happens in each scene; the words are read from there. The frames come
// from Chromium's own screencast and ffmpeg puts them together. It writes
// nothing to website/assets.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { COLLECTION, REPO, WORK, launch, libraryReady, restoreLibrary } from './app.mjs'

const out = path.resolve(process.argv[2] ?? path.join(WORK, 'MCO-promo.mp4'))

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
restoreLibrary()

const frames = path.join(WORK, 'promo-frames')
fs.rmSync(frames, { recursive: true, force: true })
fs.mkdirSync(frames, { recursive: true })

const { app, win } = await launch()
const sleep = (ms) => win.waitForTimeout(ms)
await win.waitForSelector('text=PLAYLISTS', { timeout: 30000 })
await sleep(1500)

// ---- what is drawn over the app: a pointer, a caption, full-screen cards ----
await win.evaluate(() => {
  const pointer = document.createElement('div')
  pointer.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.5 L12 13.5 L19 13.5 Z" fill="white" stroke="black" stroke-width="1.4" stroke-linejoin="round"/></svg>'
  Object.assign(pointer.style, { position: 'fixed', left: '-40px', top: '-40px', zIndex: 2147483647, pointerEvents: 'none' })
  document.documentElement.appendChild(pointer)
  addEventListener('mousemove', (e) => { pointer.style.left = `${e.clientX - 3}px`; pointer.style.top = `${e.clientY - 2}px` }, true)

  const caption = document.createElement('div')
  caption.id = 'promo-caption'
  Object.assign(caption.style, {
    position: 'fixed', left: '50%', top: '62px', transform: 'translateX(-50%)', zIndex: 2147483646, pointerEvents: 'none',
    padding: '10px 22px', borderRadius: '12px', background: 'rgba(10, 12, 16, 0.88)', border: '1px solid rgba(255,255,255,0.14)',
    color: '#fff', font: '600 24px/1.25 Roboto, system-ui, sans-serif', letterSpacing: '0.01em', whiteSpace: 'nowrap',
    boxShadow: '0 8px 30px rgba(0,0,0,0.5)', opacity: '0', transition: 'opacity 350ms ease',
  })
  document.documentElement.appendChild(caption)

  const card = document.createElement('div')
  card.id = 'promo-card'
  Object.assign(card.style, {
    position: 'fixed', inset: '0', zIndex: 2147483645, pointerEvents: 'none', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '18px', background: 'radial-gradient(circle at 50% 40%, #1c2230 0%, #0c0e13 70%)',
    color: '#fff', font: '700 64px/1.1 Roboto, system-ui, sans-serif', opacity: '0', transition: 'opacity 500ms ease',
  })
  document.documentElement.appendChild(card)
})
const caption = async (text) => {
  await win.evaluate((t) => {
    const c = document.getElementById('promo-caption')
    c.style.opacity = '0'
    setTimeout(() => { c.textContent = t; c.style.opacity = t ? '1' : '0' }, t ? 260 : 0)
  }, text)
  await sleep(450)
}
const card = async (title, lines, ms) => {
  await win.evaluate(([t, ls]) => {
    const c = document.getElementById('promo-card')
    c.innerHTML = ''
    const h = document.createElement('div')
    h.textContent = t
    c.appendChild(h)
    for (const [i, l] of ls.entries()) {
      const p = document.createElement('div')
      p.textContent = l
      Object.assign(p.style, { font: `${i === 0 ? 500 : 400} ${i === 0 ? 28 : 22}px/1.3 Roboto, system-ui, sans-serif`, color: i === 0 ? '#c9d1e0' : '#8b95a8' })
      c.appendChild(p)
    }
    c.style.opacity = '1'
  }, [title, lines])
  await sleep(ms)
}
const hideCard = async () => {
  await win.evaluate(() => { document.getElementById('promo-card').style.opacity = '0' })
  await sleep(550)
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
const move = (x, y) => win.mouse.move(x, y, { steps: 28 })
const centre = async (locator) => {
  await locator.first().scrollIntoViewIfNeeded()
  const box = await locator.first().boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const click = async (locator, options) => {
  const { x, y } = await centre(locator)
  await move(x, y)
  await sleep(180)
  await win.mouse.click(x, y, options)
}
const rowOf = (title) => win.locator(`td:has-text("${title}")`).first()

// The recording starts on the title card, already up.
await card(words('title')[0], words('title').slice(1), 900)
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 1 })
// Something has to change for the screencast to send frames: the pointer drifts.
await move(820, 620)
await sleep(2600)
await hideCard()

// collection
await caption(words('collection')[0])
await move(760, 420)
for (let i = 0; i < 4; i++) { await win.mouse.wheel(0, 220); await sleep(380) }
for (let i = 0; i < 4; i++) { await win.mouse.wheel(0, -220); await sleep(260) }
await click(rowOf('Deep Water'))
await sleep(1600)

// tags
await caption(words('tags')[0])
await click(win.locator('button[aria-label="Tags"]'))
await sleep(700)
await click(win.locator('text=Dubstep').first())
await sleep(1500)
await click(win.locator('button[aria-label="Folders"]'))
await sleep(500)

// details: the playlists a track is in, and the tracks that go with it
await caption(words('details')[0])
const inSeveral = await win.evaluate(async () => {
  let best = null
  for (const t of await window.api.getTracks()) {
    const n = (await window.api.getTrackPlaylistIds(t.id)).length
    if (!best || n > best.n) best = { title: t.title, n }
  }
  return best
})
await click(rowOf(inSeveral.title))
await sleep(900)
const section = (name) => win.locator(`button[aria-expanded]:has-text("${name}")`).first()
await section('Playlists').scrollIntoViewIfNeeded()
await move(...Object.values(await centre(section('Playlists'))))
await sleep(2200)
await section('Similar tracks').scrollIntoViewIfNeeded()
const similar = await centre(section('Similar tracks'))
await move(similar.x, similar.y + 60)
await win.mouse.wheel(0, 260)
await sleep(2600)

// player
await caption(words('player')[0])
await click(rowOf('Basement (Dub)'), { button: 'right' })
await sleep(500)
await click(win.locator('button:has-text("Play track now")'))
await win.waitForSelector('button[aria-label="Hot cue A (set)"]', { timeout: 15000 })
await sleep(1500)
await click(win.locator('button[aria-label="Larger player"]'))
await sleep(1600)
await click(win.locator('button[aria-label="Hot cue B (set)"]'))
await sleep(1300)
await click(win.locator('button[aria-label="Hot cue C (set)"]'))
await sleep(1300)

// convert
await caption(words('convert')[0])
await click(rowOf('Bassline Science'), { button: 'right' })
await sleep(900)
await click(win.locator('button:has-text("Convert to…")'))
await sleep(3200)
await win.keyboard.press('Escape')
await sleep(500)

// playlists
await caption(words('playlists')[0])
await click(win.locator('text=Sunday Session').first())
await sleep(1500)
await click(win.locator('button[aria-label="Search playlists"]'))
await sleep(400)
await win.keyboard.type('late', { delay: 140 })
await sleep(1400)
await win.keyboard.press('Escape')
await sleep(400)

// The demo tracks are 48 s long: the first has about played out by now, and
// the screens that follow need one playing.
await click(win.locator('text=Sunday Session').first())
await sleep(500)
await click(rowOf('Basement (Dub)'), { button: 'right' })
await sleep(400)
await click(win.locator('button:has-text("Play track now")'))
await sleep(900)

// effects
await caption(words('effects')[0])
await click(win.locator('button[aria-label="FX"]'))
await sleep(2800)
await click(win.locator('button[aria-label="FX"]'))
await sleep(500)

// visualizer
await caption('')
const visualizerOpen = () =>
  win.waitForFunction(() => [...document.querySelectorAll('select')].some((s) => [...s.options].some((o) => o.value === 'tangle')), null, { timeout: 5000 })
await click(win.locator('button[aria-label="Visualizer"]'))
await visualizerOpen().catch(async () => {
  // The first click can land while the FX screen is still closing.
  await click(win.locator('button[aria-label="Visualizer"]'))
  await visualizerOpen()
})
await caption(words('visualizer')[0])
await sleep(2600)
await caption('')
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
await sleep(600)

await card(words('end')[0], words('end').slice(1), 600)
await move(760, 640)
await sleep(3400)
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
const music = path.join(COLLECTION, 'Bandcamp', 'Dub & Steppers', 'Amber Riddim - Basement (Dub).aiff')
const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile]
if (fs.existsSync(music)) args.push('-stream_loop', '-1', '-i', music)
args.push('-vf', 'fps=30,scale=1600:900:force_original_aspect_ratio=decrease,pad=1600:900:(ow-iw)/2:(oh-ih)/2:color=0c0e13,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20')
if (fs.existsSync(music)) args.push('-af', `volume=0.8,afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, seconds - 3).toFixed(2)}:d=3`, '-c:a', 'aac', '-b:a', '192k')
args.push('-t', seconds.toFixed(2), '-movflags', '+faststart', out)
const made = spawnSync(ffmpeg, args, { stdio: 'inherit' })
if (made.status !== 0) throw new Error('ffmpeg failed')
console.log(`[promo] ${shots.length} frames over ${seconds.toFixed(1)} s (${(shots.length / seconds).toFixed(1)} a second) → ${out}`)
