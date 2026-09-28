---
status: accepted
date: 2026-09-28
---
# 0048. One now-playing screen, shared by the Cast receiver and the second screen

## Context
The second screen ([ADR 0046](0046-second-screen-as-a-child-window.md)) should be able to show the
Cast receiver's now-playing page (artwork, stats, up next, waveform) instead of a visualizer. That page
lived in `cast-receiver/` as plain DOM code tied to the receiver's globals (its `<audio>` element, the
markup in `index.html`), driven by Cast messages.

## Decision
Pull the page out into `cast-receiver/nowPlaying.ts` (a `NowPlayingScreen` class that builds its markup
into a given root, in that root's document, and takes a `playback()` callback for the playhead) and
`nowPlaying.css`. The receiver's `main.ts` keeps the audio, the TV visualizers and the Cast messaging and
calls the class; the second screen renders it into its child window and feeds it the same `queue`
message the TV gets (`buildReceiverQueue`), from MCO's store, after the Visual delay.

## Alternatives considered
- **Rewrite the page in React for the desktop app**: two copies of the same layout that would drift.
- **Load the published receiver page in the child window** and talk to it over `postMessage`: a
  cross-origin page from GitHub Pages (needs the network, can't read `media://` artwork), and it would
  try to play the audio itself.

## Consequences
- A change to the now-playing screen shows on both the TV and the second screen; the receiver
  redeploys on every merge anyway.
- The class must stay framework-free (the receiver bundles no React) and must use its root's document,
  not the global one.
- The receiver's page is now built by script (its `index.html` body is empty until `main.ts` runs).
