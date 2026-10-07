---
status: accepted
date: 2026-10-07
supersedes: the "MCO never sends a beat grid" limit in the Rekordbox-sync plan (0052)
---
# 0059. The start of the tune is its own setting, exported as Rekordbox's grid

## Context
The bar counter, the 16 / 32 / 48 / 64 suggestions and the zoom's bar lines need a bar 0: where
the tune starts. Analysis finds a first beat, but not always the musical start (a pickup, an
intro without a kick), and the user must be able to say where it is. For a few hours that was
"hot cue A is the start", which takes a pad for it and makes any cue on A (a Rekordbox import's,
say) the start whether it is or not.

Rekordbox keeps the same thing as part of the track's **beat grid**, separate from cues: in its
XML, `<TEMPO Inizio="…" Bpm="…" Metro="4/4" Battito="1"/>` — a position, the tempo, and which beat
of the bar it is. It has no "start cue" type. The user's export has a `TEMPO` on every track and no
memory cues ([research](../research/rekordbox-collection.md)).

## Decision
- A track has a **start**: `tracks.grid_start` (seconds, null until set), `Track.gridStart`. Only
  the user sets it (`tracks:setGridStart`); analysis and scans never touch it.
- The grid is counted from it as bar 0. While it is unset, the bar counter counts from the analysed
  first beat, marked `~`, and there are **no bar suggestions** — only the offer to set the start.
- Cues are cues again: pad A means nothing special.
- **Export to Rekordbox** writes a `TEMPO` (the start, MCO's BPM, 4/4, beat 1) for tracks whose
  start is set and that have a BPM, and none for the others.

## Alternatives considered
- Hot cue A as the start: no new field, but costs a pad and misreads existing cues on A.
- Overwrite `first_beat`: re-analysis would replace what the user set, and "confirmed by the user"
  would be lost.
- Export a grid for every analysed track (from `first_beat`): would replace grids the user has
  corrected in Rekordbox with unconfirmed ones.

## Consequences
- Importing MCO's XML into Rekordbox can replace that track's grid there with MCO's — only for
  tracks whose start was set in MCO, which is the point. What Rekordbox does with a `TEMPO` on a
  track it already has is **not verified yet** (the [probe](../research/rekordbox-xml-import.md)
  covers cues and the grid; this case should be added to it).
- One anchor and one tempo: a track whose tempo drifts or changes isn't described.
- MCO still doesn't read Rekordbox's grid (its `Inizio`/`Battito`) as the start; that is the
  natural next step for tracks already gridded there.
