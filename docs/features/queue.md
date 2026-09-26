---
status: shipped
updated: 2026-09-26
adrs: [0012]
---
# Queue

MCO has a play **queue**, not saved playlists. It's first-in, first-out:
the track playing is always at the top, and once it finishes (or you skip)
it leaves the queue.

## Adding tracks

From a track row (right-click, or its play-circle icon):

- **Play track now** — puts it at the top and plays it;
- **Add to queue** — adds it at the end;
- **Add to top of the queue** — plays it next.

In bulk:

- **Add all to queue** above the table queues everything currently
  visible;
- **Add all to queue** in the folder tree's right-click menu queues a
  folder.

For more than 50 tracks, or when some aren't analysed yet, a dialog asks
whether to analyse the unanalysed ones now or just queue them (they're
then analysed when they reach the player). A toast confirms how many were
queued.

## Queue view

The **Queue** button on the right of the player bar (it shows how many
tracks are queued) opens the full-screen queue; click it again, or the ✕,
to close it:

- drag rows to reorder;
- right-click a row: **Play track now**, **Add to top of the queue**,
  **Remove from queue**;
- **Play next in queue**, **Shuffle**, and **Clear queue** in the header
  (Clear queue removes everything after the track playing, which stays);
- **Continuous play** — when on, the next track starts automatically; when
  off, playback stops after each track;
- the total queue duration.

The effects have their own screen: see [FX](fx.md).

Code: `src/components/PlaylistView.tsx`, `QueueDialog.tsx`,
`src/state/playlist.ts` (pure queue operations), `src/state/store.ts`.

With several tracks checked, right-clicking one of them offers **Add all to
queue** and **Add all to top of the queue** (in table order).

## Tests
- `src/state/playlist.test.ts`, `store.queue.test.ts`.
