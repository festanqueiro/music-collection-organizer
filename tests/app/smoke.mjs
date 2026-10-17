// A smoke test of the built app (npm run test:app): the real Electron app,
// driven with Playwright on the made-up demo collection the website's
// captures use (website/capture/) — its own data folder, never the user's
// library. It checks what unit tests can't see: that menus open where they
// should, that the handlers behind them answer, that nothing logs an error.
//
// Needs Playwright (npm i -g playwright) and, the first time, python3 and
// ffmpeg to make the demo collection. A window opens while it runs. It
// writes nothing to website/assets. Not part of CI.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { COLLECTION, REPO, freshDataFolder, launch, libraryReady, restoreLibrary, saveLibrary } from '../../website/capture/app.mjs'
import { setupLibrary } from '../../website/capture/setup.mjs'

if (!fs.existsSync(path.join(REPO, 'out/main/index.js'))) throw new Error('Build first: npx electron-vite build')
if (!fs.existsSync(COLLECTION)) {
  const made = spawnSync('python3', [path.join(REPO, 'website/capture/make-demo-collection.py'), COLLECTION], { stdio: 'inherit' })
  if (made.status !== 0) throw new Error('make-demo-collection.py failed')
}
if (!libraryReady()) {
  console.log('preparing the demo library (scan, analysis, tags)…')
  freshDataFolder()
  const first = await launch()
  await setupLibrary(first.win)
  await first.app.close()
  saveLibrary()
}
restoreLibrary()

