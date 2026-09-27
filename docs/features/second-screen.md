---
status: planned
updated: 2026-09-28
adrs: [0046, 0047]
---
# Show on a screen (Apple TV, projector, second display)

## What it does
Puts MCO's visualizer (with the track info) full screen on a second display — an Apple TV used as an
AirPlay display, a projector, an HDMI monitor — while you keep working in MCO on the Mac. The Mac draws
it, so every 3D theme runs smoothly (unlike on a Chromecast), and it reacts to exactly what MCO plays:
FX, siren, track changes, with nothing to connect or drop. A **Visual delay** setting holds the visuals
back to match audio that arrives late (AirPlay speakers, a Bluetooth speaker, a PA fed over a network).

## Prerequisites

### For the user (Apple TV)
- An **Apple TV** (4K recommended; any model with AirPlay works) on the **same network** as the Mac,
  AirPlay enabled on it (Settings → AirPlay and HomeKit → Allow Access).
- On the Mac: **Control Center → Screen Mirroring → the Apple TV → "Use As Separate Display"** (not
  "Mirror Built-in Display": mirroring shows the whole Mac screen, MCO's controls included). macOS then
  treats the TV as a second display, which is what MCO offers in its list.
- Where the **sound** goes is the user's choice, independent of the picture:
  - from the Mac / mixer / PA (lowest latency; set **Visual delay** to 0 or tune it by eye), or
  - to the Apple TV: pick it as the Mac's sound output (Control Center → Sound, or MCO's Settings →
    Audio output once macOS lists it). AirPlay audio is ~1–2 s late: set **Visual delay** to match.
- Any other display works the same with no setup: a projector or monitor over HDMI/USB-C, or a second
  Mac/iPad as a Sidecar/AirPlay display.
- Without a second display, the screen can still open as a **window** on the Mac's own display (to try
  it, or to drag it onto a display macOS doesn't offer as separate).

### For the code (done before this feature, or checked)
- **One audio engine** ([ADR 0041](../adr/0041-one-audio-engine.md)): one `AudioContext` whose music bus
  (track + siren) can feed a delayed analyser — the visual delay's tap ([ADR 0047](../adr/0047-visual-delay-in-the-audio-graph.md)).
- **threejs-visualisers ≥ 0.2.0**: `VisualizerEngine`, `FrameLimiter`/`FPS_CHOICES`, and motion that
  follows each frame's real duration (any frame rate looks right).
- **Feasibility, checked on 2026-09-28 in BETA** ([research](../research/second-screen-window.md)):
  `window.open` from MCO's page gives a same-origin child window sharing its JavaScript; a WebGL canvas
  created in the main page and moved into the child keeps its context; the child's
  `requestAnimationFrame` runs at the display's rate. Nothing else in MCO opens windows, so the main
  process can allow exactly this one ([ADR 0046](../adr/0046-second-screen-as-a-child-window.md)).
