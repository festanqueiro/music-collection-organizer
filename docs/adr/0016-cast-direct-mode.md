---
status: accepted
date: 2026-09-26
---
# 0016. The Cast device plays each track file itself; MCO's player is its remote

## Context
Streaming MCO's live output ([ADR 0015](0015-cast-by-streaming-live-output.md)) lagged by seconds.

## Decision
MCO serves each track file (with Range support, and artwork) from a small LAN server
(`electron/main/cast/castMediaServer.ts`) and sends the device load/play/pause/seek. MCO's own
`<audio>` keeps playing — muted if **Mute this Mac** is on — as the remote: its play/pause/seek
become commands, and the device's reports are applied back to it (with a short grace period after
each command and a 0.35 s drift tolerance) so MCO's seekbar shows where the device really is
(`src/cast/directCast.ts`). AIFF is sent as a cached 16-bit WAV.

## Consequences
- Controls respond immediately; the TV remote and Google Home can pause and seek too.
- With Google's Default Media Receiver, MCO's effects, siren and visualizer aren't on the device —
  hence [ADR 0017](0017-own-cast-receiver-app.md).
- The end of a track must be taken from the device, not the local copy ([ADR 0021](0021-advance-queue-on-device-finished.md)).
