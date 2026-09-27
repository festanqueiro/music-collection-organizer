---
status: in-progress
updated: 2026-09-27
adrs: [0041, 0042, 0043]
---
# Recording (podcast)

## What it does
Records what MCO plays — the track with its FX and the dub siren (and, next, a microphone with its own
effects) — to an audio file, for podcasts and radio-style shows. It records the output as heard, nothing
more. Video of the visualizer is **not** in scope until decided otherwise.

## Behaviour
- **Rec** is the first button on the right of the player bar. It opens a popover with:
  - **Format**: WAV (lossless 24-bit, ~1 GB an hour), FLAC (lossless, about half that) or MP3 (192 kbps,
    ~85 MB an hour). Remembered.
  - **Save to**: the folder, `~/Music/MCO Recordings` by default; **Change…** picks another. Remembered.
  - **Start recording**.
- While recording the button turns red with a pulsing dot and the elapsed time; the popover shows the time,
  the file size so far (an estimate for FLAC/MP3) and **Stop**.
- It keeps recording through pauses, silences and track changes until you stop; silence is recorded as
  silence. The Mac doesn't sleep meanwhile (the display can).
- Files are named `MCO Recording 2026-09-27 16.40.12` (with ` 2`… if taken). After stopping, the popover
  shows the file with **Show in Finder**. If FLAC/MP3 conversion fails, the WAV is kept and a message says
  so.
- The recording is taken before the cast "mute this Mac" and after the track's master volume — what you
  hear.
- **No casting while recording** ([ADR 0043](../adr/0043-no-casting-while-recording.md)): Rec is dimmed
  while casting ("Stop casting to record") and Cast is dimmed while recording ("Stop recording to cast").
  Neither stops the other.
- Quitting MCO mid-recording keeps what was recorded, as a WAV. A crash keeps everything up to the last
  quarter-second.

### Planned: Mic section
On the FX screen: input device and the macOS microphone permission; an always-on voice chain (gain with a
level meter and clip light, 80 Hz high-pass, noise gate, compressor, 3-band EQ); its own effects with
on/off toggles — **Echo** (BPM-synced, with **Throw**), **Reverb**, **Radio**; **ducking** of the music
under the voice; a **Talk** button; everything MIDI-mappable; hearing yourself through the speakers off by
default. The mic is recorded with its effects, as heard.

## How it works
- **One audio engine** ([ADR 0041](../adr/0041-one-audio-engine.md)): the track's chain and the siren
  feed one mix bus on one `AudioContext`.
- **Recorder** ([ADR 0042](../adr/0042-record-pcm-to-wav-on-disk.md)): `src/audio/recorderWorklet.ts`
  (an `AudioWorklet` on the bus) makes 24-bit PCM chunks; `src/audio/recorder.ts` sends them over IPC;
  `electron/main/recording.ts` appends them with `wavWriter.ts` (header sizes rewritten after each chunk)
  and runs ffmpeg for FLAC/MP3 on stop. `src/audio/recordingSession.ts` starts/stops and enforces the cast
  rule; `src/components/RecordButton.tsx` is the UI. The folder is `recordingFolder` in the config; the
  format is a renderer preference.

## Tests
- `electron/main/wavWriter.test.ts` (header, valid after every chunk), `src/audio/audioEngine.test.ts`.
- Checked in BETA over DevTools: a 3 s WAV (48 kHz, 24-bit, valid), a 2.5 s MP3 (192 kbps, WAV removed),
  Cast refused while recording.

## Limits & open questions
- A WAV is capped just under 4 GiB (~6 h at 48 kHz); the recording stops there.
- No low-disk-space warning yet.
- A dry mic stem (to redo its effects afterwards) — later, if wanted.
- Video of the visualizer (YouTube) — deferred.
