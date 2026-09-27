---
status: accepted
date: 2026-09-27
---
# 0045. The 3D themes are back on the TV, rendered at 30 fps

## Context
[ADR 0038](0038-pick-the-tv-screen-in-the-cast-menu.md) offered only the GPU-free TV visualizers
([ADR 0036](0036-tv-only-visualizers-without-gpu.md)) in the Cast menu, because on the Chromecast HD
only Paint ran smoothly. But the receiver let the threejs-visualisers themes render at the TV's full
refresh rate with no cap, so a theme that could hold 30 fps but not 60 stuttered. The user wants to
try them again with a cap.

## Decision
The Cast menu's **On the TV** list also offers every threejs-visualisers theme, labelled **3D: …**.
The receiver drives the three.js `Visualizer` with its own loop, capped at 30 fps
(`visualizer.engine.render()`), instead of the package's uncapped `start()`. A 3D theme gets the
options picked for it in MCO's visualizer. MCO's own full-screen visualizer is capped at 30 fps too.

## Consequences
- The TV-only visualizers stay, for TVs that can't manage a 3D theme even at 30 fps.
- Which 3D themes run smoothly on which devices is for the user to test; results go in
  [research](../research/cast-devices.md#chromecast-hd-gpu).
