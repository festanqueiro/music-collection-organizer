# Casting

Plays MCO on a Chromecast, a TV with Google TV, or a Nest/Google Home
speaker. The Mac and the device only have to be on the same Wi-Fi.

Click the **cast** button in the player bar (next to the visualizer
button), then pick a device. Devices are searched for afresh each time the
popover opens (so a device that moved to a new address shows up at its
new one), and only while it's open. The first time, macOS asks whether MCO
may find devices on your local network, and it may ask to allow incoming
connections. Allow both.

## How it plays

The device plays each track itself, fetched from your Mac, in **MCO's own
Cast app**:

- **MCO's effects and Dub Siren run on the device.** Knob moves (on screen
  or MIDI), siren presses and volume are sent to it as they happen.
- **Controls respond right away.** Play/pause, the seekbar, CUE and next
  track are sent to the device, and MCO's seekbar follows where the device
  actually is.
- **The visualizer runs on the TV.** Open MCO's visualizer while casting
  and the TV shows it, rendered there from the audio it plays, so picture
  and sound are in sync. MCO then shows only its controls (theme, options,
  *Hide track info*; keys 1–8). Close it and the TV shows MCO's
  now-playing screen:
  - artwork (also blurred into the background), title, artist, album and
    year, and the track's tags;
  - BPM, key, energy (1–10) and loudness (LUFS), format/bitrate, date
    added, how often and how recently it's been played, and its folder;
  - its waveform, lit up to the playhead;
  - **Up next**: the next tracks, each with its tempo change from the one
    before (↑2, ↓3, 2×, ½×) and a ✓ on a BPM or key that mixes; how many
    are queued, their total length and when the queue will end;
  - **Just played**: the last two tracks of this casting session;
  - along the top, the session's length and tracks played, a clock, and
    the effects engaged in MCO right now (Filter, EQ, Delay, Reverb,
    Siren), lit as they're used.

  With the visualizer's track info on, it also shows BPM, key and the
  next track. With nothing loaded, it shows **Load a song to continue**.
- Speakers play the audio only.

**If a device won't run MCO's app**, MCO uses Google's built-in player
instead (it shows "Default Media Receiver"). That plays the tracks with
instant controls, and the TV remote and the Google Home app can pause and
seek too. MCO's effects, siren and visualizer aren't available there, and
volume is set on the device. A device can refuse MCO's app for a while
after the app was changed in the Cast console, until it's restarted.

## Popover options

- **Mute this Mac while casting** (on by default) silences the Mac's own
  output, so you don't hear it and the device at once.
- **Stop** ends casting and sends the device back to its home screen.
  Turning the TV off or switching it to another app also ends the
  session. So does quitting MCO or closing its window.

## Formats

The device gets each track as a 16-bit WAV (lossless at CD quality),
converted once and cached, or as the original file for MP3/AAC/Ogg. Cast
devices can't play AIFF, and can't seek in the FLAC files MCO converts
AIFF to for its own playback.

## How it works

MCO's Cast app is the page in `cast-receiver/`, published to GitHub Pages
(`.github/workflows/cast-receiver.yml`) and registered in the Google Cast
SDK Developer Console as application `E056A69A`. MCO starts it on the
device, serves the track files (and artwork) from a small server on your
local network, and exchanges the messages in `src/cast/receiverProtocol.ts`
with it: load/play/pause/seek, effects, siren and display settings one way,
the device's playback position and state the other.

Code: `src/cast/` (starting a cast, the player as remote, keeping the app
in step), `src/components/CastButton.tsx`, `electron/main/cast/` (device
discovery, Cast protocol, file server), `cast-receiver/` (the app).