const { app, win } = await launch()
const errors = []
win.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
win.on('console', (m) => {
  if (m.type() !== 'error') return
  // Reloading the window (the half-time group does, to read the tracks
  // again) logs six fonts given as data: URIs and refused by the page's
  // Content-Security-Policy. Not on a first load, and nothing looks
  // different; noted in the roadmap's known issues.
  if (/^Loading the font 'data:font\//.test(m.text())) return
  errors.push(`console: ${m.text().slice(0, 200)}`)
})
let failed = 0
const check = (name, pass, detail = '') => {
  if (!pass) failed++
  console.log(pass ? 'PASS' : 'FAIL', name, pass ? '' : detail)
}
const wait = (ms) => win.waitForTimeout(ms)
// Each group stands alone: one that throws is a failure, not the end of the run.
async function group(name, run) {
  try {
    await run()
  } catch (err) {
    check(`${name} (stopped)`, false, String(err).split('\n')[0])
    await win.keyboard.press('Escape').catch(() => {})
    await win.mouse.click(700, 300).catch(() => {})
  }
}

await win.waitForSelector('text=PLAYLISTS', { timeout: 30000 })
await wait(1500)
const windowHeight = await win.evaluate(() => window.innerHeight)
// A track with hot cues, which the demo library gives a few of.
const track = await win.evaluate(async () => {
  for (const t of await window.api.getTracks()) {
    const cues = (await window.api.getTrackCues(t.id)).filter((c) => c.kind === 'hot')
    if (cues.length >= 2 && t.bpm) return { id: t.id, title: t.title, bpm: t.bpm }
  }
  return null
})
if (!track) throw new Error('the demo library has no analysed track with hot cues')
const row = () => win.locator(`td:has-text("${track.title}")`).first()

await group('handlers', async () => {
  const r = await win.evaluate(async (id) => ({
    genres: (await window.api.getGenres()).length,
    nodes: (await window.api.getPlaylistNodes()).length,
    forTrack: Array.isArray(await window.api.getTrackPlaylistIds(id)),
    audio: await window.api.getTrackAudioInfo(id),
  }), track.id)
  check('tags, playlists and convert handlers answer', r.genres > 0 && r.nodes > 0 && r.forTrack && !!r.audio?.codec, JSON.stringify(r))
})

await group('track details', async () => {
  await row().click()
  await wait(700)
  for (const section of ['Cover', 'ID3 tags', 'Tags', 'Playlists', 'Similar tracks', 'File']) {
    check(`details section: ${section}`, (await win.locator(`button[aria-expanded]:has-text("${section}")`).count()) > 0)
  }
  const file = await win.evaluate(() => ({ synced: /Synced locally/.test(document.body.innerText), re: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Re-analyse') }))
  check('File section: synced locally, Re-analyse', file.synced && file.re, JSON.stringify(file))
  // Similar tracks → Add to playlist…: the menu stays open after the click that opens it.
  const add = win.locator('button[title="Add to playlist…"]').first()
  if ((await add.count()) > 0) {
    await add.click()
    await wait(300)
    check('Similar tracks: Add to playlist… opens its menu', (await win.locator('button:has-text("New playlist…")').count()) > 0)
    await win.keyboard.press('Escape')
    await win.mouse.click(700, 300)
    await wait(200)
  }
})

await group('toolbar popovers', async () => {
  const fixed = () => win.evaluate(() => [...document.querySelectorAll('div')].filter((d) => getComputedStyle(d).position === 'fixed' && d.style.bottom && d.style.width).length)
  for (const label of ['Audio output', 'Cast', 'Microphone', 'Record', 'Show on a screen']) {
    const button = win.locator(`button[aria-label="${label}"]`).first()
    const before = await fixed()
    await button.click()
    await wait(250)
    const opened = (await fixed()) > before
    await win.keyboard.press('Escape')
    await wait(200)
    const closedByEsc = (await fixed()) === before
    await button.click()
    await wait(250)
    await win.mouse.click(700, 300)
    await wait(200)
    check(`popover: ${label}`, opened && closedByEsc && (await fixed()) === before, JSON.stringify({ opened, closedByEsc }))
  }
})

await group('row menu', async () => {
  const footerTop = await win.evaluate(() => [...document.querySelectorAll('div')].find((d) => d.style.gridArea === 'footer').getBoundingClientRect().top)
  const rows = await win.locator('tbody tr:not([aria-hidden])').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ y: r.y, h: r.height })))
  const last = rows.filter((r) => r.y > 100 && r.y + r.h <= footerTop).pop()
  await win.mouse.click(500, last.y + last.h / 2, { button: 'right' })
  await wait(400)
  const menu = await win.evaluate(() => {
    const finder = [...document.querySelectorAll('button')].find((b) => /^Show in (Finder|File Explorer)$/.test(b.textContent.replace(/folder_open/, '').trim()))
    if (!finder) return null
    const box = finder.parentElement.getBoundingClientRect()
    const f = finder.getBoundingClientRect()
    const hit = document.elementFromPoint(f.left + f.width / 2, f.top + f.height / 2)
    return { top: box.top, bottom: box.bottom, onTop: finder.contains(hit) }
  })
  check('menu on the last row stays inside the window, Show in Finder reachable', !!menu && menu.top >= 0 && menu.bottom <= windowHeight && menu.onTop, JSON.stringify({ menu, windowHeight }))
  check('row menu has Refine BPM… and Convert to…', (await win.locator('button:has-text("Refine BPM…")').count()) === 1 && (await win.locator('button:has-text("Convert to…")').count()) === 1)
  await win.keyboard.press('Escape')
  await win.mouse.click(700, 300)
})

