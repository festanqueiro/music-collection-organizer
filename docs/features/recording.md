---
status: in-progress
updated: 2026-09-27
adrs: [0041, 0042, 0043, 0044]
---
# Recording (podcast)

## What it does
Records what MCO plays — the track with its FX, the dub siren and a microphone with its own effects —
to an audio file, for podcasts and radio-style shows. It records the output as heard, nothing
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

### Mic
The **Mic** section at the bottom of the FX screen ([ADR 0044](../adr/0044-mic-records-but-isnt-heard-by-default.md)):

- **Mic** on/off and the input (the system default, or a device). The first time, macOS asks whether MCO
  may use the microphone; if it's refused, MCO says where to allow it. The mic is **always off** when MCO
  starts.
- A **level meter** of the input after Gain, with a clip light that stays lit for a moment.
- **Talk**: tap to mute or unmute; hold while muted to talk only while held. The **T** key does the same.
  The mic starts live when switched on. Muting happens before the effects, so echoes ring out.
- **Hear myself** (off by default): the mic through the speakers too — use headphones, or it feeds back.
  The mic is recorded either way, but the speakers never play it unless this is on.
- **Voice**: Gain (−12…+24 dB), Gate (a noise gate, down to Off; closes to −40 dB rather than silence),
  Comp (compressor amount with automatic make-up gain). An 80 Hz high-pass is always on.
- **EQ**: Low, Mid, High (±12 dB).
- **Echo** (on/off): Mix, Time, Feedback, and Division (syncs Time to the loaded track's BPM). **Throw**:
  hold it and what you say goes into the echo, even with Echo off. Turning Echo off lets its tail ring out.
- **Reverb** (on/off): Mix, Decay.
- **Radio** (on/off): a band-passed telephone/megaphone voice; Drive adds grit.
- **Ducking** (on by default): the music drops by Amount (default 10 dB) while you talk, and comes back
  shortly after you stop. Not while muted.
- Every knob, toggle, Talk and Throw can be MIDI-mapped; Talk's LED is lit while live. Settings are
  saved (except on/off).
- Picking a Bluetooth headset's own mic switches it to hands-free (lower) quality; pick another input to
  avoid that.

## How it works
- **One audio engine** ([ADR 0041](../adr/0041-one-audio-engine.md)): the track's chain and the siren
  feed the music bus, which passes a duck gain to the speakers and the record bus; the mic feeds the record
  bus, and the speakers only through the monitor gain ([ADR 0044](../adr/0044-mic-records-but-isnt-heard-by-default.md)).
- **Mic**: `src/audio/mic.ts` (`MicChain`: `getUserMedia` with the browser's call processing off → gain →
  high-pass → `micWorklet.ts` (gate, meter, voice level) → compressor → make-up → EQ → radio insert →
  talk → dry + echo/reverb sends, using `fxModules.ts`); `micSession.ts` opens/closes it from the store;
  `micControls.ts` maps MIDI and Talk; `src/components/MicPanel.tsx` is the UI. Settings are `micSettings`
  in the config.
- **Recorder** ([ADR 0042](../adr/0042-record-pcm-to-wav-on-disk.md)): `src/audio/recorderWorklet.ts`
  (an `AudioWorklet` on the bus) makes 24-bit PCM chunks; `src/audio/recorder.ts` sends them over IPC;
  `electron/main/recording.ts` appends them with `wavWriter.ts` (header sizes rewritten after each chunk)
  and runs ffmpeg for FLAC/MP3 on stop. `src/audio/recordingSession.ts` starts/stops and enforces the cast
  rule; `src/components/RecordButton.tsx` is the UI. The folder is `recordingFolder` in the config; the
  format is a renderer preference.

## Tests
- `electron/main/wavWriter.test.ts` (header, valid after every chunk), `src/audio/audioEngine.test.ts`,
  `src/audio/micControls.test.ts` (Talk tap/hold, MIDI toggles and knobs, echo division, compressor).
- Checked in BETA over DevTools: a 3 s WAV (48 kHz, 24-bit, valid), a 2.5 s MP3 (192 kbps, WAV removed),
  Cast refused while recording; the Mic section renders and lists the inputs. The mic itself (permission
  prompt, sound, ducking) is checked by hand.

## Limits & open questions
- A WAV is capped just under 4 GiB (~6 h at 48 kHz); the recording stops there.
- No low-disk-space warning yet.
- A dry mic stem (to redo its effects afterwards) — later, if wanted.
- Video of the visualizer (YouTube) — deferred.
