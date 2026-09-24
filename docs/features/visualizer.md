# Visualizer

A full-screen, audio-reactive visualizer built on `three.js`. Open it from
the player bar's visualizer button; close it with **Esc** or its close
button. It stays open across track changes and reacts to the post-FX
output (after FX and master volume), so EQ/filter moves show up in it.

Options (saved per theme):

- **Theme** — Horizon, Nebula, Warp, or Sound System;
- **Hide track info** — hides the title/artist overlay;
- per-theme options (below).

## Themes

- **Horizon** — a retro landscape: the spectrum scrolls towards you as
  rolling terrain under a sun and a starfield.
- **Nebula** — a glowing core that pulses and warps with the music,
  ringed by spectrum rings.
- **Warp** — a tunnel of spectrum-shaped rings rushing past.
- **Sound System** — a speaker stack in a scene, with cones that recoil,
  pressure rings, glows, and dust on the kicks. Its options:
  - **Stack**: *Classic* (built-in geometry) or *SYSTEM MB* (a Blender
    model, loaded the first time it's picked);
  - **Colours**: *App*, *Black & White*, or *Natural* (the model's own
    wood textures);
  - **Background**: *Field* or *Urban*.

The SYSTEM MB model is exported from Blender by
`scripts/blender/export-system-mb.py` to
`src/visualizer/assets/system-mb.glb`.

Code: `src/components/Visualizer.tsx`, `src/visualizer/` (`themes/`,
`shared.ts`), `src/audio/audioAnalysis.ts` (spectrum bands).