await group('Refine BPM', async () => {
  const r = await win.evaluate(async (t) => {
    const half = await window.api.changeTracksBpm([t.id], { kind: 'factor', factor: 0.5 })
    const back = await window.api.changeTracksBpm([t.id], { kind: 'factor', factor: 2 })
    const bad = await window.api.changeTracksBpm([t.id], { kind: 'set', bpm: 5 })
    await window.api.changeTracksBpm([t.id], { kind: 'set', bpm: t.bpm })
    const detect = await window.api.changeTracksBpm([t.id], { kind: 'detect' })
    return { half: half.tracks[0]?.bpm, back: back.tracks[0]?.bpm, edited: back.tracks[0]?.bpmEdited, refused: bad.skipped.length === 1, handedBack: detect.tracks[0]?.bpmEdited === false }
  }, track)
  check('halve, double, refuse 5 BPM, detect again', Math.abs(r.half - track.bpm / 2) < 1.5 && Math.abs(r.back - track.bpm) < 1.5 && r.edited && r.refused && r.handedBack, JSON.stringify(r))
  await row().click({ button: 'right' })
  await wait(300)
  await win.locator('button:has-text("Refine BPM…")').click()
  await wait(300)
  const items = await win.locator('button:has-text("Double"), button:has-text("Halve"), button:has-text("One and a half times"), button:has-text("Two thirds (× ⅔)"), button:has-text("Set the BPM…"), button:has-text("Measure it again")').count()
  check('Refine BPM menu: Double, Halve, One and a half times, Two thirds, Set the BPM…, Measure it again', items === 6, `${items} items`)
  // The numbers beside the multiplications are measured on the audio, as
  // the change itself is: "≈" (the plain product) only until they arrive.
  let previews = []
  for (let i = 0; i < 20; i++) {
    previews = await win.locator('[data-bpm-preview]').allTextContents()
    if (previews.length === 4 && previews.every((p) => !p.includes('≈'))) break
    await wait(500)
  }
  const doubled = await win.evaluate(async (t) => {
    const r = await window.api.changeTracksBpm([t.id], { kind: 'factor', factor: 2 })
    await window.api.changeTracksBpm([t.id], { kind: 'set', bpm: t.bpm })
    await window.api.changeTracksBpm([t.id], { kind: 'detect' })
    return r.tracks[0]?.bpm
  }, track)
  check('Refine BPM previews are measured, and Double sets the number it showed', previews.length === 4 && previews.every((p) => !p.includes('≈')) && Number(previews[0]) === doubled, `${JSON.stringify(previews)} vs ${doubled}`)
  await win.mouse.click(700, 300)
})

await group('half time', async () => {
  // A track left at half its tempo, as the analysis's own value: "Measure
  // it again" doubles it (the slowest tempo is 90 by default), and a BPM
  // set by hand is not touched.
  const r = await win.evaluate(async (t) => {
    const settings = await window.api.getLibrarySettings()
    await window.api.changeTracksBpm([t.id], { kind: 'factor', factor: 0.5 })
    await window.api.changeTracksBpm([t.id], { kind: 'detect' })
    const slow = (await window.api.getTracks()).find((x) => x.id === t.id)
    const again = await window.api.changeTracksBpm([t.id], { kind: 'measure' })
    await window.api.changeTracksBpm([t.id], { kind: 'set', bpm: 70 })
    const byHand = await window.api.changeTracksBpm([t.id], { kind: 'measure' })
    await window.api.changeTracksBpm([t.id], { kind: 'set', bpm: t.bpm })
    await window.api.changeTracksBpm([t.id], { kind: 'detect' })
    return { slowest: settings.slowestBpm, slow: slow.bpm, edited: slow.bpmEdited, again: again.tracks[0]?.bpm, stillAnalysed: again.tracks[0]?.bpmEdited === false, byHandRefused: byHand.skipped.length === 1 }
  }, track)
  check('Measure it again doubles a half-time tempo, and leaves one set by hand', r.slowest === 90 && r.slow < 90 && !r.edited && Math.abs(r.again - track.bpm) < 1.5 && r.stillAnalysed && r.byHandRefused, JSON.stringify(r))

  // The Slow BPM filter lists such a track, and the setting is in Settings → Library.
  await win.evaluate(async (t) => {
    await window.api.changeTracksBpm([t.id], { kind: 'factor', factor: 0.5 })
    await window.api.changeTracksBpm([t.id], { kind: 'detect' })
  }, track)
  await win.reload()
  await win.waitForSelector('text=PLAYLISTS', { timeout: 30000 })
  await wait(1500)
  await win.locator('button[title*="Filters"], button[aria-label*="Filters"]').first().click()
  await wait(400)
  await win.locator('text=Only tracks below the slowest tempo').click()
  await wait(500)
  const listed = await win.locator('tbody tr:not([aria-hidden])').count()
  const hasIt = (await win.locator(`td:has-text("${track.title}")`).count()) > 0
  check('Slow BPM filter lists the half-time track', listed >= 1 && listed <= 3 && hasIt, `${listed} rows`)
  await win.locator('text=Only tracks below the slowest tempo').click()
  await win.evaluate((t) => window.api.changeTracksBpm([t.id], { kind: 'measure' }), track)
  await win.locator('button[aria-label="Settings"]').first().click()
  await wait(500)
  await win.locator('button:has-text("Library")').first().click()
  await wait(300)
  check('Settings → Library has the slowest tempo', (await win.locator('select[aria-label="Slowest tempo"]').count()) === 1)
  await win.keyboard.press('Escape')
  await win.reload()
  await win.waitForSelector('text=PLAYLISTS', { timeout: 30000 })
  await wait(1500)
})

