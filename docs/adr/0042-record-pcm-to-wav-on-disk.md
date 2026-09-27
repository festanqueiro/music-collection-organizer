---
status: accepted
date: 2026-09-27
---
# 0042. Record the mix bus as PCM streamed to a WAV on disk

## Context
Record mode (podcasts) saves what MCO plays to a file. Shows run for hours, so the recording must not live
in memory, and a crash or power cut shouldn't lose it. Podcasters want lossless audio, or an MP3 ready to
upload.

## Decision
An `AudioWorklet` (`src/audio/recorderWorklet.ts`) on the audio engine's mix bus
([ADR 0041](0041-one-audio-engine.md)) turns it into 24-bit stereo PCM and posts it in ~0.25 s chunks. The
renderer forwards each chunk to the main process, which appends it to a WAV
(`electron/main/wavWriter.ts`) and rewrites the header's sizes after every chunk, so the file on disk is
always complete up to the last chunk. On stop, ffmpeg (already bundled) makes a FLAC or MP3 if one was
picked, and the WAV is removed. Silence is written as silence (nothing feeding the bus still advances the
file), and the recorder keeps the engine from idle-suspending.

## Alternatives considered
- **`MediaRecorder` on a `MediaStreamDestination`**: only lossy Opus/WebM, and the whole file arrives as
  blobs in the renderer.
- **Keep the PCM in memory and write it on stop**: about 1 GB an hour, lost on a crash.

## Consequences
- A plain WAV is capped just under 4 GiB (about 6 h at 48 kHz); the recording stops there.
- Quitting mid-recording keeps what was recorded, as a WAV.
- The mic (next step) joins the bus and is recorded with no change here.
