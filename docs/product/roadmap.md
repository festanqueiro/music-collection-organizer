---
updated: 2026-09-26
---
# Roadmap

What's shipped, what's in progress, and what's next. Status: `planned` · `in-progress` · `shipped`.
Per-release detail is in the [changelog](../log/changelog.md).

## Milestones
| Milestone | Status | Scope |
|---|---|---|
| **v1 Library** | shipped (2026-08-20 → 2026-08-22) | Scan a folder, analyse (BPM, key, waveform), tags and subtags, search and filters, cloud-only files, player, settings, daily backups, data folder inside the collection. [Design](../log/2026-08-20-v1-library-organizer-design.md). |
| **Player & FX** | shipped (2026-08-21 → 2026-09-01) | Queue, EQ/Filter/Delay/Reverb, Dub Siren, MIDI learn with LED feedback, output device. |
| **1.0.28 First release** | shipped (2026-09-24) | Installer + self-updater, visualizer, DJ tools (Camelot, Compatible, pre-listen, Rekordbox export), watch folder, MP3/AAC/OGG. |
| **1.0.35–1.0.38 Cast** | shipped (2026-09-26) | Cast to TVs and speakers with MCO's own receiver app; more visualizers; themes and Settings rework; CUE. |
| **1.0.39–1.0.41 Performance & tags** | shipped (2026-09-26) | 120 fps table, idle CPU ~0, ID3 editing, filename suggestions, Filters (Compatible, Analysed, Duplicates, Untagged), collapsible sidebar, external-disk backup, delete to Trash, chips. |
| **1.0.42 Cast reliability** | shipped (2026-09-26) | Keep the Mac awake while casting; end the session when the TV moves on. |
| **1.0.43** | in-progress (PR with this vault) | Don't drop a healthy TV when MCO is busy; multi-select details and right-click menu; this vault. |

## Next (roughly in priority order; S ≤ a day, M = a few days, L = a week+)
1. **Smart crates and saved playlists (M)** — named lists in `crates`/`crate_tracks`; smart crates as
   saved filter rules (tags AND/OR, BPM range, key, format, date added) using the table's filter
   predicates; a sidebar view; fed into the Rekordbox export.
2. **Portable library: relative paths (M)** — store paths relative to the collection folder, migrate
   once, resolve everywhere a path is used (media protocol, analysis, drag, reveal, tag export). Today
   a collection moved to a different path loses its tags ([ADR 0004](../adr/0004-never-delete-track-rows.md)).
3. **Hot cues and loops (L)** — up to 8 cue points per track (`track_cues`), waveform markers,
   number keys and MIDI pads, a zoomable waveform, loops later; in the Rekordbox export.
4. **TV visualizer quality (M)** — make more themes run on the Chromecast HD
   ([research](../research/cast-devices.md#chromecast-hd-gpu)).
5. **Tag writing for FLAC and ID3v2.2 (S–M)**, and a reviewed bulk flow for filename suggestions
   (still one explicit confirmation — [ADR 0028](../adr/0028-suggest-never-auto-write-file-tags.md)).
6. **Energy in the desktop app (S)** — a column, the details panel, a filter (today only the TV shows it).

## Known issues
- **`npm run dev` + React StrictMode**: Player's mount effect runs twice, so
  `createMediaElementSource` throws in dev only (packaged builds are fine).
- **Absolute track paths** (see Next #2); tag export/import has the same limitation.
- Genre names are unique case-sensitively in SQLite but matched case-insensitively in the UI.
- Undoing a genre deletion keys sub-genre associations by name, so two same-named sub-genres under
  one genre merge.
- The track context menu says "Show in File Explorer" on a macOS-only app ("Show in Finder" is
  native).
- The external-disk backup hasn't been run against a real external disk yet.

## UX improvements
- Discoverable context menus: a "⋮" button on hovered rows in the folder tree, tag trees and table.
- Column visibility: hide columns, not just reorder.
- Undo countdown on the tag-deletion toast.
- Why did analysis fail? Persist the error and show it.

## Watch list
- `node:sqlite` is still experimental ([ADR 0003](../adr/0003-node-sqlite.md)).
- `VACUUM INTO` and `runScan` run synchronously on the main process — fine now, but they delay timers
  ([ADR 0022](../adr/0022-cast-session-lifetime.md)).

## Later (not scheduled)
- Multiple collection folders.
- A two-deck mixing surface.
- Intel build (needs an Intel runner for `ffmpeg-static`, or a universal build with a lipo'd ffmpeg).
- Windows/Linux (the cloud-only heuristic is tuned to APFS + Google Drive for Desktop).
- Opt-in writing of MCO's tags into files (genre/comment), with backups and a dry-run preview.
- React component tests (`@testing-library/react`); UI is verified by hand and over DevTools.
- A "Copy diagnostics" button (version, recent main-process errors) for bug reports.