await group('tag names', async () => {
  const r = await win.evaluate(async () => {
    const first = (await window.api.getGenres())[0]
    const flipped = first.name === first.name.toUpperCase() ? first.name.toLowerCase() : first.name.toUpperCase()
    let refused = ''
    try {
      await window.api.createGenre(flipped)
    } catch (err) {
      refused = String(err.message)
    }
    return { name: first.name, flipped, refused, count: (await window.api.getGenres()).length }
  })
  check('a Tag name in other capitals is the same name', /already a Tag called/.test(r.refused), JSON.stringify(r))
})

await group('tag track counts', async () => {
  await win.locator('button[aria-label="Tags"]').first().click()
  await wait(400)
  const r = await win.evaluate(async () => {
    const shown = [...document.querySelectorAll('span[title$=" track"], span[title$=" tracks"]')].map((el) => Number(el.textContent))
    return { shown, genres: (await window.api.getGenres()).length }
  })
  // Subtags start collapsed: one count per Tag, and the demo's Tags are all used.
  check('each Tag shows how many tracks it has', r.shown.length === r.genres && r.shown.some((n) => n > 0), JSON.stringify(r))
  // Rename is typed in the row (Electron has no window.prompt).
  await win.locator('label:has(input[type="checkbox"])').first().click({ button: 'right' })
  await wait(300)
  await win.locator('button:has-text("Rename")').click()
  await wait(300)
  check('Rename a Tag: a field in its row', (await win.locator('input[aria-label^="New name for"]').count()) === 1)
  await win.keyboard.press('Escape')
  await wait(200)
  // The Subtags view's rows have the same menu.
  await win.locator('button[aria-label="Subtags"]').first().click()
  await wait(400)
  await win.locator('label:has(input[type="checkbox"])').first().click({ button: 'right' })
  await wait(300)
  const subMenu = await win.locator('button:has-text("Rename"), button:has-text("Choose color"), button:has-text("Delete")').count()
  check('Right-click a Subtag: Rename, Choose color, Delete', subMenu === 3, String(subMenu))
  await win.keyboard.press('Escape')
  await wait(200)
  await win.locator('button[aria-label="Folders"]').first().click()
  await wait(300)
})

