---
status: accepted
date: 2026-10-12
---
# 0069. Warn when the collection is open on another computer

## Context
The data folder (`collection.db`, `config.json`) can be moved into the collection folder, and that
folder can be a synced one (Drive, Dropbox, iCloud). Two computers can then have the same database
open at once. SQLite's lock is local to each: both write their own copy, and the sync keeps
whichever uploads last — a session's tags, playlists and cues on the other are lost without a
message ([review, 2026-10-11](../log/2026-10-11-whole-app-review.md), group 1, *plausible*: nobody
has seen it happen).

## Decision
A note in the data folder, `open-on.json`: the computer's name and a time, rewritten every minute
while MCO is open and removed on quit. At launch, a note from **another** computer less than three
minutes old brings a warning — *This collection looks open on another computer (name)* — with
**Quit** (the default) and **Open Anyway**. This computer's own note (a crash) and an old one say
nothing. `electron/main/openElsewhere.ts`, asked in `index.ts` before the database is opened.

## Alternatives considered
- A lock that refuses to open: the note travels with the sync, minutes late or never when offline.
  A stale or late note would lock the user out of their own collection; a missing one would be
  believed. It can only ever be a hint, so it is one.
- SQLite WAL or an exclusive lock: local to the machine, sees nothing of the other.
- Doing nothing until it is observed: the loss is silent, so it wouldn't be.

## Consequences
- It warns only when the other computer's note has synced: two computers started within a minute
  or two of each other, or one offline, get no warning. Not a guarantee.
- A file is written to the data folder every minute, which a sync client uploads each time (a few
  bytes).
- Not addressed: the database stores absolute paths and the shared config one `collectionFolder`,
  so two computers that mount the collection at different paths can't share a data folder anyway
  (a second computer picking the folder writes its own path into the shared config,
  `dataMigration.ts`). Sharing a collection between computers isn't a supported feature, and
  (2026-10-12) isn't planned: the user has no need for it. This only makes the dangerous case
  speak.
