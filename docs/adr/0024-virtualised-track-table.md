---
status: accepted
date: 2026-09-26
---
# 0024. Render only the visible rows of the track table, at a fixed row height

## Context
The table rendered every track as a real row: ~54,000 DOM nodes for 2,643 tracks, holding the whole
app to ~40 fps even when idle.

## Decision
Rows are a fixed 36 px; only rows in the viewport plus 15 either side are rendered, between two
spacer rows (`src/components/TrackTable.tsx`). Scroll-to-track works by index.

## Consequences
- ~800 DOM nodes and ~120 fps idle ([measurements](../research/performance.md)).
- Cells must stay single-line (they're `nowrap`); a taller row type would need variable heights.
