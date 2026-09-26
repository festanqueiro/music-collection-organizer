---
updated: 2026-09-26
---
# Cast devices: what we measured

Findings from probing the user's devices with MCO's own Cast v2 client
(`electron/main/cast/castClient.ts`) and mDNS scans. Anything not measured is marked **[UNVERIFIED]**.

## The devices (2026-09-26)
| Name (mDNS `fn`) | Model (`md`) | `ca` bits | Video? | Address |
|---|---|---|---|---|
| Castelo TV TV | Chromecast HD (Chromecast with Google TV HD) | 465413 | yes (bit 0 set) | 192.168.0.243:8009 |
| Dining room speaker | Google Nest Mini | 198660 | no | 192.168.0.163:8009 |

Discovery: mDNS PTR queries for `_googlecast._tcp.local`; the TXT record carries `fn` (friendly
name), `md` (model), `id`, and `ca` (capability bitmask — bit 0 is video output), resolved via
SRV → A (`castDiscovery.ts`).

## Nest Mini and MCO's app
- A `LAUNCH` of MCO's receiver (`E056A69A`) on the Nest Mini gets **no reply at all** — no
  `LAUNCH_STATUS`, no `LAUNCH_ERROR`, nothing on any namespace — until the sender's 15 s request
  timeout.
- A `LAUNCH` of Google's Default Media Receiver (`CC1AD845`) returns `LAUNCH_STATUS: USER_ALLOWED`
  and a `RECEIVER_STATUS` with the app in ~2.1 s; the device also reports `MULTIZONE_STATUS`
  (`isVideoContent: false`).
- → [ADR 0020](../adr/0020-speakers-use-default-media-receiver.md). Playback via the Default Media
  Receiver was confirmed working by the user.

## Google TV and backgrounded apps
- With Plex opened on the Google TV (from its home screen, not cast), a `GET_STATUS` to `receiver-0`
  still listed `E056A69A` "MCO" as the running application (`isIdleScreen: false`). The Cast session
  doesn't end when the user leaves the app; the receiver page is only hidden.
- → the receiver ends its own session after 5 s hidden ([ADR 0022](../adr/0022-cast-session-lifetime.md)).
  That `visibilitychange` fires when a native app is opened is **[UNVERIFIED]** on the device until the
  deployed receiver is tried.

## Sessions ending after a few minutes (2026-09-27)
A monitor sampled every ~16 s for 11 minutes while the user cast from the BETA build: BETA's socket
to the TV, the TV's app list (`GET_STATUS` on a separate connection), ping, BETA's CPU and its
keep-awake assertion.
- Wi-Fi to the TV is jumpy: ping 5–150 ms, one sample with 100 % loss.
- BETA's main process ran at ~98 % CPU for ~30 s once (it also serves the track files to the TV).
- At **00:13:02** the TV listed `MCO(E056A69A)` with the same session; at **00:13:18** BETA's socket
  was gone and the TV listed **no app** (`standby=false`, `active=true`). The TV ended the session —
  a Mac-side heartbeat failure would have left MCO listed. ~7 min into the session, consistent with
  Google TV's screensaver hiding the receiver and the receiver's hidden-page rule ending it
  → [ADR 0037](../adr/0037-keep-the-tv-awake.md).

## Heartbeats
- A fresh connection sending `PING` to `receiver-0` every 5 s got a `PONG` for every one (5 of 5, at
  +5.5 s … +25.3 s) while the TV was playing — the device answers sender pings, so silence means a dead
  connection.
- → liveness counted in missed heartbeats ([ADR 0022](../adr/0022-cast-session-lifetime.md)).

## End of track
- In the receiver, an `<audio>` element reaching its end fires `pause` before `ended`, so a status
  sent on `pause` says `PAUSED` a moment before `FINISHED`
  ([ADR 0021](../adr/0021-advance-queue-on-device-finished.md)).

## Chromecast HD GPU
- In MCO's receiver (threejs-visualisers themes at pixel ratio 1, ~720p), only **Paint** renders
  smoothly on the Chromecast HD; Nebula, Warp, Horizon, Sound System, Smoke and Kaleidoscope don't
  (tested 2026-09-26). Paint is mostly simple 2D quads/ribbons; the others use full-screen shaders,
  bloom, shadows or many particles. Deferred; levers: lower resolution + upscale, cheaper/no bloom on
  the receiver, fewer particles, a per-theme "TV quality" option. Don't degrade the desktop look.

## AirPlay
- macOS AVKit's `AVRoutePickerView` routes an `AVPlayer` only; MCO's audio is Web Audio in Chromium.
- CoreAudio lists no AirPlay output until one is chosen in Control Center (none listed on the user's
  Mac), so there's no public discovery/selection API for MCO.
- AirPlay buffers ~2 s **[UNVERIFIED for these devices]**.
- → [ADR 0019](../adr/0019-no-airplay.md).

## Sources
- Google Cast: [Web Receiver](https://developers.google.com/cast/docs/web_receiver),
  [CAF reference](https://developers.google.com/cast/docs/reference/web_receiver).
- Cast v2 protocol as implemented in `electron/main/cast/castMessage.ts` / `castClient.ts`.
- Measurements: scripts run against the devices on 2026-09-26 (this session's log).
