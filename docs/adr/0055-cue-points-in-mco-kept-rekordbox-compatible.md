---
status: accepted
date: 2026-10-01
---
# 0055. Cue points live in MCO's database, shaped like Rekordbox's

## Context
MCO gets hot cues A–H ([Hot cues](../features/hot-cues.md)). The user already has cue points in
Rekordbox (111 hot cues on 76 songs, [research](../research/rekordbox-collection.md)) and wants them
both ways ([ADR 0052](0052-two-way-rekordbox-sync-with-a-merge-wizard.md)). Rekordbox keeps cues in
its own database, not in the audio files, and exchanges them through its XML as `POSITION_MARK`s:
hot cues `Num` 0–7 with an RGB colour and a name, memory cues `Num -1`, loops `Type 4` with an end.

## Decision
- Cues live in MCO's database (`track_cues`), never in the files — like MCO's Tags
  ([ADR 0008](0008-tags-live-in-the-database.md)).
- The table holds Rekordbox's three kinds (hot, memory, loop) with its slot numbering, seconds,
  `#rrggbb` colours and names, so an import keeps everything and an export writes it back unchanged —
  even kinds MCO can't play yet (memory cues, loops).
- One hot cue per slot per track; setting a used slot moves it (keeping its colour and name).
- Rekordbox's cues come in only for songs with no cues in MCO; songs with their own are left for the
  sync's per-song conflicts (ADR 0052).
- Default colours follow the user's Rekordbox per slot, so cues look the same in both apps.

## Alternatives considered
- **In the files** (Serato's GEOB frames): Rekordbox doesn't read them, and it would mean writing
  every file on every cue edit.
- **Hot cues only**: simpler, but importing would drop memory cues and loops, and an export would
  then lose them in Rekordbox.
- **Overwrite MCO's cues on import**: one click, but loses edits made in MCO.

## Consequences
- Memory cues and loops are stored and shown before they're playable.
- Cue times are seconds from the start of the decoded audio; MP3 decoder offsets between apps are a
  known risk (the probe measures it).
