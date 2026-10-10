---
status: accepted
date: 2026-10-10
---
# 0067. Order by Harmonic Mixing orders the keys, not the songs

## Context
A playlist's **Order by Harmonic Mixing** button has to put its songs in the order whose key
changes mix best. Taken song by song that is a travelling-salesman path: no exact answer for a
playlist of a few dozen songs in a time anyone would wait.

But there are only 24 keys. Songs in the same key mix with each other at no cost, so what has to be
decided is the order of the *keys present*, at most 24 and usually far fewer.

## Decision
- **Songs in one key stay together**, slowest tempo first, then as they were. Songs with no key
  keep their order at the end.
- **Each change of key has a cost** on the Camelot wheel (`keyChangeCost`, `src/state/harmonicOrder.ts`):
  the same key 0; the relative major/minor or one step round the wheel 1 — the moves
  `areKeysCompatible` already allows; a diagonal step 3; two steps 4; anything else 8. Every order
  has the same number of changes, so the lowest total is also the one with the most harmonic moves.
- **Up to 16 different keys, every order is weighed** (a dynamic programme over the sets of keys,
  a million entries at most, instant). **With 17 to 24**, the best of a nearest-key walk from every
  start, each improved by reversing stretches and moving single keys until nothing helps.
- Of an order and its reverse (the same changes) the one that goes up the wheel more is kept, and
  the keys are taken in wheel order first, so the result doesn't depend on the order the songs
  came in.
- The button rewrites the playlist's stored order, with **Undo** (the previous order, kept in the
  store's `playlistUndo`).

## Consequences
- "The best possible" is exact for the order of keys with up to 16 of them; with more it is a very
  good order, not a proven best. All 24 keys come out with every change harmonic (tested).
- Keeping a key's songs together gives up the rare order where splitting them would save a
  clash — the same key visited twice to bridge two branches.
- Tempo isn't weighed between keys: a harmonic order can jump in BPM.
- The key is the one analysis found; a wrong key gives a wrong neighbour.
