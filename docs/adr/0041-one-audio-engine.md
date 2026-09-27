---
status: accepted
date: 2026-09-27
---
# 0041. Play everything through one audio engine

## Context
Each track's `EffectsChain` created its own `AudioContext` (a new one per track, since the Player remounts
per track), and the dub siren had another. Record mode needs one point that carries everything heard —
track, FX tails, siren and, later, the mic — for the whole session. A recorder on a per-track context would
lose its input at every track change and would never hear the siren. The output device and the cast
"mute this Mac" also had to be applied to each context separately.

## Decision
One long-lived `AudioContext`, owned by `AudioEngine` (`src/audio/audioEngine.ts`, a lazily created
singleton). Its `input` is the mix bus: the current track's chain and the siren build their nodes on the
engine's context and connect their output there. The bus goes through a local-mute gain to the speakers.

- A track's chain is **disconnected** when its Player unmounts; the context stays.
- Output device (`setSinkId`) and cast local mute are set once, on the engine, from `App.tsx`.
- Idle suspend ([ADR 0025](0025-suspend-idle-audio-engines.md)) moves to the engine: sources say when
  they're making sound (`setActive`: a playing track, a held siren, a running beat), and the context
  suspends 15 s after the last one goes quiet.
- Delay and reverb become reusable send modules (`src/audio/fxModules.ts`) so the mic's own effects can
  reuse them.
- The siren still goes straight to the bus, not through the track's FX, master volume or the visualizer's
  analyser — unchanged from before.

## Alternatives considered
- **Bridge each context into a recording context** through `MediaStreamDestination`s: less refactoring,
  but it adds latency, the contexts' clocks drift apart, and the player would have to reconnect the
  recorder at every track change.

## Consequences
- A recorder (and the mic) taps or joins one bus that lives as long as the app.
- Also lays the ground for crossfading and a two-deck mixer, which need two tracks in one graph.
- The Cast receiver app uses the same classes, so it also runs one context on the TV (lighter there).
- A track's delay/reverb tail is still cut at a track change, as before (its nodes are disconnected).