await group('player', async () => {
  await row().click({ button: 'right' })
  await wait(300)
  await win.locator('button:has-text("Play track now")').click()
  await win.waitForSelector('button[aria-label="Hot cue A (set)"]', { timeout: 15000 })
  await wait(600)
  const hot = () => win.evaluate(async (id) => (await window.api.getTrackCues(id)).filter((c) => c.kind === 'hot'), track.id)
  const before = await hot()
  await win.locator('button[aria-label="Delete hot cue A"]').click()
  await wait(500)
  const after = await hot()
  check('× deletes hot cue A only', after.length === before.length - 1 && !after.some((c) => c.slot === 0))
  await win.locator('button:has-text("Undo")').first().click()
  await wait(600)
  const a0 = before.find((c) => c.slot === 0)
  const a1 = (await hot()).find((c) => c.slot === 0)
  check('Undo puts it back at the same place', !!a1 && a1.start === a0.start && a1.color === a0.color && a1.name === a0.name)

  // A set pad's menu opens upwards, inside the window, and Esc closes it.
  const pad = win.locator('button[aria-label="Hot cue B (set)"]').first()
  await pad.click({ button: 'right' })
  await wait(300)
  const padMenu = await win.evaluate(() => {
    const item = [...document.querySelectorAll('button')].find((b) => /Delete hot cue B/.test(b.textContent))
    if (!item) return null
    const box = item.parentElement.getBoundingClientRect()
    const padBox = document.querySelector('button[aria-label="Hot cue B (set)"]').getBoundingClientRect()
    return { top: box.top, bottom: box.bottom, padTop: padBox.top }
  })
  check('hot cue menu opens above the pad, inside the window', !!padMenu && padMenu.top >= 0 && padMenu.bottom <= padMenu.padTop + 12, JSON.stringify(padMenu))
  await win.keyboard.press('Escape')
  await wait(200)
  check('Esc closes it', (await win.locator('button:has-text("Delete hot cue B")').count()) === 0)

  // Classic: the lit bars are shown only as far as the track has played.
  const clip = await win.evaluate(() => {
    const svg = document.querySelector('svg[preserveAspectRatio="none"]')
    const rect = svg.querySelector('clipPath rect')
    return rect ? { width: Number(rect.getAttribute('width')), slices: Number(svg.getAttribute('viewBox').split(' ')[2]) } : null
  })
  check('Classic waveform: played part clipped', !!clip && clip.width >= 1 && clip.width <= clip.slices, JSON.stringify(clip))

  const size = () => win.evaluate(() => {
    const footer = [...document.querySelectorAll('div')].find((d) => d.style.gridArea === 'footer').getBoundingClientRect().height
    const svg = document.querySelector('svg[preserveAspectRatio="none"]')
    return { footer: Math.round(footer), wave: Math.round(svg.getBoundingClientRect().height), lines: svg.querySelectorAll('line').length, rects: svg.querySelectorAll('rect').length }
  })
  const small = await size()
  check('bar lines on the waveform', small.lines > 5, JSON.stringify(small))
  await win.locator('button[aria-label="Larger player"]').click()
  await wait(400)
  const large = await size()
  check('larger player: twice the height, for the waveform', Math.abs(large.footer - small.footer * 2) <= 3 && large.wave > small.wave * 3, JSON.stringify({ small, large }))
  await win.locator('button[aria-label="Smaller player"]').click()

  const pickStyle = async (style) => {
    await win.locator('button[aria-label="Settings"]').first().click()
    await wait(500)
    await win.locator('button:has-text("Appearance")').first().click()
    await wait(300)
    await win.locator('select[aria-label="Waveform style"]').selectOption(style)
    await wait(400)
    await win.keyboard.press('Escape')
    await wait(900)
  }
  await pickStyle('rgb')
  const fills = await win.evaluate(() => new Set([...document.querySelectorAll('svg[preserveAspectRatio="none"] rect')].map((r) => r.getAttribute('fill'))).size)
  check('RGB waveform: coloured by slice', fills > 20, `${fills} colours`)
  await pickStyle('bands')
  check('3-band waveform: three layers', (await size()).rects > 1200)
  await pickStyle('classic')
})

await group('visualizer', async () => {
  await win.locator('button[aria-label="Visualizer"]').first().click()
  await wait(1500)
  const names = await win.evaluate(() => [...document.querySelectorAll('select option')].map((o) => o.textContent.replace(/^\d+\s+/, '')))
  check('visualizer lists Sponge, Crystal, Tangle and Ocean', ['Sponge', 'Crystal', 'Tangle', 'Ocean'].every((n) => names.includes(n)), names.join(', '))
  const qualities = await win.evaluate(() => {
    const select = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'hd'))
    return select ? [...select.options].map((o) => o.value) : []
  })
  check('visualizer has a Quality picker (Auto, Low, High, HD)', qualities.join() === 'auto,low,high,hd', qualities.join(', '))
  // Each of the newer themes draws: a canvas with a size, and nothing thrown.
  const before = errors.length
  for (const id of ['sponge', 'crystal', 'tangle', 'ocean']) {
    await win.evaluate((theme) => {
      const select = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === theme))
      select.value = theme
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }, id)
    await wait(1200)
  }
  const canvas = await win.evaluate(() => {
    const c = document.querySelector('canvas')
    return c ? { w: c.width, h: c.height } : null
  })
  check('the new themes draw without errors', !!canvas && canvas.w > 0 && canvas.h > 0 && errors.length === before, JSON.stringify({ canvas, errors: errors.slice(before, before + 2) }))
  await win.keyboard.press('Escape')
  await wait(400)
})

