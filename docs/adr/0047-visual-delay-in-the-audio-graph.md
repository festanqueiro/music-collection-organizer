---
status: accepted
date: 2026-09-28
---
# 0047. Delay the visuals with a DelayNode on the music bus

## Context
When the sound reaches the room late (AirPlay to an Apple TV is ~1–2 s behind, Bluetooth and networked
PAs too), visuals drawn from MCO's live analysis run ahead of what people hear. The visualizers read an
`AnalyserNode` every frame.

## Decision
The audio engine gets a "visual tap": its music bus (track + siren) → `DelayNode` (up to 5 s) →
`AnalyserNode`, built on first use. A **Visual delay** setting (0–3000 ms) sets the delay; the second
screen and the Mac's full-screen visualizer read this analyser. Track info on the second screen changes
after the same delay.

## Alternatives considered
- **Buffer analyser frames in JavaScript** and replay them late: one copy per frame, a ring buffer sized
  by delay × frame rate, and gaps whenever the render loop stalls; the audio graph does this sample-exact
  for free.
- **Delay the audio instead** (to match a slow display): the wrong way round for this problem, and it
  would delay the DJ's own monitoring.

## Consequences
- The Mac's visualizer switches from the per-track analyser to the engine's (so it now reacts to the
  siren too), and gets the delay.
- The delay costs a few seconds of audio buffered in the graph while the tap exists; nothing when no
  visualizer has asked for it.
- The waveform/playhead and the Cast receiver aren't delayed (they follow the sound MCO makes, or play
  their own).
