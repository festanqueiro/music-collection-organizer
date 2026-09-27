---
status: in-progress
updated: 2026-09-27
adrs: [0041]
---
# Recording (podcast)

## What it does
Records what MCO plays — the track with its FX, the dub siren, and a microphone with its own effects —
to an audio file, for podcasts and radio-style shows. Every recording comes with a tracklist of what
played and when (chapters). Video of the visualizer is **not** in scope until decided otherwise.

## Behaviour (planned)
- **REC** in the player bar opens a panel: format (WAV, FLAC or MP3), stems (the mix only, or the mix plus
  the mic on its own), destination folder (default `~/Music/MCO Recordings`, never the collection folder).
- While recording: red dot, elapsed time, file size; the Mac stays awake; the audio engine doesn't
  idle-suspend. The file is written to disk as it records, so a crash doesn't lose the show.
- On stop: **Show in Finder** and **Copy tracklist** (chapter lines, a `.cue` file, and chapters in the
  MP3/M4A).
- **No casting while recording**: REC is dimmed while casting ("Stop casting to record") and Cast is dimmed
  while recording ("Stop recording to cast"). Neither stops the other on its own.
- **Mic** section on the FX screen:
  - input device and the macOS microphone permission;
  - an always-on voice chain: gain with a level meter and clip light, 80 Hz high-pass, noise gate,
    compressor, 3-band EQ;
  - its own effects, each with an on/off toggle: **Echo** (time, feedback, mix, BPM-synced division; a
    **Throw** button sends only what's said while it's held into the echo), **Reverb** (decay, mix),
    **Radio** (band-pass telephone/megaphone voice with drive);
  - **ducking** (the mic's level pulls the music down), a **Talk** button (push-to-talk or latched mute);
  - listening to yourself through the speakers is off by default (feedback), with a headphones hint;
  - every knob, toggle, Throw and Talk is MIDI-mappable; settings are saved like the track FX.
  - The mic stem is recorded with its effects, as heard.

## How it works
1. **One audio engine** (shipped, [ADR 0041](../adr/0041-one-audio-engine.md)): the track's chain, the
   siren and the mic all feed one mix bus on one `AudioContext`.
2. **Recorder**: an `AudioWorklet` on the bus sends PCM chunks to the main process, which appends them to
   a WAV on disk; ffmpeg makes FLAC/MP3 and embeds chapters on stop. The tracklist comes from the tracks
   loaded during the recording and when.
3. **Mic**: `getUserMedia` → `MediaStreamSource` on the engine's context → voice chain → mic effects (the
   delay and reverb from `src/audio/fxModules.ts`) → bus; a sidechain on its level ducks the music.

## Tests
- `src/audio/audioEngine.test.ts` (idle suspend across sources).

## Limits & open questions
- A dry mic stem (to redo its effects afterwards) — later, if wanted.
- Video of the visualizer (YouTube) — deferred.
