---
status: accepted
date: 2026-08-21
---
# 0012. A FIFO play queue whose head is the current track — no saved playlists yet

## Context
The player needed "what plays next" without the weight of a playlist manager.

## Decision
`playlist: number[]` in the store is a first-in, first-out queue: `playlist[0]` is the track playing
(or loaded); when it ends it's dequeued. There's no separate cursor. Pure operations live in
`src/state/playlist.ts` (play now, add, play next, move, shuffle upcoming, clear upcoming).

## Consequences
- The player is independent of row selection; browsing never interrupts playback.
- **Clear queue** keeps the head (the playing track) and drops the rest.
- Saved crates and smart playlists are a separate, future feature (roadmap).
