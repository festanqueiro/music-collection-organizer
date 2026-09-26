---
status: accepted
date: 2026-09-26
---
# 0017. MCO's own Cast receiver app runs the effects, siren and visualizer on the TV

## Context
Direct mode ([ADR 0016](0016-cast-direct-mode.md)) with Google's receiver can't play MCO's effects
or show its visualizer.

## Decision
A Cast Application Framework receiver in `cast-receiver/`, hosted on GitHub Pages and registered in
the Google Cast SDK Developer Console as application **E056A69A**. It plays the file itself (as in
direct mode) through MCO's own `EffectsChain` and `DubSirenEngine`, renders the visualizer from the
audio it plays, and shows a now-playing screen otherwise. MCO talks to it over a custom namespace
(`src/cast/receiverProtocol.ts`): load/play/pause/seek, effects (throttled ~20/s), siren, display and
queue one way; status (state, position, idle reason) the other. The streamed visualizer was dropped.
If a device won't launch MCO's app, MCO falls back to Google's receiver.

## Consequences
- Picture and sound are generated together on the TV, with no stream delay.
- The receiver is deployed from `main` ([ADR 0018](0018-ci-bump-and-deploy-on-every-merge.md)); a
  device can refuse it for a while after console changes, until restarted.
- Speakers don't answer a launch of this app at all ([ADR 0020](0020-speakers-use-default-media-receiver.md)).
