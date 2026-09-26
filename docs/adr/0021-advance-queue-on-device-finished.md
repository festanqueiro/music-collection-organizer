---
status: accepted
date: 2026-09-26
---
# 0021. While casting, the device finishing a track moves the queue on

## Context
With continuous play on, casting sometimes stopped at the end of a track. The queue moved on when
MCO's local (muted, in-sync) copy ended. But at a track's end the receiver reported `paused` just
before `finished` (a media element pauses before firing `ended`), and MCO paused its local copy to
match — a moment short of its own end, so it never ended. It failed whenever the local copy was
slightly behind the device.

## Decision
MCO advances on the device's `IDLE` + `FINISHED` report (`reconcile` → `finished` in
`src/cast/directCast.ts`), ignoring the post-command grace period, and pauses its local copy so it
can't advance a second time. The receiver no longer reports the end-of-track pause.

## Consequences
- Works with both MCO's receiver and Google's; the Mac-side part also worked with receivers already
  deployed.
