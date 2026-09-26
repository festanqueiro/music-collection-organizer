---
status: accepted
date: 2026-09-27
---
# 0036. TV-only visualizers drawn without the GPU

## Context
On the Chromecast HD only the Paint theme runs smoothly; the other threejs-visualisers themes use
full-screen shaders, bloom or many particles the TV's GPU can't keep up with
([research](../research/cast-devices.md#chromecast-hd-gpu)). The user asked for visualizers made for
casting that don't use the GPU.

## Decision
Three themes that exist only for the Cast receiver — **Spectrum** (LED bars with peak caps), **Scope**
(oscilloscope with a phosphor trail) and **VU Meters** (level and bass needles) — defined in
`src/cast/tvVisualizers.ts` and rendered by `cast-receiver/tvVisualizer.ts` on a 480×270 2D canvas
created with `willReadFrequently` (Chromium rasterizes it in software, on the CPU), at 30 fps, scaled up
to the screen. When one is chosen the three.js visualizer isn't created or run at all. MCO's picker
offers them only while casting to a screen; this Mac keeps rendering its own theme otherwise.

## Alternatives considered
- Lighter three.js settings per theme: still WebGL on the weak GPU; deferred, not replaced.
- Putting them in threejs-visualisers: they're TV-specific and don't need three.js.

## Consequences
- Compositing one canvas layer is the only GPU work left (unavoidable for any page).
- Only 2D fills, lines and arcs — cheap on the CPU. Checked rendering in Electron with a test signal;
  smoothness on the Chromecast itself is still to be confirmed.
