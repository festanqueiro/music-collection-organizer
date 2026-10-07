---
status: accepted
date: 2026-10-08
supersedes: the "while it is unset" rule of 0059
---
# 0060. The start of the tune is 0:00 until the user moves it

## Context
[ADR 0059](0059-the-start-of-the-tune-is-its-own-setting.md) left a track without a start in a
third state: the bar counter counted from the analysed first beat (marked `~`), and the 16 / 32 /
48 / 64 suggestions stayed hidden behind a **Set start** button. So the counter showed numbers
counted from a point the user never chose and couldn't see, and every track needed a click before
it suggested anything.

## Decision
- The start is **0:00** — the beginning of the file — until the user moves it. `tracks.grid_start`
  stays null for "not moved"; everything that counts uses `gridStart ?? 0`
  (`gridStart()` in `src/state/hotCues.ts`).
- The bar counter, the suggestions and the zoom's bar lines always count from it; no `~`, no
  unset state. There is no Start button: the waveform's right-click menu sets it, and its
  marker (like a hot cue's, labelled **0**) shows only once it has been moved.
- A moved start is where the track begins playing when it is loaded in the player (the CUE
  point starts there too). Cast receivers still play from 0:00.
- The analysed first beat is only an offer (*Set it on the detected first beat*); it is never
  applied on its own.
- **Export to Rekordbox** still writes a `TEMPO` only for tracks whose start was moved
  (`grid_start` not null): sending `Inizio="0.000"` for every analysed track would replace
  Rekordbox's own grids with one nobody checked.

## Alternatives considered
- Default to the analysed first beat silently: often right for dance music, but wrong on pickups
  and beatless intros, and the user can't tell which without checking each track.
- Store 0 in the database for every track: loses "the user set this", which the export needs.

## Consequences
- On a track with silence or a pickup before the first beat, bars and suggestions are off by that
  much until the start is moved — visible as the **0** marker sitting before the music.
- A start moved to exactly 0:00 counts as moved and is exported.
