---
status: shipped
updated: 2026-10-08
adrs: [0010, 0012, 0023, 0025, 0058]
---
# Player

The footer player plays the track at the head of the [queue](queue.md). It
is independent of row selection: clicking around the table never
interrupts playback.

## Controls

- **Waveform** — the track's waveform doubles as the seek bar, with a live
  progress line. Click to seek; a click within 6 px of the left edge goes to
  0:00.
- **Play/pause** and **Play next in queue**.
- **CUE** — CDJ-style cue button (see below).
- **Time** — shows elapsed / total; click to switch to time left.
- **The buttons on the right** — two joined groups of icon buttons, names in their tooltips:
  *sound and picture* (Audio output, Rec, Mic, Cast, Screen) and *views* (Visualizer, FX, Queue,
  Live). A button is in the accent colour while its popover or view is open or its feature is
  on; the Queue shows its count and Rec the running time while recording (`.bar-group` in
  `theme.css`, `PlayerScreenButtons.tsx`).
- **Bar counter** — next to the BPM, for a track with a tempo: `Bar 24`, four dots for the beat in
  the bar (the first in the accent colour) and a short line filling through the current 16-bar
  phrase. Bars count from the **start of the tune as bar 0** (the track's own setting, see
  [hot cues](hot-cues.md); 0:00 until you move it), so it reads 16 on the "16" suggested cue —
  16 bars played, the 17th beginning. `–` before the start. It follows seeking, the CUE button,
  hot cues and moving the start.
- **The buttons on the right** — two joined groups of icon buttons, names in their tooltips:
  *sound and picture* (Audio output, Rec, Mic, Cast, Screen) and *views* (Visualizer, FX, Queue,
  Live). A button is in the accent colour while its popover or view is open or its feature is
  on; the Queue shows its count and Rec the running time while recording (`.bar-group` in
  `theme.css`, `PlayerScreenButtons.tsx`).
- **Volume** slider with a **mute** button that remembers the previous
  level.
- **Track info** — click the title for the track's details; click the
  artist to search the collection for that artist.
- On the right, in this order: **Cast** (play on a TV or speaker — see
  [Casting](casting.md)), a divider, then **Visualizer** ([Visualizer](visualizer.md)),
  **FX** (lit while an effect is engaged — [effects](fx.md)) and **Queue**
  (with the number queued — [queue](queue.md)). FX and Queue open full-screen
  views; click again to close.

With nothing queued, the bar keeps the same layout (controls greyed out,
volume still working), so the screen doesn't jump when a track loads.

A track starts playing as soon as it's loaded. Loading a track that hasn't
been analysed yet starts its analysis in the background; a cloud-only
track is downloaded before it's loaded (and the next three queued are fetched ahead).

## CUE button

Each track has one cue point, shown as an amber line on the waveform. It
starts at the beginning of the track and is kept only while the track
stays loaded.

- **While paused**: the spot where the track is paused becomes the cue
  point. Hold CUE to play from there.
- **While playing**: hold CUE to jump back to the cue point and play from
  it.
- **Release**: jumps back to the cue point and pauses. Press Play while
  holding CUE to keep playing after you let go.

To place the cue point, pause where you want it (or pause and click the
waveform), then press CUE.

Hold **C** on the keyboard, or map the button to a MIDI pad (see
[MIDI](midi.md)).

## Keyboard and media keys

- **Space** play/pause, **→** next track, **C** CUE (ignored while typing
  in a field).
- macOS media keys, the Touch Bar, Control Center, and AirPods/headset
  buttons work through the Media Session API (play, pause, next track).

## Audio output device

The **Audio** button (first on the right of the player bar) opens a popover like the Mic's: **Main
output** (device and volume) and **Headphones (pre-listen)** (device and volume), with a note when both
are the same device. The device list follows outputs coming and going — an AirPlay speaker appears once
it's picked in Control Center → Sound (`src/components/AudioButton.tsx`, `audioOutputs.tsx`, shared
with Settings → Audio).

**Settings → Audio → Main output** also sends playback (and the Dub Siren) to a
specific output — an audio interface, say — instead of the system default.
The choice is saved.

## AIFF playback

Chromium can't play AIFF, so AIFF files are transcoded to FLAC (lossless)
the first time they're played or analysed and cached in
`<userData>/media-cache/`. The cache is capped at 10 GB; the oldest files
are removed at startup when it's over.

The waveform isn't part of the track list ([ADR 0058](../adr/0058-waveforms-read-per-track.md)):
the Player asks for its track's (`tracks:getWaveform`, kept in the store's `trackWaveforms`) when
it loads, and again when the track's `analyzedAt` changes, so it appears as an analysis finishes.

The bar counter (`src/components/BarCounter.tsx`, `barCounter` in `src/state/hotCues.ts`) is drawn
outside React, like the FX knobs ([ADR 0023](../adr/0023-fx-settings-outside-react.md)): an
animation-frame loop that runs only while the track plays, reads the `<audio>` element's time and
touches the DOM only when the beat changes.

Code: `src/components/Player.tsx`, `src/audio/effectsChain.ts`,
`electron/main/index.ts` (the `media://` protocol),
`electron/main/audioTranscode.ts`.

## Tests
- `hotCues.test.ts` (`barCounter`): bars and beats from the start (bar 0), phrase progress,
  8/16/32/48/64 on the suggestions counted from the start, nothing before the start or without
  a tempo.
- `src/state/playlist.test.ts`, `playCount.test.ts`; playback and waveform checked in the BETA build.

## Limits & open questions
- `npm run dev` with React StrictMode runs the player's mount effect twice (dev only).