await group('selecting rows', async () => {
  const rows = () => win.evaluate(() => {
    const all = [...document.querySelectorAll('tbody tr[data-track-id]')]
    return { all: all.length, selected: all.filter((r) => r.getAttribute('aria-selected') === 'true').length, boxes: document.querySelectorAll('table input[type="checkbox"]').length }
  })
  const nth = (n) => win.locator('tbody tr[data-track-id]').nth(n)
  await nth(0).click()
  await wait(200)
  const one = await rows()
  check('a click selects one row, and the table has no checkboxes', one.selected === 1 && one.boxes === 0, JSON.stringify(one))
  await nth(3).click({ modifiers: ['Shift'] })
  await wait(200)
  check('shift-click selects the rows in between', (await rows()).selected === 4, JSON.stringify(await rows()))
  await nth(1).click({ modifiers: ['ControlOrMeta'] })
  await wait(200)
  check('⌘-click takes a row out', (await rows()).selected === 3, JSON.stringify(await rows()))
  await nth(0).click()
  await win.keyboard.press('Shift+ArrowDown')
  await win.keyboard.press('Shift+ArrowDown')
  await wait(200)
  check('shift-↓ extends the selection', (await rows()).selected === 3, JSON.stringify(await rows()))
  await win.keyboard.press('Shift+ArrowUp')
  await wait(200)
  check('shift-↑ takes the last row back out', (await rows()).selected === 2, JSON.stringify(await rows()))
  // ⌘A selects every track listed — also right after a click on a button
  // in a row, which keeps the focus.
  await nth(0).click()
  await win.locator('button[aria-label="Choose columns"]').focus()
  await win.keyboard.press('ControlOrMeta+a')
  await wait(300)
  const after = await rows()
  check('⌘A selects every track in the table, with a button in focus', after.selected === after.all && after.all > 1, JSON.stringify(after))
  await win.keyboard.press('Escape')
  await wait(200)
  check('Esc goes back to one row', (await rows()).selected === 1, JSON.stringify(await rows()))
  // In the search box it selects the text instead.
  const search = win.locator('input[type="search"], input[placeholder*="Search"]').first()
  await search.fill('abc')
  await search.press('ControlOrMeta+a')
  const inSearch = await win.evaluate(() => ({ selected: document.activeElement.selectionEnd - document.activeElement.selectionStart, rows: document.querySelectorAll('tbody tr[aria-selected="true"]').length }))
  check('in the search box ⌘A selects the text, not the tracks', inSearch.selected === 3 && inSearch.rows <= 1, JSON.stringify(inSearch))
  await search.fill('')
  await wait(300)
})

await group('order by harmonic mixing', async () => {
  const playlist = await win.evaluate(async () => {
    const tracks = new Map((await window.api.getTracks()).map((t) => [t.id, t]))
    for (const node of await window.api.getPlaylistNodes()) {
      if (node.kind !== 'playlist') continue
      const ids = await window.api.getPlaylistTrackIds(node.id)
      if (ids.filter((id) => tracks.get(id)?.musicalKey).length >= 3) return { id: node.id, name: node.name, ids }
    }
    return null
  })
  if (!playlist) return check('a demo playlist with three analysed songs', false)
  const button = win.locator('button:has-text("Order by Harmonic Mixing")')
  const order = () => win.evaluate((id) => window.api.getPlaylistTrackIds(id), playlist.id)
  // The collection table's own rows (the details panel can list tracks too), top to bottom.
  const shown = () => win.evaluate(() => [...document.querySelectorAll('table:has(th) tbody tr[data-track-id]')].map((r) => Number(r.dataset.trackId)))
  const chip = win.locator(`button[aria-label="Remove the ${playlist.name} filter"]`)
  // Start from an order that isn't the harmonic one: of an order and two
  // others (reversed, first song last) at most one can be.
  let before = []
  let after = []
  for (const start of [[...playlist.ids].reverse(), playlist.ids, [...playlist.ids.slice(1), playlist.ids[0]]]) {
    if ((await chip.count()) > 0) await chip.click()
    await win.evaluate(({ id, ids }) => window.api.setPlaylistTrackIds(id, ids), { id: playlist.id, ids: start })
    await win.locator(`text="${playlist.name}"`).first().click()
    await wait(600)
    if (before.length === 0) check('a playlist shows Order by Harmonic Mixing', (await button.count()) === 1)
    before = await order()
    await button.click()
    await wait(600)
    after = await order()
    if (after.join() !== before.join()) break
  }
  const toast = await win.evaluate(() => /Ordered by harmonic mixing: \d+ of \d+ key changes? mix harmonically/.test(document.body.innerText))
  const changed = after.join() !== before.join()
  check('it reorders the playlist, keeps every song, and says how many changes mix', changed && toast && [...after].sort().join() === [...before].sort().join(), JSON.stringify({ toast, before, after }))
  check('the table lists the songs in the new order', (await shown()).join() === after.join(), JSON.stringify({ shown: await shown(), after }))
  await win.locator('button:has-text("Undo")').first().click()
  await wait(600)
  check('Undo puts the old order back, in the table too', (await order()).join() === before.join() && (await shown()).join() === before.join())
  await win.evaluate(({ id, ids }) => window.api.setPlaylistTrackIds(id, ids), playlist)
  await chip.click()
  await wait(400)
})

