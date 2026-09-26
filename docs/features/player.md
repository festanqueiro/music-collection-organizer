---
status: shipped
updated: 2026-09-26
adrs: [0010, 0012, 0023, 0025]
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
track is downloaded first.

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

**Settings → Audio → Main output** sends playback (and the Dub Siren) to a
specific output — an audio interface, say — instead of the system default.
The choice is saved.

## AIFF playback

Chromium can't play AIFF, so AIFF files are transcoded to FLAC (lossless)
the first time they're played or analysed and cached in
`<userData>/media-cache/`. The cache is capped at 10 GB; the oldest files
are removed at startup when it's over.

Code: `src/components/Player.tsx`, `src/audio/effectsChain.ts`,
`electron/main/index.ts` (the `media://` protocol),
`electron/main/audioTranscode.ts`.

## Tests
- `src/state/playlist.test.ts`, `playCount.test.ts`; playback and waveform checked in the BETA build.

## Limits & open questions
- `npm run dev` with React StrictMode runs the player's mount effect twice (dev only).
