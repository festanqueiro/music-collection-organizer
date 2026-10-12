---
status: accepted
date: 2026-10-12
---
# 0071. A collection that moved keeps its tracks

## Context
Tracks are stored by absolute path, and everything a track has hangs on its row: analysis, cues,
tags, playlists, play counts. A collection copied to another computer (`/Users/a/Music` →
`/Users/b/Music`), to another drive, or in a renamed folder was, to the scan, a set of new files:
the old rows were hidden as missing ([ADR 0004](0004-never-delete-track-rows.md)) and every file
came in blank, to be analysed again, with no cues and in no playlist. The data folder travels with
the collection (`.mco`, [ADR 0009](0009-data-folder-inside-collection.md)), so the expectation is
that it still describes it.

## Decision
The scan recognises a moved track (`runScan` in `electron/main/scan.ts`): a file not yet known, at
the same place **inside the collection folder** and of the **same size** as **exactly one** track
whose file isn't on disk, is that track. Its row takes the new path (and filename, folder, modified
time); nothing else on it changes, and nothing is analysed again. Paths are compared with accents
normalised and either separator, so a collection from the other platform matches.

- Two tracks it could be: no guess — the file comes in as new.
- The date added stays the old one: a copy is new to the disk, not to the collection.
- It runs on every scan (Update Collection, the folder watcher, a collection folder change). When
  the first folder pick on a computer adopts a `.mco` that came with the collection and names
  another folder, the next launch scans before the window lists anything (`rescanAtLaunch`, set in
  `dataMigration.ts`), so the tracks never show at paths that aren't there.
- Only the database changes. No audio file is touched.

## Alternatives considered
- Storing paths relative to the collection folder: the right shape, but a migration of every row
  and of every query, IPC and playlist import that reads `path`, for the same visible result.
- Rewriting a prefix when the collection folder changes (old root → new root): needs the old root,
  which isn't known after a restore or when the config was already rewritten, and moves rows whose
  files may not be there.
- Matching by audio fingerprint or tags: slow, and wrong for the same recording kept twice.

## Consequences
- A file moved in Finder to a place whose path ends the same way (`a/x.wav` → `Old/a/x.wav`) is
  also taken as the same track. A file moved to a differently named folder is still a missing track
  and a new one — moving files inside the collection is what *Move to folder* is for.
- Size is the only content check: a different file with the same name, place and byte size would
  inherit the row. Not expected in practice.
- Switching between two collections that share files moves those rows back and forth: each is
  shown with its data in whichever is current.
- Sharing one collection between two computers at once is still not supported
  ([ADR 0069](0069-warn-when-open-on-another-computer.md)); this is for a collection that moved.
