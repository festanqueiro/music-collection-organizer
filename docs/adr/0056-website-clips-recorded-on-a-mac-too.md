---
status: accepted
date: 2026-10-02
supersedes: the "macOS can redo the screenshots only" part of 0054
---
# 0056. Record the website's clips on a Mac too, with Playwright's video

## Context
[ADR 0054](0054-website-captured-from-the-real-app.md) records the site's clips from a virtual X
screen, so only Linux could redo them; on the Mac, where MCO is developed, `site:capture` skipped
them. Refreshing the site for 1.0.53's hot cues needed new clips with no Linux machine at hand.
A Mac screen is also smaller than the 1600×1000 window, and the app's data folder there doesn't
follow `XDG_CONFIG_HOME`.

## Decision
- On macOS, `site:capture` records clips with Playwright's own video of the page (`recordVideo`),
  skipping the launch, then encodes them like the Linux ones. Linux keeps x11grab.
- The page is sized with Playwright's viewport (1600×1000 at 1×, `--force-device-scale-factor=1`)
  whatever the screen; the app's data goes to the capture's folder via `--user-data-dir`; the demo
  collection to `/Users/Shared/Music` so the user's name isn't in the shots.
- Captures hide the MIDI learn badges.

## Alternatives considered
- **Recording the Mac's screen** (ffmpeg avfoundation): needs screen-recording permission, the
  window doesn't fit the screen, and it would grab whatever else is on it.
- **A Linux container or cloud session**: works, but needs Docker or a remote run for every refresh.

## Consequences
- One command redoes everything on a Mac. Mac clips are a little softer than x11grab's (the webm
  is compressed) and their gifs bigger, but the visualizer draws on the GPU and looks better.
- Mac and Linux captures differ in fonts; redo all of them on one OS so the site matches.
