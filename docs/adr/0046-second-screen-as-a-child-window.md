---
status: proposed
date: 2026-09-28
---
# 0046. Show the second screen in a same-origin child window of MCO's page

## Context
"Show on a screen" ([feature](../features/second-screen.md)) needs a full-screen window on another
display, drawing the visualizer from MCO's live audio with no lag, and following the store (theme, track,
settings). Web Audio nodes and the zustand store live in the main window's renderer; a separate
`BrowserWindow` with its own page would have neither. A probe on 2026-09-28
([research](../research/second-screen-window.md)) showed that `window.open` from MCO's page gives a
same-origin child sharing its JavaScript, that a WebGL canvas moved into it keeps working, and that the
child's `requestAnimationFrame` runs at the display's rate.

## Decision
Open the screen with `window.open('', 'mco-screen', 'display=<id>')` and render into it from the main
renderer with a React portal. The main process's `setWindowOpenHandler` allows only that frame name —
placing the window on the chosen display, frameless, black, full screen — and denies every other
`window.open`.

## Alternatives considered
- **A separate `BrowserWindow` loading its own page**, fed over IPC or a `MessagePort` with analyser
  frames (~60 a second) and state: a second copy of the store and theme logic, per-frame IPC, and the main
  window's timers throttled when it's hidden or minimised would stall the feed.
- **Reuse the Cast receiver page** in a window: it plays the audio itself and is driven by Cast
  messages; showing it silently would need a second mode and still no shared analyser.
- **Move MCO's own visualizer overlay to the other display**: one window can't span two displays, and
  MCO's controls would go with it.

## Consequences
- The screen shares the analyser, the store and the theme code directly: no extra latency, little new
  plumbing.
- Styles (fonts, theme variables) must be copied into the child's document; event listeners and
  `requestAnimationFrame`/`ResizeObserver` must be the child's.
- The child lives and dies with the main window's renderer: a reload of MCO's page closes it (fine).
- `window.open` becomes a deliberate, whitelisted capability in the main process.
