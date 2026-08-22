# Functionalities to be implemented urgently

Nothing here right now — every item that was here is implemented on the
`feat/todo-urgent-batch` branch/PR:

- Production DB safety: the app already ran a daily automatic backup with
  restore; added a "Back up now" button in Settings for an on-demand
  snapshot right before a risky change (this PR adds a `genres.color`
  column via an additive migration, and removes Mood from the UI/IPC
  without dropping the underlying `moods`/`track_moods` tables — no
  tagging data is deleted).
- A small tag icon now shows next to a track's title in the collection
  table when it has any tag/subtag.
- The collection table has a Tags column (badges, colored per-tag); a
  tag's color is set via right-click in the Tag Tree view.
- Mood is fully removed from the UI, store, and IPC surface.
- Genre/Sub-Genre are now labeled "Tag"/"Subtag" throughout the UI.
- Right-click a tag or subtag in the Tag Tree view to delete it, with a
  confirmation showing how many files are tagged with it.
- The single bipolar LP/HP filter knob is now two independent knobs (LP,
  HP), each its own permanent filter stage — no more level jump crossing
  zero.
- HTML entities (e.g. `&amp;`) are decoded wherever title/artist/album/
  filename are displayed — the underlying file is never touched.
- Tags were already stored in the database, not a separate file.
- Right-click a tag or subtag to rename it, with a confirmation showing
  how many files are affected.
- Embedded cover art now shows next to the track title in the footer
  player and in the queue view.
- New "Subtags" tree view alongside Folders/Tags: pick a subtag to see
  which tags its tracks actually carry, drill into one to narrow further.
- Clicking the play button in the collection table also selects/opens
  that row's details, same as clicking the row — clicking the row itself
  still doesn't start playback.
