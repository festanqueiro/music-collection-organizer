# Second-screen window probe (2026-09-28)

Checked in the BETA (Electron, Chrome/150) over the DevTools protocol, to see whether MCO's page can
drive a second window directly ([ADR 0046](../adr/0046-second-screen-as-a-child-window.md)).

- `window.open('about:blank', 'mco-screen-test', 'width=320,height=200')` opened a window: MCO sets no
  `setWindowOpenHandler`, so Electron's default allowed it. `child.opener === window` (same-origin,
  shared JavaScript).
- A canvas created in the main document with a `webgl2` context, cleared red, then appended to the
  child's `document.body`: `isContextLost()` false; clearing it green afterwards and `readPixels` gave
  `[0, 255, 0, 255]` — the context keeps working after the move.
- The child's `requestAnimationFrame` ran 122 times in a second (the MacBook's 120 Hz display).
- Nothing else in MCO calls `window.open` or opens links in new windows (only `shell.openExternal` for
  release notes), so allowing one named frame and denying the rest changes nothing else.

Not yet checked (needs the Apple TV): an AirPlay "Use As Separate Display" showing up in
`screen.getAllDisplays()`, full screen on it, and AirPlay's audio latency.

## Prerequisites check (2026-09-28)
- **macOS 26.2** (25C56): AirPlay "Use As Separate Display" available.
- `defaults read com.apple.spaces spans-displays`: unset → "Displays have separate Spaces" is on (the
  default), so a window can be full screen on one display without taking over the others.
- **Electron 43.4.1 / Chrome 150** `screen.getAllDisplays()` (a throwaway Electron script): one display,
  `{ id: 1, label: "Built-in Retina Display", internal: true, bounds: 1512×982, scaleFactor: 2,
  displayFrequency: 120 }` — names and the internal flag are there for the display list.
- `dns-sd -B _airplay._tcp`: only "MacBook Pro (Francisco)" (the Mac's own AirPlay receiver); no Apple
  TV yet.
- MCO's audio outputs (`enumerateDevices`, BETA): AirPods and MacBook Pro Speakers; no AirPlay output
  (macOS adds one only when picked in Control Center → Sound).
- Displays (`system_profiler SPDisplaysDataType`): Apple M1 Pro, built-in Liquid Retina XDR only.
