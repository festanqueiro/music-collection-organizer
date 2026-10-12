---
status: accepted
date: 2026-10-12
---
# 0068. Select rows in the track table without checkboxes

## Context
The table had two selections at once: the **selected** row (a click; the details panel shows it)
and the **checked** rows (a checkbox column, with shift-click for a range; the selection toolbar
and the "… all" menu items act on them). They shared one highlight, so it wasn't visible which was
which, and a plain click left the checks in place: a bulk action could act on rows checked earlier.
A clicked checkbox also kept the keyboard focus, and the table's keys (⌘A, ⌫, arrows, P) stopped
working until something else was clicked
([review, 2026-10-11](../log/2026-10-11-whole-app-review.md)). The user asked for the checkboxes
to go: the keyboard and shift should be enough.

## Decision
One selection, made as in Finder, and no checkbox column:

- a click selects that row alone;
- shift-click, and shift with ↑ ↓ Home End Page Up/Down, select from the **anchor** (the last row
  clicked or moved to without shift) to that row, replacing what was selected;
- ⌘-click (Ctrl-click on Windows) puts a row in or takes it out;
- ⌘A selects every row listed; Esc goes back to the one row.

In the store, `checkedTrackIds` now means *the rows selected together* and is empty while one row
(or none) is selected — that one is the `selectedTrack` the details panel shows. Everything that
read the checked rows (the selection toolbar, the "… all" items, the drag of several rows, ⌫ in a
playlist) is unchanged. The rules are pure functions in `src/state/rowSelection.ts`.

The key handler skips only what really uses those keys — a text field, a `select`, a slider, an
editable element — not every `input` and `button`, and is off while Queue, FX, Live or the
visualizer covers the table.

## Alternatives considered
- Keep the checkboxes and only fix the focus bug: two selections stay, and a column of the table
  goes on a control the keyboard and the mouse already cover.
- Rename `checkedTrackIds` to `selectedTrackIds` and fold `selectedTrack` into it: the right name,
  but it touches every bulk action for no change in behaviour. Left for when that code is next
  opened.

## Consequences
- A plain click drops a selection of several rows — as in Finder. A stray click loses it; the
  rows can be selected again with shift-click, and nothing acts on rows selected earlier and
  forgotten.
- One selected row no longer shows the selection toolbar: its details panel tags it, and its
  right-click menu does the rest.
- Touch has no ⌘ or shift. The app is desktop only.
- Text in the rows can't be selected with the mouse any more (`user-select: none`), so that
  shift-click doesn't select it.
