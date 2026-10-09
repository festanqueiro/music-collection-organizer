// What the promo video draws in the app's page, around and over the app
// (run in the page by promo.mjs; see promo.md):
//
// - a dark backdrop with wide bands that wave slowly sideways over one
//   another, and on it the app in a window frame — a title bar and a border
//   in the scene's colour — that the app never leaves;
// - the scene's words above the frame, always, arriving a word at a time;
// - zooms inside the frame (`window.promo.zoomAt`), a pointer, a marching
//   outline around what's being shown, and the title and end cards.
//
// The app's own layout isn't touched: #root is moved into the frame and
// only gets a transform.
(() => {
  // The two colours of the logo: the pink of its letters and ring, the blue of its disc.
  const ACCENTS = { pink: '#ffc3c5', blue: '#7ba7bd' }
  // The band above the frame for the words, the frame's title bar, and the
  // space left under the frame.
  const CAPTION = 92
  const BAR = 30
  const BOTTOM = 26

  // A constructed stylesheet: the page's Content-Security-Policy refuses a
  // <style> element written in, but not one adopted like this.
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(`
    body { background: radial-gradient(circle at 50% 38%, #1c2230 0%, #0c0e13 72%) fixed !important; }
    #promo-frame { position: fixed; z-index: 1; border-radius: 12px; overflow: hidden; background: #0c0e13;
      border: 2px solid var(--promo-accent); transition: border-color 500ms ease, box-shadow 500ms ease, opacity 600ms ease, transform 700ms cubic-bezier(.22,.8,.2,1);
      box-shadow: 0 0 0 1px rgba(0,0,0,.6), 0 0 42px -6px var(--promo-accent), 0 30px 70px rgba(0,0,0,.6); }
    #promo-frame.away { opacity: 0; transform: translateY(26px) scale(.97); }
    #promo-flow { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 0; pointer-events: none; filter: blur(12px); }
    /* A ring that flashes round the frame as a scene opens. */
    #promo-flash { position: fixed; z-index: 3; pointer-events: none; border-radius: 14px; opacity: 0; box-shadow: 0 0 0 4px var(--promo-accent), 0 0 60px 6px var(--promo-accent); }
    #promo-flash.on { animation: promo-flash 800ms ease-out; }
    @keyframes promo-flash { 0% { opacity: 0; transform: scale(.985); } 22% { opacity: 1; } 100% { opacity: 0; transform: scale(1.012); } }
    #promo-bar { height: ${BAR}px; display: flex; align-items: center; gap: 7px; padding: 0 12px; background: #161a23; border-bottom: 1px solid rgba(255,255,255,.08);
      font: 500 12px/1 Roboto, system-ui, sans-serif; color: #8b95a8; }
    #promo-bar i { width: 11px; height: 11px; border-radius: 50%; display: block; }
    #promo-bar span { flex: 1; text-align: center; margin-right: 54px; letter-spacing: .04em; }
    #promo-view { position: relative; overflow: hidden; }
    #root { position: absolute; left: 0; top: 0; width: 100vw; height: 100vh; transform-origin: 0 0; will-change: transform; background: var(--color-bg);
      transition: transform 950ms cubic-bezier(.22,.8,.2,1); }
    #promo-caption { position: fixed; left: 0; right: 0; top: 0; height: ${CAPTION}px; z-index: 2147483646; pointer-events: none;
      display: flex; align-items: center; justify-content: center; gap: 18px; white-space: nowrap;
      font: 700 37px/1.1 'Promo Grotesk', Roboto, system-ui, sans-serif; letter-spacing: -.012em; color: #fff; text-shadow: 0 2px 18px rgba(0,0,0,.6);
      opacity: 0; transition: opacity 240ms ease; }
    #promo-caption.on { opacity: 1; }
    /* The words arrive one after another, each from below; a line in the scene's colour draws under them. */
    #promo-caption .text { position: relative; padding-bottom: 9px; }
    #promo-caption .w { display: inline-block; margin-right: .27em; opacity: 0; }
    #promo-caption .w:last-of-type { margin-right: 0; }
    #promo-caption.on .w { animation: promo-word 560ms cubic-bezier(.2,.9,.25,1.15) both; }
    @keyframes promo-word { from { opacity: 0; transform: translateY(26px) rotate(5deg) scale(.92); filter: blur(5px); } to { opacity: 1; transform: none; filter: none; } }
    #promo-caption .line { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; border-radius: 2px; background: var(--promo-accent); box-shadow: 0 0 14px var(--promo-accent);
      transform: scaleX(0); transform-origin: 0 50%; transition: background 500ms ease; }
    #promo-caption.on .line { animation: promo-line 700ms cubic-bezier(.3,.8,.2,1) 260ms both; }
    @keyframes promo-line { to { transform: scaleX(1); } }
    #promo-caption .sq { width: 15px; height: 15px; border-radius: 4px; background: var(--promo-accent); box-shadow: 0 0 18px var(--promo-accent); margin-bottom: 9px; }
    #promo-caption.on .sq { animation: promo-sq 620ms cubic-bezier(.2,.9,.25,1.3) both, promo-pulse 900ms ease-in-out 620ms infinite; }
    @keyframes promo-sq { from { opacity: 0; transform: scale(0) rotate(-180deg); } to { opacity: 1; transform: none; } }
    @keyframes promo-pulse { 50% { transform: scale(1.35) rotate(45deg); } }
    #promo-spot { position: fixed; z-index: 2147483644; pointer-events: none; opacity: 0; border-radius: 8px;
      transition: opacity 300ms ease, left 500ms ease, top 500ms ease, width 500ms ease, height 500ms ease; }
    #promo-spot.on { opacity: 1; }
    #promo-spot::after { content: ''; position: absolute; inset: -5px; border-radius: 10px;
      background: repeating-linear-gradient(90deg, var(--promo-accent) 0 12px, transparent 12px 24px) top/100% 3px no-repeat,
                  repeating-linear-gradient(90deg, var(--promo-accent) 0 12px, transparent 12px 24px) bottom/100% 3px no-repeat,
                  repeating-linear-gradient(0deg, var(--promo-accent) 0 12px, transparent 12px 24px) left/3px 100% no-repeat,
                  repeating-linear-gradient(0deg, var(--promo-accent) 0 12px, transparent 12px 24px) right/3px 100% no-repeat;
      filter: drop-shadow(0 0 8px var(--promo-accent)); animation: promo-march 600ms linear infinite; }
    @keyframes promo-march { to { background-position: 24px 0, -24px 100%, 0 -24px, 100% 24px; } }
    #promo-card { position: fixed; inset: 0; z-index: 2147483645; pointer-events: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
      opacity: 0; transition: opacity 500ms ease; }
    #promo-card.on { opacity: 1; }
    /* The logo, put together on the card: the disc spins up, the ring is drawn, the three letters drop in, and it keeps breathing. */
    #promo-logo { position: relative; width: 300px; height: 300px; margin-bottom: 6px; }
    #promo-logo > * { position: absolute; }
    #promo-logo .disc { left: 9%; top: 9%; width: 82%; height: 82%; border-radius: 50%; background: ${ACCENTS.blue}; box-shadow: 0 0 0 6px ${ACCENTS.pink}, 0 0 70px -6px ${ACCENTS.blue}; transform: scale(0); }
    #promo-card.on .disc { animation: promo-disc 900ms cubic-bezier(.2,.9,.25,1.25) both, promo-breathe 2.6s ease-in-out 1.6s infinite; }
    @keyframes promo-disc { from { transform: scale(0) rotate(-200deg); opacity: 0; } to { transform: none; opacity: 1; } }
    @keyframes promo-breathe { 50% { box-shadow: 0 0 0 6px ${ACCENTS.pink}, 0 0 110px 4px ${ACCENTS.blue}; } }
    #promo-logo .wave { left: 9%; top: 9%; width: 82%; height: 82%; border-radius: 50%; border: 3px solid ${ACCENTS.pink}; opacity: 0; }
    #promo-card.on .wave { animation: promo-wave 2.6s ease-out 1.1s infinite; }
    #promo-card.on .wave + .wave { animation-delay: 2.4s; }
    @keyframes promo-wave { from { opacity: .7; transform: scale(1); } to { opacity: 0; transform: scale(1.75); } }
    #promo-logo .letter { inset: 0; background-size: 100% 100%; opacity: 0; }
    #promo-card.on .letter { animation: promo-drop 620ms cubic-bezier(.2,.9,.25,1.4) both, promo-bob 2.6s ease-in-out infinite; }
    @keyframes promo-drop { from { opacity: 0; transform: translateY(-46px) scale(.6) rotate(-14deg); } to { opacity: 1; transform: none; } }
    @keyframes promo-bob { 0%, 30%, 100% { transform: none; } 15% { transform: translateY(-7px); } }
    #promo-card .line { font: 500 31px/1.3 'Promo Grotesk', Roboto, system-ui, sans-serif; color: #c9d1e0; }
    #promo-card .line + .line { font-weight: 400; font-size: 23px; color: #8b95a8; }
    #promo-card.on .line { animation: promo-word 620ms cubic-bezier(.2,.9,.25,1.1) both; }
    #promo-pointer { position: fixed; left: -40px; top: -40px; z-index: 2147483647; pointer-events: none; }
    #promo-click { position: fixed; z-index: 2147483646; pointer-events: none; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; opacity: 0; box-shadow: 0 0 0 3px var(--promo-accent); }
    #promo-click.on { animation: promo-click 420ms ease-out forwards; }
    @keyframes promo-click { from { opacity: 1; transform: scale(.4); } to { opacity: 0; transform: scale(2.8); } }
    /* Something that repaints every frame, so the recording never stalls on a still picture. */
    #promo-tick { position: fixed; right: 0; bottom: 0; width: 2px; height: 2px; z-index: 2; animation: promo-tick 200ms linear infinite; }
    @keyframes promo-tick { from { background: #0c0e13; } to { background: #0d0f14; } }
  `)
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
  document.documentElement.style.setProperty('--promo-accent', ACCENTS.pink)

  const add = (id, html = '', parent = document.documentElement) => { const el = document.createElement('div'); el.id = id; el.innerHTML = html; parent.appendChild(el); return el }
  // The frame: as wide as the app can be shown whole under the words.
  const root = document.getElementById('root')
  const base = (innerHeight - CAPTION - BAR - BOTTOM) / innerHeight
  const frame = add('promo-frame', '', document.body)
  const frameWidth = Math.round(innerWidth * base)
  const viewHeight = Math.round(innerHeight * base)
  Object.assign(frame.style, { left: `${Math.round((innerWidth - frameWidth) / 2)}px`, top: `${CAPTION}px`, width: `${frameWidth}px` })
  // The three dots get their colours here: a style attribute written into the page is refused like a <style>.
  const bar = add('promo-bar', '<i></i><i></i><i></i><span>MCO — Music Collection Organizer</span>', frame)
  ;['#ff5f57', '#febc2e', '#28c840'].forEach((color, i) => { bar.children[i].style.background = color })
  const viewEl = add('promo-view', '', frame)
  viewEl.style.height = `${viewHeight}px`
  viewEl.appendChild(root)

  const pointer = add('promo-pointer', '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.5 L12 13.5 L19 13.5 Z" fill="white" stroke="black" stroke-width="1.4" stroke-linejoin="round"/></svg>')
  const ring = add('promo-click')
  const captionEl = add('promo-caption')
  const flashEl = add('promo-flash')
  {
    const at = frame.getBoundingClientRect()
    Object.assign(flashEl.style, { left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px`, height: `${at.height}px` })
  }
  const again = (el) => { el.classList.remove('on'); void el.offsetWidth; el.classList.add('on') }
  const spotEl = add('promo-spot')
  const cardEl = add('promo-card')
  add('promo-tick')
  addEventListener('mousemove', (e) => { pointer.style.left = `${e.clientX - 3}px`; pointer.style.top = `${e.clientY - 2}px` }, true)
  addEventListener('mousedown', (e) => {
    ring.style.left = `${e.clientX}px`
    ring.style.top = `${e.clientY}px`
    ring.classList.remove('on')
    void ring.offsetWidth
    ring.classList.add('on')
  }, true)

  // Where the app is inside the frame: `zoom` times its fitted size, moved
  // by (x, y) pixels of the frame — never so far that the frame shows past
  // the app's edges.
  const view = { zoom: 1, x: 0, y: 0 }
  function apply(zoom, x, y) {
    const clamp = (v, low) => Math.max(low, Math.min(0, v))
    view.zoom = zoom
    view.x = clamp(x, frameWidth * (1 - zoom))
    view.y = clamp(y, viewHeight * (1 - zoom))
    root.style.transform = `translate(${view.x}px, ${view.y}px) scale(${base * zoom})`
  }
  apply(1, 0, 0)

  // The backdrop: wide bands lying across the picture, each a slow double
  // wave that travels sideways — some to the right, some to the left, at
  // their own speeds — rising and sinking a little, so they slide over one
  // another. Only movement, nothing to look at. Mostly the logo's blue; two
  // take the scene's colour.
  const flow = document.createElement('canvas')
  flow.id = 'promo-flow'
  flow.width = Math.round(innerWidth / 2)
  flow.height = Math.round(innerHeight / 2)
  document.body.insertBefore(flow, document.body.firstChild)
  const pen = flow.getContext('2d')
  const BANDS = [
    { at: 0.06, fat: 62, sway: 26, speed: 16, phase: 0.0, tint: false },
    { at: 0.27, fat: 44, sway: 34, speed: -11, phase: 2.1, tint: true },
    { at: 0.48, fat: 74, sway: 24, speed: 9, phase: 4.4, tint: false },
    { at: 0.68, fat: 50, sway: 32, speed: -15, phase: 1.2, tint: false },
    { at: 0.86, fat: 66, sway: 28, speed: 12, phase: 3.3, tint: true },
    { at: 1.02, fat: 48, sway: 30, speed: -8, phase: 5.6, tint: false },
  ]
  let accent = ACCENTS.pink
  // The logo's picture (a data URL), and where M, C and O are across it, in 256ths.
  let logo = ''
  const LETTERS = [[42, 102], [102, 153.5], [153.5, 214]]
  function drawFlow(now) {
    const t = now / 1000
    const { width: W, height: H } = flow
    pen.clearRect(0, 0, W, H)
    for (const b of BANDS) {
      // The middle of the band at x, and half its thickness there.
      const lift = H * 0.07 * Math.sin(t / (8 + b.phase * 2) + b.phase * 3)
      const mid = (x) => b.at * H + lift + b.sway * Math.sin((x - t * b.speed) / 150 + b.phase) + b.sway * 0.4 * Math.sin((x - t * b.speed * 1.8) / 63 + b.phase * 2)
      const half = (x) => b.fat * (1 + 0.22 * Math.sin((x - t * b.speed * 1.3) / 110 + b.phase))
      pen.beginPath()
      for (let x = -20; x <= W + 20; x += 8) pen.lineTo(x, mid(x) - half(x))
      for (let x = W + 20; x >= -20; x -= 8) pen.lineTo(x, mid(x) + half(x))
      pen.closePath()
      // Lighter towards one end, so the eye follows it across.
      const fade = pen.createLinearGradient(0, 0, W, 0)
      const color = b.tint ? accent : ACCENTS.blue
      const strength = b.tint ? 0.08 : 0.1
      const hex = (v) => Math.round(v * 255).toString(16).padStart(2, '0')
      const [from, to] = b.speed > 0 ? [0.45, 1] : [1, 0.45]
      fade.addColorStop(0, color + hex(strength * from))
      fade.addColorStop(1, color + hex(strength * to))
      pen.fillStyle = fade
      pen.fill()
    }
    requestAnimationFrame(drawFlow)
  }
  requestAnimationFrame(drawFlow)

  window.promo = {
    accents: ACCENTS,
    accent(color) { accent = color; document.documentElement.style.setProperty('--promo-accent', color) },
    logo(dataUrl) { logo = dataUrl },
    // Text the picture is better without (a mastering suffix a file's own
    // title carries, say): taken out of what the app shows, as it shows
    // it. Only the picture changes — nothing in the library or the files.
    tidy(pattern) {
      const unwanted = new RegExp(pattern, 'g')
      const clean = (node) => {
        const text = node.nodeValue
        // The test first: writing a text node, even unchanged, is another mutation.
        unwanted.lastIndex = 0
        if (text && unwanted.test(text)) node.nodeValue = text.replace(unwanted, '')
      }
      const sweep = (within) => {
        const walker = document.createTreeWalker(within, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) clean(walker.currentNode)
      }
      sweep(root)
      new MutationObserver((changes) => {
        for (const change of changes) {
          if (change.type === 'characterData') clean(change.target)
          else for (const node of change.addedNodes) node.nodeType === Node.TEXT_NODE ? clean(node) : node.nodeType === Node.ELEMENT_NODE && sweep(node)
        }
      }).observe(root, { subtree: true, childList: true, characterData: true })
    },
    // The font of the words, from its file (base64): a FontFace made from
    // bytes isn't fetched, so the page's policy has nothing to refuse.
    async font(base64) {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const face = new FontFace('Promo Grotesk', bytes.buffer, { weight: '300 700' })
      document.fonts.add(await face.load())
    },
    // The whole app in the frame.
    home() { apply(1, 0, 0) },
    // Closer: the point (x, y) of the picture as it is now, brought to the
    // middle of the frame at `zoom` times the fitted size.
    zoomAt(x, y, zoom) {
      const origin = viewEl.getBoundingClientRect()
      const lx = (x - origin.left - view.x) / view.zoom
      const ly = (y - origin.top - view.y) / view.zoom
      apply(zoom, frameWidth / 2 - lx * zoom, viewHeight / 2 - ly * zoom)
    },
    // The frame out of the picture (for the cards), or back in it.
    away(gone) { frame.classList.toggle('away', gone) },
    // A scene's words: the old ones fade, the new arrive a word at a time,
    // and the frame flashes in the scene's colour.
    caption(text) {
      captionEl.classList.remove('on')
      if (!text) return
      setTimeout(() => {
        captionEl.innerHTML = '<div class="sq"></div><div class="text"><div class="line"></div></div>'
        const textEl = captionEl.querySelector('.text')
        text.split(' ').forEach((word, i) => {
          const w = document.createElement('span')
          w.className = 'w'
          w.textContent = word
          w.style.animationDelay = `${120 + i * 60}ms`
          textEl.insertBefore(w, textEl.lastChild)
        })
        captionEl.classList.add('on')
        if (!frame.classList.contains('away')) again(flashEl)
      }, 260)
    },
    // The marching outline, kept inside the frame; no rectangle takes it away.
    spot(rect, pad = 4) {
      if (!rect) return spotEl.classList.remove('on')
      const inside = viewEl.getBoundingClientRect()
      const left = Math.max(inside.left + 8, rect.x - pad)
      const top = Math.max(inside.top + 8, rect.y - pad)
      const right = Math.min(inside.right - 8, rect.x + rect.width + pad)
      const bottom = Math.min(inside.bottom - 8, rect.y + rect.height + pad)
      Object.assign(spotEl.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` })
      spotEl.classList.add('on')
    },
    card(title, lines) {
      if (!title) return cardEl.classList.remove('on')
      cardEl.innerHTML = ''
      // The logo says the name: a disc and ring drawn here, and the picture's
      // three letters, each cut out of it, so they can arrive one by one.
      const logoEl = document.createElement('div')
      logoEl.id = 'promo-logo'
      logoEl.title = title
      logoEl.innerHTML = '<div class="wave"></div><div class="wave"></div><div class="disc"></div>'
      LETTERS.forEach(([left, right], i) => {
        const l = document.createElement('div')
        l.className = 'letter'
        l.style.backgroundImage = `url(${logo})`
        l.style.clipPath = `inset(${(86 / 256) * 100}% ${((256 - right) / 256) * 100}% ${(86 / 256) * 100}% ${(left / 256) * 100}%)`
        l.style.animationDelay = `${620 + i * 150}ms, ${1900 + i * 180}ms`
        logoEl.appendChild(l)
      })
      cardEl.appendChild(logoEl)
      lines.forEach((line, i) => { const l = document.createElement('div'); l.className = 'line'; l.textContent = line; l.style.animationDelay = `${1100 + i * 160}ms`; cardEl.appendChild(l) })
      cardEl.classList.add('on')
    },
  }
})()
