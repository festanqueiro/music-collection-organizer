---
status: accepted
date: 2026-09-26
---
# 0023. FX settings reach the audio engines through store subscriptions, not React state

## Context
Dragging an FX knob felt stuck and the whole app froze. `App` and `Player` subscribed to
`effectsSettings` as React state, so every knob tick (dozens a second, more with MIDI) re-rendered
the whole app — the track table included — and the player's waveform.

## Decision
`Player` and `App` push settings to `EffectsChain` and the dub siren from
`useCollectionStore.subscribe(...)` callbacks. Only the FX screen itself renders knob values.

## Consequences
- Knobs track the mouse at full frame rate ([measurements](../research/performance.md)).
- Rule of thumb: high-frequency state that only drives audio should not be a React subscription in
  a component with a large subtree.
