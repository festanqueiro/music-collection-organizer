---
status: proposed
date: 2026-10-01
---
# 0053. Home's mixes are temporary lists, never saved playlists

## Context
The planned [Home](../features/home.md) page suggests mixes to start the day (50 random from a
Tag, not played in a while, just added…). The user wants them to filter the collection without
creating anything in the Playlists box. MCO already shows a saved playlist in the table as an
ordered list of ids ([Playlists](../features/playlists.md)), and the queue holds what's playing.

## Decision
- A mix is computed in the renderer (pure functions, seeded by the date so it's stable for a day)
  and lives only in memory: `selectedMix { name, trackIds }` in the store, shown in the table
  through the same ordered-list mode a selected playlist uses, read-only.
- Playing or queueing a mix copies its ids into the queue, as Play playlist does.
- A mix becomes a playlist only through an explicit *Save as playlist…*.

## Alternatives considered
- **Save each mix as a playlist** (in a "Mixes" folder, replaced daily): visible everywhere, but
  clutters the Playlists box and the Rekordbox export with lists the user never chose to keep.
- **Mixes as saved filters (smart playlists)**: they'd change as the collection does, which suits
  "smart crates" (roadmap) but not a fixed random draw for the day.
- **Only queue them** (no Show): simpler, but the user can't look through a mix before playing it.

## Consequences
- The table's playlist mode generalises to "an ordered list": a saved playlist (editable) or a mix
  (read-only).
- Nothing about mixes is persisted except per-computer conveniences (chosen tags, hidden
  warnings) in localStorage; a mix of the day is recomputed from its seed.
