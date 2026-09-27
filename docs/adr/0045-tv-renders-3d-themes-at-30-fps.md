---
status: accepted
date: 2026-09-27
---
# 0045. The Cast receiver renders the 3D themes at 30 fps

## Context
The receiver let the threejs-visualisers themes render at the TV's full refresh rate, through the
package's uncapped `Visualizer.start()`. A theme that can hold 30 fps but not 60 then stutters instead
of running evenly. The Cast menu doesn't offer the 3D themes
([ADR 0038](0038-pick-the-tv-screen-in-the-cast-menu.md)): on the Chromecast HD only Paint runs
smoothly ([ADR 0036](0036-tv-only-visualizers-without-gpu.md)). Putting them back in the menu was
tried and dropped again (2026-09-27): not worth it for the Chromecast HD.

## Decision
A frame-rate cap goes into threejs-visualisers itself (0.2.0: the `Visualizer`'s `fps` option,
default 30, and `FrameLimiter`/`FPS_CHOICES` for apps with their own loop; the themes' motion and
audio smoothing follow each frame's duration). The receiver creates its `Visualizer` with `fps: 30`.
MCO's own full-screen visualizer uses `FrameLimiter`, with a **Frame rate** picker (15/24/30/60/Max,
default 30) to keep the Mac's GPU cool. The Cast menu still offers only the TV visualizers.

## Consequences
- If the 3D themes come back to the Cast menu (e.g. for more capable devices such as a Google TV
  Streamer), the receiver is ready to render them at a steady 30 fps.
