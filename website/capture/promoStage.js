// What the promo video draws in the app's page, around and over the app
// (run in the page by promo.mjs; see promo.md):
//
// - a dark backdrop, and on it the app in a window frame — a title bar and
//   a border in the scene's colour — that the app never leaves;
// - the scene's words above the frame, always;
// - zooms inside the frame (`window.promo.zoomAt`), a pointer, a marching
//   outline around what's being shown, and the title and end cards.
//
// The app's own layout isn't touched: #root is moved into the frame and
// only gets a transform.
(() => {
  const ACCENTS = { yellow: '#ffd23f', pink: '#ff5fa2', blue: '#4cc9f0', lime: '#9ef01a', orange: '#ff9f1c', red: '#ff4d6d', violet: '#a78bfa' }
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
    #promo-bar { height: ${BAR}px; display: flex; align-items: center; gap: 7px; padding: 0 12px; background: #161a23; border-bottom: 1px solid rgba(255,255,255,.08);
      font: 500 12px/1 Roboto, system-ui, sans-serif; color: #8b95a8; }
    #promo-bar i { width: 11px; height: 11px; border-radius: 50%; display: block; }
    #promo-bar span { flex: 1; text-align: center; margin-right: 54px; letter-spacing: .04em; }
    #promo-view { position: relative; overflow: hidden; }
    #root { position: absolute; left: 0; top: 0; width: 100vw; height: 100vh; transform-origin: 0 0; will-change: transform; background: var(--color-bg);
      transition: transform 950ms cubic-bezier(.22,.8,.2,1); }
    #promo-caption { position: fixed; left: 0; right: 0; top: 0; height: ${CAPTION}px; z-index: 2147483646; pointer-events: none;
      display: flex; align-items: center; justify-content: center; gap: 16px; white-space: nowrap;
      font: 700 34px/1.1 Roboto, system-ui, sans-serif; letter-spacing: .005em; color: #fff; text-shadow: 0 2px 18px rgba(0,0,0,.6);
      opacity: 0; transform: translateY(10px); transition: opacity 280ms ease, transform 280ms ease; }
    #promo-caption.on { opacity: 1; transform: none; }
    #promo-caption::before { content: ''; width: 14px; height: 14px; border-radius: 4px; background: var(--promo-accent); box-shadow: 0 0 18px var(--promo-accent);
      animation: promo-pulse 900ms ease-in-out infinite; }
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
    #promo-card .title { font: 800 120px/1 Roboto, system-ui, sans-serif; letter-spacing: .04em;
      background: linear-gradient(100deg, #ffd23f, #ff5fa2 35%, #a78bfa 62%, #4cc9f0); background-size: 220% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
      animation: promo-sheen 3.2s ease-in-out infinite alternate; }
    @keyframes promo-sheen { to { background-position: 100% 0; } }
    #promo-card .line { font: 500 30px/1.3 Roboto, system-ui, sans-serif; color: #c9d1e0; }
    #promo-card .line + .line { font-weight: 400; font-size: 23px; color: #8b95a8; }
    #promo-pointer { position: fixed; left: -40px; top: -40px; z-index: 2147483647; pointer-events: none; }
    #promo-click { position: fixed; z-index: 2147483646; pointer-events: none; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; opacity: 0; box-shadow: 0 0 0 3px var(--promo-accent); }
    #promo-click.on { animation: promo-click 420ms ease-out forwards; }
    @keyframes promo-click { from { opacity: 1; transform: scale(.4); } to { opacity: 0; transform: scale(2.8); } }
    /* Something that repaints every frame, so the recording never stalls on a still picture. */
    #promo-tick { position: fixed; right: 0; bottom: 0; width: 2px; height: 2px; z-index: 2; animation: promo-tick 200ms linear infinite; }
    @keyframes promo-tick { from { background: #0c0e13; } to { background: #0d0f14; } }
  `)
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
  document.documentElement.style.setProperty('--promo-accent', ACCENTS.yellow)

  const add = (id, html = '', parent = document.documentElement) => { const el = document.createElement('div'); el.id = id; el.innerHTML = html; parent.appendChild(el); return el }
  // The frame: as wide as the app can be shown whole under the words.
  const root = document.getElementById('root')
  const base = (innerHeight - CAPTION - BAR - BOTTOM) / innerHeight
  const frame = add('promo-frame', '', document.body)
  const frameWidth = Math.round(innerWidth * base)
  const viewHeight = Math.round(innerHeight * base)
  Object.assign(frame.style, { left: `${Math.round((innerWidth - frameWidth) / 2)}px`, top: `${CAPTION}px`, width: `${frameWidth}px` })
  add('promo-bar', '<i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span>MCO — Music Collection Organizer</span>', frame)
  const viewEl = add('promo-view', '', frame)
  viewEl.style.height = `${viewHeight}px`
  viewEl.appendChild(root)

  const pointer = add('promo-pointer', '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.5 L12 13.5 L19 13.5 Z" fill="white" stroke="black" stroke-width="1.4" stroke-linejoin="round"/></svg>')
  const ring = add('promo-click')
  const captionEl = add('promo-caption')
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

  window.promo = {
    accents: ACCENTS,
    accent(color) { document.documentElement.style.setProperty('--promo-accent', color) },
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
    caption(text) {
      captionEl.classList.remove('on')
      if (text) setTimeout(() => { captionEl.textContent = text; captionEl.classList.add('on') }, 260)
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
      const t = document.createElement('div')
      t.className = 'title'
      t.textContent = title
      cardEl.appendChild(t)
      for (const line of lines) { const l = document.createElement('div'); l.className = 'line'; l.textContent = line; cardEl.appendChild(l) }
      cardEl.classList.add('on')
    },
  }
})()
