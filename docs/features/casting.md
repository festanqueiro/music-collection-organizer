---
status: shipped
updated: 2026-09-27
adrs: [0015, 0016, 0017, 0019, 0020, 0021, 0022, 0036, 0037, 0043, 0045]
---
# Casting

## What it does
Plays MCO on a Chromecast, a TV with Google TV, or a Nest/Google Home speaker. The Mac and the device
only have to be on the same Wi-Fi. On TVs, MCO's own Cast app runs MCO's effects, dub siren and
visualizer on the TV.

Click **Cast** in the player bar (the first button on the right), then pick a device. Devices are
searched for afresh each time the popover opens (so a device that moved to a new address shows up at
its new one), and only while it's open. The first time, macOS asks whether MCO may find devices on
your local network, and it may ask to allow incoming connections. Allow both.

## Behaviour

### How it plays
The device plays each track itself, fetched from your Mac ([ADR 0016](../adr/0016-cast-direct-mode.md)),
in **MCO's own Cast app** on TVs ([ADR 0017](../adr/0017-own-cast-receiver-app.md)):

- **MCO's effects and Dub Siren run on the device.** Knob moves (on screen or MIDI), siren presses
  and volume are sent to it as they happen.
- **Controls respond right away.** Play/pause, the seekbar, CUE and next track are sent to the
  device, and MCO's seekbar follows where the device actually is.
- **Continuous play** moves to the next queued track when the device finishes one
  ([ADR 0021](../adr/0021-advance-queue-on-device-finished.md)).
- **Pick what the TV shows in the Cast menu** ([ADR 0038](../adr/0038-pick-the-tv-screen-in-the-cast-menu.md)):
  under **On the TV**, **Now playing (track details)** one of the TV visualizers, rendered on
  the TV from the audio it plays, so picture and sound are in sync (with *Hide track info* for the
  visualizers). MCO's own **Visualizer** button is dimmed while casting to a screen; pressing it says
  to use the Cast menu, and an open visualizer closes when casting to a screen starts. The
  now-playing screen shows:
  - artwork (also blurred into the background), title, artist, album and year, and the track's tags;
  - BPM, key, **energy** (1–10: loudness weighted 55 %, how busy the drums are 45 %; only for
    analysed tracks) and loudness (LUFS), format/bitrate, date added, how often and how recently it's
    been played, and its folder;
  - its waveform, lit up to the playhead;
  - **Up next**: the next tracks, each with its tempo change from the one before (↑2, ↓3, 2×, ½×)
    and a ✓ on a BPM or key that mixes; how many are queued, their total length and when the queue
    will end;
  - **Just played**: the last two tracks of this casting session;
  - along the top, the session's length and tracks played, a clock, and the effects engaged in MCO
    right now (Filter, EQ, Delay, Reverb, Siren), lit as they're used.

  With the visualizer's track info on, it also shows BPM, key and the next track. With nothing
  loaded (also when MCO's queue empties
  during a cast), it shows **Load a song to continue**, with no track details, seek bar or cover left over. Every part of this screen has a fixed size, so nothing
  moves when a track with more or less information loads (unknown stats show "—").
- **TV visualizers**: **Drift**, **Ripples** (rings rising from the bottom), **Mandala** (6-fold)
  and **Scope**, drawn without the GPU so they run on TVs that can't handle the 3D themes
  ([ADR 0036](../adr/0036-tv-only-visualizers-without-gpu.md)). No options for now: their colours
  always shift slowly. The choice is remembered for the next cast.
- The receiver can still render the visualizer's 3D (three.js) themes, capped at 30 fps
  ([ADR 0045](../adr/0045-tv-renders-3d-themes-at-30-fps.md)), but the Cast menu doesn't offer them:
  most are too heavy for a Chromecast HD.

### Speakers
Speakers (no screen) use Google's built-in player directly — a Nest Mini never answers a request to
start MCO's app ([ADR 0020](../adr/0020-speakers-use-default-media-receiver.md)). They play the
tracks with instant controls; MCO's effects and siren aren't heard there.

### If a TV won't run MCO's app
MCO falls back to Google's built-in player ("Default Media Receiver"): tracks with instant controls,
and the TV remote and the Google Home app can pause and seek too. MCO's effects, siren and visualizer
aren't available there, and volume is set on the device. A device can refuse MCO's app for a while
after the app was changed in the Cast console, until it's restarted.

### Not while recording
Casting and recording never run together: while recording, **Cast** is dimmed and says to stop recording
first ([ADR 0043](../adr/0043-no-casting-while-recording.md)).

### Popover options
- **Mute this Mac while casting** (on by default) silences the Mac's own output, so you don't hear
  it and the device at once.
- **Stop** ends casting and sends the device back to its home screen.

### When a session ends ([ADR 0022](../adr/0022-cast-session-lifetime.md))
- Stop, quitting MCO or closing its window.
- Opening another app on the TV (Plex, YouTube…): MCO's app ends the session after 30 s out of view,
  and MCO says "The TV went to another app or its screensaver". MCO's app keeps the TV's screen
  awake during a session so the screensaver doesn't do this mid-track ([ADR 0037](../adr/0037-keep-the-tv-awake.md)).
- The device stops answering: 4 heartbeats in a row (~20 s) with nothing heard → "The TV stopped
  responding".
- While casting, the Mac doesn't idle-sleep (the display can); closing a MacBook's lid still sleeps it.

### Formats
The device gets each track as a 16-bit WAV (lossless at CD quality), converted once and cached, or as
the original file for MP3/AAC/Ogg. Cast devices can't play AIFF, and can't seek in the FLAC files MCO
converts AIFF to for its own playback.

## How it works
- MCO's Cast app is `cast-receiver/`, published to GitHub Pages on every merge to `main`
  (`.github/workflows/cast-receiver.yml`) and registered in the Google Cast SDK Developer Console as
  application `E056A69A`. Its now-playing screen (markup, styles, rendering) is
  `cast-receiver/nowPlaying.ts` + `nowPlaying.css`, shared with the second screen's "Now playing"
  ([Show on a screen](second-screen.md)); `main.ts` adds the audio, the TV visualizers and the Cast
  messaging.
- MCO starts it on the device, serves the track files and artwork from a small server on the local
  network (`electron/main/cast/castMediaServer.ts`), and exchanges the messages in
  `src/cast/receiverProtocol.ts` with it: load/play/pause/seek, effects, siren, display and queue one
  way; the device's playback position, state and idle reason the other.
- Discovery (mDNS), the Cast v2 protocol and session handling: `electron/main/cast/`
  (`castDiscovery.ts`, `castClient.ts`, `castSession.ts`). The power-save blocker is in `ipc.ts`.
- Renderer: `src/cast/` (starting a cast, `directCast.ts` for the player as remote,
  `receiverSync.ts` for keeping the app in step), `src/components/CastButton.tsx`.

## Tests
- `src/cast/directCast.test.ts` (syncing rules, device finished), `receiverQueue.test.ts`,
  `fxIndicators.test.ts`; `electron/main/cast/*.test.ts` (discovery parsing, messages, network).
- Checked on the user's Chromecast HD (Google TV) and Nest Mini; probes in
  [research](../research/cast-devices.md).

## Limits & open questions
- Only the **Paint** visualizer runs smoothly on a Chromecast HD ([research](../research/cast-devices.md#chromecast-hd-gpu)).
- No AirPlay ([ADR 0019](../adr/0019-no-airplay.md)).
- That opening another TV app fires the receiver's visibility change is still to be confirmed on the
  device.
