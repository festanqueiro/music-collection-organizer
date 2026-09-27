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
The receiver drives the three.js `Visualizer` with its own loop, capped at 30 fps
(`visualizer.engine.render()`), instead of `start()`/`stop()`. MCO's own full-screen visualizer is
capped at 30 fps too, to keep the Mac's GPU cool. The Cast menu still offers only the TV visualizers.

## Consequences
- If the 3D themes come back to the Cast menu (e.g. for more capable devices such as a Google TV
  Streamer), the receiver is ready to render them at a steady 30 fps.
