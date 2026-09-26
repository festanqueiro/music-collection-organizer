---
status: accepted
date: 2026-09-27
---
# 0038. Pick what the TV shows in the Cast menu

## Context
Until now the TV showed a visualizer only while MCO's own visualizer was open: opening it while
casting put a controls-only overlay on the Mac (theme, options, *Hide track info*) that drove the TV
([ADR 0036](0036-tv-only-visualizers-without-gpu.md)). The user found that indirect and asked for the
choice to live in the Cast menu, with MCO's visualizer off while casting to a screen.

## Decision
- While casting to a screen, the Cast menu has an **On the TV** list: **Now playing (track details)**
  or one of the TV visualizers (Drift, Ripples, Mandala, Scope), plus *Hide track info* when a
  visualizer is picked. The choice is `castScreen` in the store (`'now-playing' | TvVisualizerId`),
  kept in localStorage, and synced to the receiver as the `display` message (protocol unchanged).
- MCO's **Visualizer** button is dimmed while casting to a screen; pressing it shows *Go to the Cast
  menu to pick a visualizer*. If the visualizer is open when casting to a screen starts, it closes.
  With a speaker (audio only), the visualizer works as usual on the Mac.
- TV visualizers have **no options for now**: colours always shift slowly (*Color Changing*) and the
  Mandala is 6-fold (`TV_VISUALIZER_OPTIONS`). The receiver still understands the other values.

Supersedes the "while casting, the picker offers only the TV themes" part of ADR 0036.

## Alternatives considered
- Keep the controls-only overlay: two places to look, and it covered MCO while casting.
- A select box in the player bar: the Cast menu is where everything about the TV already is.

## Consequences
- The TV's screen can be changed without leaving MCO's main view.
- The old per-theme TV options stored in `visualizerThemeOptions` and `castVisualizerTheme` are
  ignored; the first cast after updating shows **Now playing**.
