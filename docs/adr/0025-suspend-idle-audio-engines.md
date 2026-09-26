---
status: accepted
date: 2026-09-26
---
# 0025. Suspend the audio engines when nothing is playing

## Context
With nothing playing, the renderer used ~12 % CPU. The player's FX `AudioContext` (convolver reverb,
delays) and the dub siren's context kept rendering silence (Web Audio render capacity ~7 % and ~2 %).

## Decision
Each context suspends 15 s after going quiet — long enough for delay and reverb tails — and resumes on
play, a siren trigger, or the siren's beat. Resuming needs no user gesture in Electron (checked), so
MIDI triggers still work.

## Consequences
- Idle renderer CPU ~0 %.
- The first sound after a long idle comes from a just-resumed context (no audible delay observed).
