# Functionalities to be implemented urgently

Nothing here right now — every item that was here is implemented on the
`feat/to-dos-update` branch/PR:

- Reverb mix range doubled; decay time and pre-delay time added, both
  MIDI-configurable.
- Dub siren Rate/Depth/Pitch/Volume behavior clarified with a new
  MIDI-configurable Depth control.
- Track table column order is now drag-to-reorder and persisted.
- `npm run dist:install` copies a production build to `~/Applications`.
- Play/pause (toggle) and Play next (trigger) are MIDI-configurable, with
  LED feedback on play/pause.
- The sub-genre picker filtering bug could not be reproduced — extensive
  live testing (multi-genre add/remove/cascade scenarios) showed it
  updating correctly in every case; likely already fixed as a side effect
  of the TagPicker rewrite in the previous PR. Re-open with repro steps
  if it's still happening.
- "Add all to queue" — a button above the track table, and a right-click
  item on any folder in the tree.
- "Show in Folder Tree View" on a track's right-click menu.
