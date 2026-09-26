---
status: superseded by 0016 and 0017
date: 2026-09-26
---
# 0015. Cast by streaming MCO's live output to Google's Default Media Receiver

## Context
First version of casting (PR #41). The goal was to hear MCO's effects and dub siren and see the
visualizer on the TV, without a Google Cast developer account.

## Decision
Record MCO's live output (track through the FX chain plus the siren) with MediaRecorder; for TVs,
encode live HLS (H.264 + AAC via ffmpeg/VideoToolbox) showing the visualizer, for speakers an endless
MP3 stream; serve it from a token-protected LAN server; launch Google's Default Media Receiver with a
hand-rolled Cast v2 client (mDNS discovery).

## Why it was replaced
- 6–10 s of delay (HLS segments), so controls and the picture lagged the Mac; stutter from frame
  pacing; heavy CPU for encoding.
- Direct file playback ([ADR 0016](0016-cast-direct-mode.md)) and then MCO's own receiver app
  ([ADR 0017](0017-own-cast-receiver-app.md)) gave instant controls and in-sync effects and visuals.

## Consequences
- The hand-rolled Cast v2 client and mDNS discovery (`electron/main/cast/`) were kept.
