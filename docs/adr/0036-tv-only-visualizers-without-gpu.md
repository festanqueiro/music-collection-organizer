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
Themes that exist only for the Cast receiver: **Drift** (particles on a slowly turning flow field,
thrown outward on kicks), **Ripples** (rings from the kicks whose outlines keep morphing — each ring has
its own few drifting wobbles following spectrum bands, plus a breathing stretch — around a bass core),
**Ridges** (the spectrum's recent history as stacked lines in perspective, gliding back, swaying and
pulsing — "Unknown Pleasures" style), **Mandala** (a spectrum-shaped motif mirrored round 6/8/12-fold,
rotating and pulsing), **Smoke** (a 2D take on the three.js Smoke theme: pre-drawn soft puffs rising
from a lamp that pumps with the kick, tinted, with two stage beams sweeping through) and **Scope**
(oscilloscope with a phosphor trail). Every theme's colour option includes **Color Changing** (the hue
goes round the wheel in ~45 s). Spectrum and VU Meters existed briefly on 2026-09-27 and were removed.
Defined in
`src/cast/tvVisualizers.ts` and rendered by `cast-receiver/tvVisualizer.ts` on a 480×270 2D canvas
created with `willReadFrequently` (Chromium rasterizes it in software, on the CPU), at 30 fps, scaled up
to the screen. When one is chosen the three.js visualizer isn't created or run at all. While casting
to a screen, MCO's picker offers **only** these, and the TV's choice is remembered separately from this
Mac's (`castVisualizerTheme`); when not casting, only this Mac's themes are offered. Kicks are detected
as a sharp rise in bass with at least 0.25 s between them (tested).

## Alternatives considered
- Lighter three.js settings per theme: still WebGL on the weak GPU; deferred, not replaced.
- Putting them in threejs-visualisers: they're TV-specific and don't need three.js.

## Consequences
- Compositing one canvas layer is the only GPU work left (unavoidable for any page).
- Only 2D fills, lines and arcs — cheap on the CPU. Checked in Electron with a test signal: all six
  render and **no WebGL context is ever created**; smoothness on the Chromecast itself is still to be
  confirmed.
