---
status: accepted
date: 2026-09-26
---
# 0029. Filter resonance fades in as a stage closes, with level compensation

## Context
With resonance around 10, the LP filter sounded noisy. Both stages ran at the dialled-in Q even when
wide open: a ~+20 dB peak at 20 kHz (hiss) and at 20 Hz (rumble), and sweeps clipped.

## Decision
Each stage's Q is flat (Butterworth, 0.707) when open and reaches the dialled-in resonance over the
first 25 % of its travel (`stageQ`). The filtered signal is scaled by
`sqrt((0.707/Qlp) · (0.707/Qhp))` to compensate the resonant peak (`resonanceCompensation`,
`src/audio/effectsChain.ts`). The same code runs in the Cast receiver.

## Consequences
- Transparent at rest, still resonant when swept; the filtered signal is quieter at high resonance.
