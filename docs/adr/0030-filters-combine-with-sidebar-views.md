---
status: accepted
date: 2026-09-26
---
# 0030. Filters are a sidebar view that combines with the folder/tag selection; Tags stay their own views

## Context
The user asked for a filter menu (Compatible, Analysed, Duplicates, later Untagged) and whether Tags
and Subtags should move into it.

## Decision
A fourth sidebar view, **Filters** (`src/components/FiltersPanel.tsx`). Its filters **combine** with
the folder or tag selection underneath: that view stays mounted (hidden) while Filters is open, and
going to/from Filters doesn't reset it. Tags and Subtags stay their own views, because they're where
tags are managed (create, rename, colour, delete), not just filtered. Every active narrowing —
search, folder, tag selection, each filter — shows as a chip above the table with an × to clear it;
a tag chip tells its tree to untick itself so tree and table can't disagree.

## Consequences
- Filter state is session-only (like search); sidebar view and folder are remembered across launches.