await group('bit depth column', async () => {
  // The demo library was saved before the column existed: the background
  // tag reader fills it in after launch.
  const header = await win.locator('th:has-text("Bit depth")').count()
  const depths = await win.evaluate(async () => (await window.api.getTracks()).map((t) => t.bitDepth))
  const shown = await win.locator('tbody td:text-matches("^(16|24|32)-bit$")').count()
  check('Bit depth column: a header, a value for the lossless tracks, shown in the rows', header === 1 && depths.some((d) => d === 16 || d === 24) && shown > 0, JSON.stringify({ header, depths: [...new Set(depths)], shown }))
})

await group('last row', async () => {
  // Scrolled to the end, the last track sits clear of the bottom edge, where
  // macOS draws the horizontal scrollbar over the table.
  const gap = await win.evaluate(async () => {
    const table = document.querySelector('table')
    const scroller = table.parentElement
    scroller.scrollTop = scroller.scrollHeight
    await new Promise((r) => setTimeout(r, 400))
    const rows = [...table.querySelectorAll('tbody tr:not([aria-hidden])')]
    const gap = scroller.getBoundingClientRect().top + scroller.clientHeight - rows[rows.length - 1].getBoundingClientRect().bottom
    scroller.scrollTop = 0
    return gap
  })
  check('the last row ends above where the horizontal scrollbar is drawn', gap >= 14, `${gap}px`)
  await wait(300)
})

await group('bulk operations menu', async () => {
  const labels = await app.evaluate(({ Menu }) => {
    const bulk = Menu.getApplicationMenu()?.items.find((i) => i.label === 'Bulk Operations')
    return bulk?.submenu?.items.filter((i) => i.type !== 'separator').map((i) => i.label) ?? null
  })
  check('Bulk Operations: analyse, measure every BPM again, Stop', JSON.stringify(labels) === JSON.stringify(['Analyse Tracks Not Analysed Yet…', 'Measure Every BPM Again…', 'Stop']), JSON.stringify(labels))
  // Measure Every BPM Again asks first, with the number of tracks; answered
  // no here, so no BPM changes.
  const expected = await win.evaluate(async () => (await window.api.getTracks()).filter((t) => t.cloudStatus === 'local' && !!t.bpm && !t.bpmEdited).length)
  const asked = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 5000)
    win.once('dialog', async (dialog) => {
      clearTimeout(timer)
      const message = dialog.message()
      await dialog.dismiss()
      resolve(message)
    })
  })
  await app.evaluate(({ Menu }) => {
    const bulk = Menu.getApplicationMenu()?.items.find((i) => i.label === 'Bulk Operations')
    bulk?.submenu?.items.find((i) => i.label === 'Measure Every BPM Again…')?.click()
  })
  const message = await asked
  check('Measure Every BPM Again asks, with the count', expected > 0 && !!message && message.startsWith(`Measure the BPM of ${expected} track`), JSON.stringify({ expected, message }))
})

check('no errors in the page', errors.length === 0, errors.slice(0, 5).join(' | '))
await app.close()
console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
