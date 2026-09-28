---
status: shipped
updated: 2026-09-28
adrs: [0046, 0047, 0048]
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
  - **Displays**: the other displays by name, size and refresh rate (e.g. "Living Room", "DELL U2720Q
    · 2560×1440 · 60 Hz"), plus **A window on this display**. Clicking one shows it there (or moves it).
    With no other display: a hint on how to add one (the Apple TV steps above). The list follows
    displays being connected and disconnected.
  - **Show**: **Now playing (track details)** — the Cast receiver's now-playing screen — or a
    visualizer theme (chosen separately from the Mac's own visualizer, and remembered; each theme's
    options are the visualizer's, shared). **Hide track info** (visualizer only). The frame rate is
    the visualizer's setting. Switching keeps the window; only its contents change.
  - **Visual delay** (the app-wide setting below).
  - "Showing on Living Room" / "Showing in a window" with **Stop** while it is.
- **The screen**: black, full screen on that display (a normal window for "A window on this display"),
  the visualizer filling it, with the track's title, artist, BPM and the next track along the bottom
  unless hidden (sized to the screen). No controls on it (it's for the audience); no
  cursor.
- **Now playing** on the screen: the same page a Google TV shows while casting — the artwork (and a
  blurred wash of it behind), album/year, title, artist, genre and subgenre chips, the eight stats
  (BPM, key, energy, loudness, format, added, played, folder), Up next (three tracks, with mix hints),
  Just played, the queue's length and end time, the session's length and plays, the engaged FX and
  the waveform with the playhead. Before anything plays: "Load a song to continue". Everything on
  it — the track change, the playhead, the FX lights — runs the Visual delay behind the player.
- It keeps running across track changes, pauses (the visuals settle, as the Mac's do) and screens in
  MCO; closing MCO's window or quitting closes it. Unplugging the display (or the Apple TV going away)
  closes it and says so ("The screen's display was disconnected"); closing the window itself (Cmd+W)
  says "The screen was closed". The Mac and its displays don't sleep while it's showing.
- It works alongside the Mac's own visualizer, casting and recording — they don't depend on each other.
  (Casting to a TV *and* showing on the Apple TV at once is allowed; each shows its own picture.)
- **Visual delay** — an app-wide setting in **Settings → Audio** (and in the Screen popover): 0–3000 ms,
  steps of 10 ms, default 0, remembered. It delays everything visual that follows the music — the second
  screen and the Mac's full-screen visualizer — and the second screen's track info (a track change shows
  after the delay). The sound, the waveform/playhead in the player and the Cast receiver are untouched.

## How it works
- **Window** ([ADR 0046](../adr/0046-second-screen-as-a-child-window.md)): the renderer calls
  `window.open('', 'mco-screen-<time>', 'display=<id>|window')` (`src/components/SecondScreen.tsx`); the
  main process's `setWindowOpenHandler` on the main window (`electron/main/screenWindow.ts`,
  `screenWindowPlan`) allows only frame names starting `mco-screen`, placing it on that display's bounds
  (frameless, black, then `setFullScreen(true)` in `did-create-window`) or as a 960×540 window centred on
  MCO, and denies anything else. React renders
  the screen into the child's document with `createPortal` (styles copied into its `<head>`); a
  `VisualizerEngine` drives it from the child's `requestAnimationFrame` with a `FrameLimiter`. Closing:
  the renderer closes the child; the child closing itself (Cmd+W, display gone) updates the store.
- **Displays**: `screen:getDisplays` (Electron `screen.getAllDisplays()`: id, label, size, internal,
  whether MCO's window is on it) and a `screen:displays` push on `display-added/removed/metrics-changed`.
- **Visual delay** ([ADR 0047](../adr/0047-visual-delay-in-the-audio-graph.md)): the engine's music bus
  feeds a `DelayNode` → `AnalyserNode` ("visual tap", built on first use); `setVisualDelay(seconds)`. The
  second screen and the Mac's visualizer read that analyser instead of the per-track one. Track info on
  the second screen changes after the same delay (a timer).
- **Now playing** (`src/components/SecondScreenNowPlaying.tsx`): the receiver's now-playing screen
  was pulled out of `cast-receiver/main.ts` into `cast-receiver/nowPlaying.ts` (`NowPlayingScreen`:
  markup, rendering, session "played" tracking; `load`/`clear`/`setQueue`/`setEffects`/
  `setSirenHeld`) and `nowPlaying.css` (injected into the child's `<head>` via `?inline`). The
  second screen feeds it the same `queue` message the TV gets (`buildReceiverQueue`), with artwork
  from `tracks:getArtwork` (data URLs, cached), throttled like `receiverSync.ts`; each change is
  applied after the Visual delay (timers). The playhead comes from a `PlaybackTimeline`
  (`src/state/playbackTimeline.ts`): a sample on every progress/play/track change, read at
  now − delay and moved on in real time between samples.
- **Store**: `screenTarget` (a display id, `'window'`, or null = not showing), `screenNowPlaying`, `screenTheme`, `screenHideTrackInfo`, theme options
  shared with the visualizer's per-theme options, `visualDelayMs` (localStorage, like the visualizer's
  preferences).
- **Power**: the existing `power:keepDisplayAwake` while showing.

## Tests
- Unit: `electron/main/screenWindow.test.ts` (the display list's names and "MCO is on it", parsing the
  target, the window-open plan: refused unless it's the screen, refused for a display that's gone, a
  display's bounds + full screen, a window centred on MCO) and `src/audio/audioEngine.test.ts` (the visual
  tap is built on first use with the delay already set; the delay is clamped and reaches the live tap)
  and `src/state/playbackTimeline.test.ts` (the delayed playhead: idle, playing moves on up to the
  end, paused holds, a past moment reads the sample then — the old track just after a change — and
  old samples are dropped).
- The refactored receiver page, built and opened with `?dev` in Chrome (2026-09-28): the waiting
  screen, then a load + queue message → the details, eight stats, Up next and waveform as before.
- BETA over DevTools (2026-09-28): the popover lists "A window on this display" and the no-display hint;
  choosing it opens "MCO Screen" (960×540, WebGL canvas, styles and fonts copied) drawing Nebula
  (screenshot); **Stop** closes it; closing the window from its side resets the button with "The screen
  was closed".
- To do by hand: a real second display (monitor/iPad Sidecar); with the Apple TV, Use As Separate
  Display → listed → full screen on the TV; AirPlay audio latency measured and matched with Visual delay;
  unplugging or sleeping the Apple TV mid-show.

## Limits & open questions
- **Now playing** uses the Cast receiver's layout as is (sized in rem = 1/60 of the screen height), so
  it looks the same on the Apple TV as on a Google TV; MCO's own styles are copied into the window
  too (for the visualizer), and only its global resets (`box-sizing`, heading sizes) reach it.
- **AirPlay's audio latency varies** by device and network; a fixed delay may drift. A "measure"
  helper (flash + click, the user adjusts until they line up) could come later.
- Does full screen on a second macOS display need "Displays have separate Spaces" on (the default)? To
  check with the Apple TV.
- Mirroring instead of a separate display shows MCO's whole window; nothing to do in MCO, only to say
  in the hint.
- HDR/refresh: an Apple TV display runs at 60 Hz; the default 30 fps is fine; Max follows it.
