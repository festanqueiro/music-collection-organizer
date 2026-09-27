---
status: accepted
date: 2026-09-27
---
# 0043. No casting while recording

## Context
While casting, the TV plays each track itself and the Mac's own output is usually muted; the TV shows its
own visualizer. Recording at the same time raises questions (which output is "the show"? what if the TV
drops?) that nobody needs answered for a podcast.

## Decision
Recording and casting never run together. While casting, **Rec** is dimmed and says "Stop casting to
record"; while recording, **Cast** is dimmed and says "Stop recording to cast". Neither stops the other on
its own (stopping a cast sends the TV to its home screen). The only way a cast starts is
`startCasting()`, which refuses while recording.

## Consequences
- Recording always captures the Mac's own mix bus.
- Video recording (later) can rely on the desktop visualizer being available.
