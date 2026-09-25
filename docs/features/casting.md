# Casting

Plays MCO on a Chromecast, a TV with Google TV, or a Nest/Google Home
speaker. No account or setup is needed; the Mac and the device only have to
be on the same Wi-Fi.

Click the **cast** button in the player bar (next to the visualizer
button), then pick a device. Devices are only searched for while this
popover is open. The first time, macOS asks whether MCO may find devices on
your local network, and it may ask to allow incoming connections. Allow
both.

## What gets cast

Everything you hear in MCO: the track after EQ, filter, delay and reverb,
plus the Dub Siren. The device plays it **about 6–10 seconds behind** MCO,
so play/pause, seeking, next track and FX all reach it after that delay.

- **TVs** show either the **visualizer** (following the chosen theme, its
  options, and *Hide track info*) or a **now-playing card** with artwork,
  title, artist and progress. Switch between them with **Show visualizer
  on the TV**. While the visualizer is on the TV, the visualizer button on
  the Mac opens only its controls.
- **Speakers** get the audio only.
- With nothing loaded in the player, the TV shows **Load a song to
  continue**. Casting keeps going, and the picture comes back when a track
  loads.

## Popover options

- **Mute this Mac while casting** (on by default) silences the Mac's own
  output, so the delayed TV doesn't echo it. What's cast isn't affected.
- While casting, a warning above the player controls, **Casting: controls
  and UI might be delayed on the TV**, is a reminder that a press takes
  that long to be heard.
- **TV delay: 7.2 s** shows how far behind the TV is. MCO measures it by
  asking the TV where it is in the stream. It reads "~7.0 s (estimated)"
  until the TV answers.
- **TV picture: N fps · N ms per frame** shows how smoothly MCO is drawing
  the TV picture. Below 30 fps (the line turns highlighted), the TV picture
  stutters, so try a lighter theme.
- **Stop** ends casting and sends the TV back to its home screen. Turning
  the TV off or switching it to another app also ends the session. So
  does quitting MCO or closing its window: the TV goes back to its home
  screen.

## How it works

MCO records its own mixed output and the TV picture with MediaRecorder.
ffmpeg encodes that into a live HLS stream (H.264 + AAC) for TVs, or a
continuous MP3 for speakers. A small server on your local network serves
the stream. MCO then tells the device's built-in Google media player to
play it.

Code: `src/cast/` (mixer, TV picture, frame pacing, recording),
`src/components/CastButton.tsx`, `electron/main/cast/` (device discovery,
Cast protocol, stream encoder and server).
