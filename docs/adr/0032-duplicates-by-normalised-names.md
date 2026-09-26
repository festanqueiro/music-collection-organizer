---
status: accepted
date: 2026-09-26
---
# 0032. Duplicates: same normalised artist + title, else same normalised filename

## Context
The Duplicates filter should catch the same song in another folder or format (AIFF + WAV, the same
promo in two folders) without audio fingerprinting. (An earlier duplicate finder tab, 2026-09-24, was
removed in PR #51.)

## Decision
`src/state/duplicates.ts`: key = normalised artist + title when both tags exist, otherwise the
normalised filename without extension; normalising removes accents, case, punctuation and spacing.
Computed over the whole collection; copies are grouped together in the table.

## Consequences
- On the user's collection: 5 groups, 10 tracks, all genuine (2026-09-26).
- Different masters of the same song match; same-named different songs could too.
