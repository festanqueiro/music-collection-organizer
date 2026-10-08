---
status: accepted
date: 2026-10-08
---
# 0061. Convert makes a copy by default, and replaces by moving the track's row

## Context
"Convert to…" ([feature](../features/convert.md)) writes a track's file again in another format,
bit depth or sampling frequency. Two uses pull in different directions:

- *a copy for somewhere else* — an MP3 for a phone, 24-bit files on a USB stick for a CDJ that
  refuses 32-bit float: the collection shouldn't change at all;
- *this track, in a better container* — a WAV made AIFF so it can carry tags and a cover: the
  track should stay one track, with its Tags, cues, playlists and play count, and the old file
  should go.

A track's identity in MCO is its row (`tracks.id`); everything hangs off the id. The path is
unique, and a scan treats an unknown path as a new track and a known path with another size or
mtime as a changed file to analyse again. Files are never deleted by MCO
([ADR 0004](0004-never-delete-track-rows.md), [ADR 0031](0031-delete-moves-to-trash.md)).

## Decision
- The default is **a copy**, saved next to the original, and the folder can be changed. The
  original and its row aren't touched, and a copy never overwrites a file (the name gets ` (2)`).
- **Replace the original** is an explicit choice, off every time the dialog opens, and only
  offered when saving in the original's folder. It keeps the row and points it at the new file
  (`path`, `filename`, `format`, and the real file's `size`, `mtime`, `bitrate`), as moving a file
  does (`moveTracks.ts`), so nothing attached to the track is lost and the next scan sees nothing
  to redo. The original goes to the **Trash**, never `unlink`.
- ffmpeg writes to a temporary name without an audio extension and the file is renamed into place
  only after ffmpeg succeeded; a failed conversion leaves the collection exactly as it was.
- The analysis (BPM, key, waveform, loudness) is kept across a replace: it's the same audio.

## Alternatives considered
- **Replace by default**: one click fewer for the WAV → AIFF case, but the default action would
  move the user's file to the Trash. The user asked for the save path to default to the original's
  folder, which reads as "a copy here".
- **Insert a new row for the converted file and copy the Tags to it**: two tracks where there was
  one, with playlists, cues and play counts on the wrong one.
- **Replace into another folder** (convert and move at once): two things in one action, and a
  folder outside the collection would make the track vanish. Moving is already a drag in the
  Folders view.
- **Delete the original outright**: irreversible, against ADR 0031.
- **Re-analyse after a replace**: minutes of work for the same result on lossless conversions.

## Consequences
- A copy saved inside the collection shows as a new, untagged track after the scan that follows.
- A replace into MP3 or AAC keeps cue positions measured on the original; the encoder's delay
  (milliseconds) isn't compensated.
- Replacing a file by one of the same name (another bit depth) has a moment with no file at that
  path, between the Trash and the rename; a watcher-triggered scan in that instant would flag the
  track missing until the next scan revives it.
- If the original can't be trashed after a replace, both files exist and the old one shows as a
  new track on the next scan; the result says so.
