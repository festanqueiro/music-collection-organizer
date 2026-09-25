# Casting

Plays MCO on a Chromecast, a TV with Google TV, or a Nest/Google Home
speaker. No account or setup is needed; the Mac and the device only have to
be on the same Wi-Fi.

Click the **cast** button in the player bar (next to the visualizer
button), then pick a device. Devices are only searched for while this
popover is open. The first time, macOS asks whether MCO may find devices on
your local network, and it may ask to allow incoming connections. Allow
both.

## Two ways of casting

**Show visualizer on the TV** in the Cast popover picks between them.
Toggling it while casting switches over, with a short gap on the TV.

**With the visualizer (TVs only): MCO streams its live output.**

- The TV gets everything you hear in MCO: the track after EQ, filter,
  delay and reverb, plus the Dub Siren. It shows the visualizer, following
  the chosen theme, its options, and *Hide track info*.
- It plays **about 6–10 seconds behind** MCO, so play/pause, seeking, next
  track and FX all reach it after that delay. A warning above the player
  controls says so.
- While the visualizer is on the TV, the visualizer button on the Mac
  opens only its controls.
- With nothing loaded in the player, the TV shows **Load a song to
  continue**. Casting keeps going, and the picture comes back when a track
  loads.

**Without the visualizer, and always on speakers: the device plays the
tracks itself.**

- MCO hands the device each track file, and the device's own player plays
  it at full quality. The TV shows Google's player, with artwork, title,
  artist and a progress bar.
- **Controls respond right away.** MCO's play/pause, seek, CUE and next
  track are sent to the device. The TV remote and the Google Home app can
  pause and seek too, and MCO follows. MCO's seekbar follows the device's
  position.
- **MCO's effects and the Dub Siren aren't heard**: the device plays the
  original file. Use the TV remote or the Google Home app for **volume**.
- AIFF tracks are converted to FLAC first, as for playback in MCO.
  Formats the device can't play (e.g. ALAC in .m4a) stop the cast with an
  error.

## Popover options

- **Mute this Mac while casting** (on by default) silences the Mac's own
  output, so you don't hear it and the TV at once. What's cast isn't
  affected.
- **TV picture: N fps · N ms per frame** (visualizer only) shows how
  smoothly MCO is drawing the TV picture. Below 30 fps (the line turns highlighted), the TV picture
  stutters, so try a lighter theme.
- **Stop** ends casting and sends the TV back to its home screen. Turning
  the TV off or switching it to another app also ends the session. So
  does quitting MCO or closing its window: the TV goes back to its home
  screen.

## How it works

Both ways use the device's built-in Google media player, which MCO starts
and controls over your local network.

- **Streaming (visualizer):** MCO records its own mixed output and the TV
  picture with MediaRecorder. ffmpeg encodes that into a live HLS stream
  (H.264 + AAC), and a small local server serves it to the TV.
- **Direct:** a small local server serves the track file (and its artwork)
  to the device, and MCO sends it load, play, pause and seek commands. MCO
  keeps playing the track silently as the remote, and follows the device's
  reported position and play state.

Code: `src/cast/` (mixer, TV picture, frame pacing, recording, direct
mode), `src/components/CastButton.tsx`, `electron/main/cast/` (device
discovery, Cast protocol, stream encoder and servers).
