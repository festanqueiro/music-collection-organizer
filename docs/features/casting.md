---
status: shipped
updated: 2026-09-26
adrs: [0015, 0016, 0017, 0019, 0020, 0021, 0022]
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
- **The visualizer runs on the TV.** Open MCO's visualizer while casting and the TV shows it,
  rendered there from the audio it plays, so picture and sound are in sync. MCO then shows only its
  controls (theme, options, *Hide track info*; keys 1–8). Close it and the TV shows MCO's now-playing
  screen:
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
  loaded, it shows **Load a song to continue**.

### Speakers
Speakers (no screen) use Google's built-in player directly — a Nest Mini never answers a request to
start MCO's app ([ADR 0020](../adr/0020-speakers-use-default-media-receiver.md)). They play the
tracks with instant controls; MCO's effects and siren aren't heard there.

### If a TV won't run MCO's app
MCO falls back to Google's built-in player ("Default Media Receiver"): tracks with instant controls,
and the TV remote and the Google Home app can pause and seek too. MCO's effects, siren and visualizer
aren't available there, and volume is set on the device. A device can refuse MCO's app for a while
after the app was changed in the Cast console, until it's restarted.

### Popover options
- **Mute this Mac while casting** (on by default) silences the Mac's own output, so you don't hear
  it and the device at once.
- **Stop** ends casting and sends the device back to its home screen.

### When a session ends ([ADR 0022](../adr/0022-cast-session-lifetime.md))
- Stop, quitting MCO or closing its window.
- Opening another app on the TV (Plex, YouTube…): MCO's app ends the session after 5 s out of view.
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
  application `E056A69A`.
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
