---
status: shipped
updated: 2026-09-26
adrs: [0014]
---
# Visualizer

A full-screen, audio-reactive visualizer built on `three.js`. Open it from
the player bar's **Visualizer** button; close it with **Esc** or its close
button. It stays open across track changes and reacts to the post-FX
output (after FX and master volume), so EQ/filter moves show up in it.

Options (saved per theme):

- **Theme** — Nebula, Warp, Horizon, Sound System, Smoke, Kaleidoscope,
  Paint, or Liquid 3D (keys **1–8** switch while it's open);
- **Hide track info** — hides the title/artist overlay;
- per-theme options (below).

## Themes

- **Horizon** — a retro landscape: the spectrum scrolls towards you as
  rolling terrain under a sun and a starfield.
- **Nebula** — a glowing core that pulses and warps with the music,
  ringed by spectrum rings.
- **Warp** — a tunnel of spectrum-shaped rings rushing past.
- **Sound System** — a speaker stack in a scene, with cones that recoil,
  pressure rings and glows on the kicks. Its options:
  - **Stack**: *Classic* (built-in geometry) or *Mais Baixo* (a Blender
    model, loaded the first time it's picked);
  - **Colours**: *MCO*, *Black & White*, or *Natural* (the model's own
    wood textures);
  - **Background**: *Field* or *Urban*.
- **Smoke** — a smoky club: smoke rolling up from a lamp that pumps with
  the kick, stage beams sweeping through it. **Colours**: *Shifting*,
  *Amber*, *Violet*, *Ghost*.
- **Kaleidoscope** — mirrored wedges of neon rings lit by the spectrum;
  kicks punch the zoom and flick the mirrors round. **Mirrors**: *8*, *6*,
  *12*; **Colours**: *Vivid*, *Soft*.
- **Paint** — paint flung at a black wall: splats on the kicks, bright
  whips on the mids and highs, sinking to dark stains. **Colours**:
  *Yellow*, *Shifting*, *Mixed*.
- **Liquid 3D** — raymarched liquid blobs flowing into each other in
  front of a fixed camera; bass and kicks merge and ripple them.
  **Style**: *3D* or *Lo-Res* (big dithered pixels in a few colours);
  **Palette**: *Shifting*, *Mercury*, *Game Boy*, *Amber*, *CGA*.

While casting to a TV, the picker offers only the TV's own themes — **Spectrum**, **Scope**, **VU
Meters**, **Drift**, **Ripples** and **Ridges** — drawn without the GPU; the themes above aren't offered
then, and the TV visualizers never appear when not casting
([ADR 0036](../adr/0036-tv-only-visualizers-without-gpu.md)).

While casting to a TV, opening the visualizer shows it on the TV instead,
rendered there, and this overlay shows just its controls (see
[Casting](casting.md)).

The Mais Baixo model is exported from Blender by
`scripts/blender/export-system-mb.py` into the threejs-visualisers repo
(`src/assets/system-mb.glb`).

Code: `src/components/Visualizer.tsx` (overlay, render loop, picker). The
themes, the renderer and the spectrum/beat analysis are the
[threejs-visualisers](https://github.com/festanqueiro/threejs-visualisers)
package; `src/audio/audioAnalysis.ts` only tracks which track's analyser
is live.

## Limits & open questions
- On a Chromecast HD only **Paint** runs smoothly when casting
  ([research](../research/cast-devices.md#chromecast-hd-gpu)); TV quality settings are on the roadmap.
