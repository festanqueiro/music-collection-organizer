---
status: proposed
date: 2026-10-01
---
# 0051. Update Rekordbox through its XML import and the files' own tags

## Context
Users edit songs in MCO (file tags, MCO Tags, analysis, and soon cue points) and want those
changes in Rekordbox, where they play out. Rekordbox 7 keeps its library in a SQLCipher-encrypted
`master.db` that MCO can't and shouldn't open ([ADR 0050](0050-playlists-in-mco-imported-from-rekordbox-xml.md)).
It takes outside data in two documented ways: the "rekordbox xml" collection format (which MCO
already writes, `electron/main/rekordboxExport.ts`) and the audio files' own tags, read on import
and on **Reload Tag**. Cue points live only in Rekordbox's database, so only the XML can carry
them. MCO's Tags live only in MCO's database ([ADR 0008](0008-tags-live-in-the-database.md)), and
file tags are written only on an explicit user action ([ADR 0028](0028-suggest-never-auto-write-file-tags.md)).

## Decision
- Rekordbox is updated through those two channels only: a full collection XML written to a file
  Rekordbox is pointed at once (cues, BPM, key, metadata, MCO Tags as Genre, playlists), and,
  when the user asks, MCO's Tags written into the files' Genre so Reload Tag picks them up.
- Writing Tags into the files is one explicit, confirmed action for a whole batch (the user's own
  data, not a guess), with the count and an example shown first and songs without Tags left
  alone. This refines ADR 0028 for this case; suggestions from file names still need one save per
  song.
- Both stay one-way: nothing is read back from Rekordbox except playlists (ADR 0050).
- What Rekordbox overwrites on songs it already has is measured first (the feature's phase 0)
  and the behaviour follows the measurement.

## Alternatives considered
- **Write `master.db` directly**: everything in one step and no import, but needs SQLCipher, a
  reverse-engineered key, and writing another app's live database — a Rekordbox update or a bad
  write could damage the user's library. Rejected for the same reasons as reading it (ADR 0050).
- **Cue points in file tags** (as Serato does, in GEOB frames): Rekordbox doesn't read them.
- **Only the XML, never the files**: avoids writing files, but if Rekordbox doesn't refresh
  existing songs' metadata from the XML, Genre changes would never arrive.

## Consequences
- The user takes a step in Rekordbox after each update (refresh the xml tree and import, or
  Reload Tag); MCO's summary spells it out.
- Files change on disk when Tags are written to Genre — mtime changes (AIFF is re-transcoded for
  playback once), birth time is kept.
- If Rekordbox turns out to ignore XML changes for songs it already has, cue points can only
  reach new songs, and this ADR is revisited with the phase 0 findings.
