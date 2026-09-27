---
status: accepted
date: 2026-09-27
---
# 0044. The mic goes to the recording, and to the speakers only when asked

## Context
Record mode adds a microphone with its own effects. A mic next to speakers feeds back, and a podcaster
usually hears themselves in headphones already. The app also denied every microphone request until now,
on purpose: opening a Bluetooth headset's mic drops it into its low-quality hands-free profile.

## Decision
- The audio engine ([ADR 0041](0041-one-audio-engine.md)) gets a **record bus**: the music (after
  ducking) plus the mic. The recorder taps it ([ADR 0042](0042-record-pcm-to-wav-on-disk.md)). The mic
  reaches the speakers only through a monitor gain that is off unless **Hear myself** is on.
- The music passes a **duck gain** that the mic's voice level pulls down (the level comes from the mic's
  worklet, which also does the noise gate and the meter).
- `getUserMedia` requests are granted for **audio only**; camera stays denied. The app has an
  `NSMicrophoneUsageDescription`, and asks macOS for access when the Mic is first switched on.
- The **mic always starts off** (never restored on launch), so MCO never opens a microphone on its own.
- The mic's settings are separate from the track's effects settings, which are also sent to the TV.

## Consequences
- Recording captures voice and music together without the voice looping through the speakers.
- Ducking is driven from the main thread (~50 updates a second), so it reacts within a couple of hundred
  milliseconds — fine for ducking, not sample-accurate.
- Picking a Bluetooth headset's own mic still switches it to hands-free quality; pick another input to
  avoid that.
