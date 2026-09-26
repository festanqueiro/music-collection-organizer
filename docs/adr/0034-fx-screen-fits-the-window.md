---
status: accepted
date: 2026-09-26
---
# 0034. The FX screen scales to fill the window with CSS zoom

## Context
The FX panels filled only the top half of a large window.

## Decision
`src/components/FitToArea.tsx` binary-searches the largest CSS `zoom` (1–2.5) at which the content,
laid out at `width / zoom`, still fits the area's height; re-fitted on resize; never below 1 (small
windows scroll).

## Consequences
- The whole panel grows (knobs, text, switches) without per-control sizing.
- Content that grows after fitting scrolls until the next resize.