- **Checked on this Mac, 2026-09-28** ([research](../research/second-screen-window.md#prerequisites-check-2026-09-28)):

  | Prerequisite | Result |
  |---|---|
  | macOS with AirPlay "Use As Separate Display" | ✅ macOS 26.2 |
  | "Displays have separate Spaces" (full screen per display) | ✅ on (default, `spans-displays` unset) |
  | Electron's `screen` API: names, internal flag, size, refresh rate | ✅ Electron 43.4.1 / Chrome 150; e.g. "Built-in Retina Display", internal, 1512×982, 120 Hz |
  | Child window + WebGL + its own animation loop | ✅ (probe above) |
  | Audio engine with a music bus for the visual tap | ✅ (ADR 0041) |
  | threejs-visualisers ≥ 0.2.0 | ✅ v0.2.0 |
  | A second display to test with | ⏳ only the built-in display now (an HDMI monitor or an iPad via Sidecar would do before the Apple TV) |
  | An AirPlay display on the network | ⏳ none yet (only this Mac's own AirPlay receiver) |
  | The Apple TV as a sound output in MCO | ⏳ macOS lists an AirPlay output only once it's picked in Control Center → Sound ([AirPlay research](../research/cast-devices.md#airplay)) |

- Still to check when the Apple TV is here: that macOS lists it as a display for Electron's `screen`
  API ("Use As Separate Display"), full screen on it, and AirPlay's actual audio latency.

## Behaviour
- **Screen** button in the player bar, after Cast (lit while showing), opening a popover like Cast's:
  - **Display**: the other displays by name (e.g. "Living Room" for an Apple TV, "DELL U2720Q"), plus
    **A window on this display**. With no other display: a hint on how to add one (the Apple TV steps
    above). The list follows displays being connected and disconnected.
  - **Theme** and its options (the visualizer's, chosen separately from the Mac's own visualizer, and
    remembered), **Hide track info**, **Frame rate** (the visualizer's setting, shared).
  - **Visual delay** (the app-wide setting below).
  - **Show** / **Stop showing**, and "Showing on Living Room" while it is.
- **The screen**: black, full screen on that display (a normal window for "A window on this display"),
  the visualizer filling it, with the track's title and artist (and BPM, key, next track) unless hidden,
  appearing on track changes as on the Mac's visualizer. No controls on it (it's for the audience); no
  cursor.
- It keeps running across track changes, pauses (the visuals settle, as the Mac's do) and screens in
  MCO; closing MCO's window or quitting closes it. Unplugging the display (or the Apple TV going away)
  closes it and says so. The Mac and its displays don't sleep while it's showing.
- It works alongside the Mac's own visualizer, casting and recording — they don't depend on each other.
  (Casting to a TV *and* showing on the Apple TV at once is allowed; each shows its own picture.)
- **Visual delay** — an app-wide setting in **Settings → Audio** (and in the Screen popover): 0–3000 ms,
  steps of 10 ms, default 0, remembered. It delays everything visual that follows the music — the second
  screen and the Mac's full-screen visualizer — and the second screen's track info (a track change shows
  after the delay). The sound, the waveform/playhead in the player and the Cast receiver are untouched.

## How it works
- **Window** ([ADR 0046](../adr/0046-second-screen-as-a-child-window.md)): the renderer calls
  `window.open('', 'mco-screen', 'display=<id>')`; the main process's `setWindowOpenHandler` on the main
  window allows only the frame name `mco-screen`, placing it on that display's bounds (frameless, black,
  full screen via `did-create-window` → `setFullScreen(true)`), and denies anything else. React renders
  the screen into the child's document with `createPortal` (styles copied into its `<head>`); a
  `VisualizerEngine` drives it from the child's `requestAnimationFrame` with a `FrameLimiter`. Closing:
  the renderer closes the child; the child closing itself (Cmd+W, display gone) updates the store.
- **Displays**: `screen:getDisplays` (Electron `screen.getAllDisplays()`: id, label, size, internal,
  whether MCO's window is on it) and a `screen:displays` push on `display-added/removed/metrics-changed`.
- **Visual delay** ([ADR 0047](../adr/0047-visual-delay-in-the-audio-graph.md)): the engine's music bus
  feeds a `DelayNode` → `AnalyserNode` ("visual tap", built on first use); `setVisualDelay(seconds)`. The
  second screen and the Mac's visualizer read that analyser instead of the per-track one. Track info on
  the second screen changes after the same delay (a timer).
- **Store**: `screenDisplayId` (null = not showing), `screenTheme`, `screenHideTrackInfo`, theme options
  shared with the visualizer's per-theme options, `visualDelayMs` (localStorage, like the visualizer's
  preferences).
- **Power**: the existing `power:keepDisplayAwake` while showing.

## Tests
- Unit: the display list mapping (labels, "this display" excluded or marked), the window-open handler's
  allow/deny and placement (pure function of frame name, features and displays), the visual tap's delay
  setting (fake context, like `audioEngine.test.ts`), the delayed track-info timer.
- BETA over DevTools: open on "A window on this display", screenshot; theme/option/hide changes reach
  it; closing either side updates the other; the visual delay measured (a click through the siren vs. the
  analyser's response).
- By hand, with the Apple TV: Use As Separate Display → listed → full screen on the TV; AirPlay audio
  latency measured and matched with Visual delay; unplug/sleep the Apple TV mid-show.

## Limits & open questions
- **Now-playing screen** (artwork, stats, up next — the Cast receiver's) on the second screen: not in
  the first version. Its code lives in `cast-receiver/` as plain DOM driven by Cast messages; reusing it
  means extracting it into shared components first.
- **AirPlay's audio latency varies** by device and network; a fixed delay may drift. A "measure"
  helper (flash + click, the user adjusts until they line up) could come later.
- Does full screen on a second macOS display need "Displays have separate Spaces" on (the default)? To
  check with the Apple TV.
- Mirroring instead of a separate display shows MCO's whole window; nothing to do in MCO, only to say
  in the hint.
- HDR/refresh: an Apple TV display runs at 60 Hz; the default 30 fps is fine; Max follows it.
