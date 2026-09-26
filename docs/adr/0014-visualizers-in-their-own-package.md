---
status: accepted
date: 2026-09-26
---
# 0014. Visualizer themes live in the `threejs-visualisers` package, pinned by tag

## Context
The visualizer themes (three.js scenes and spectrum/beat analysis) are needed both in MCO and in
MCO's Cast receiver on the TV, and are worth developing on their own.

## Decision
Themes and the engine live in [threejs-visualisers](https://github.com/festanqueiro/threejs-visualisers),
a GitHub dependency pinned to a tag. Change themes there, tag a release, bump the tag in
`package.json`. MCO's `src/components/Visualizer.tsx` only hosts the overlay and picker.

## Consequences
- MCO and the receiver render the same themes.
- The Chromecast HD's GPU only runs **Paint** smoothly; TV-specific quality settings are deferred
  ([research](../research/cast-devices.md#chromecast-hd-gpu)). The desktop look isn't to be degraded
  to fix the TV.
