---
updated: 2026-09-28
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
| **1.0.47 Record mode (podcast)** | shipped (2026-09-27, PR #84) | One audio engine ([ADR 0041](../adr/0041-one-audio-engine.md)); recording the output to WAV/FLAC/MP3 with a level meter and Level knob (ADR 0042/0043); the Mic (player-bar popover, noise suppression) with its own effects incl. Pitch, ducking and Talk (ADR 0044); Live screen; FX screen in Music FX / Mic FX / Instruments groups; visualizer frame-rate cap (30 fps default, ADR 0045). No casting while recording; video later. [Feature](../features/recording.md). |
| **1.0.50 Show on a screen** | shipped (2026-09-28) | The visualizer, or the Cast receiver's Now playing screen, full screen on a second display (Apple TV as an AirPlay display, projector, monitor) or in a window, drawn by the Mac (ADRs 0046/0048; Now playing shipped in 1.0.51); Visual delay to match late audio (ADR 0047); Audio button with main and headphones outputs. The Apple TV itself still to test. [Feature](../features/second-screen.md). |
| **1.0.51 Windows installer** | shipped (2026-09-28) | An unsigned NSIS installer built on a Windows runner with every release; no auto-update on Windows; paths, cloud detection, mic prompt and Rekordbox locations made portable ([ADR 0049](../adr/0049-windows-installer-on-release.md)). Not yet tried on a Windows PC. [Releasing](../features/releases-and-updates.md#windows-adr-0049). |
| **1.0.53 Playlists** | shipped (2026-10-01, PR #99) | Playlists in folders (play, add, remove, drag to reorder, ⌫ with Undo), import from Rekordbox (XML, m3u8, text — songs at a different path on old USB sticks found and confirmed) and export (m3u8, and in the Rekordbox XML); Compare with Rekordbox (read-only report); Energy, LUFS and Volume Score columns and an Energy filter; why analysis failed; the website. [Feature](../features/playlists.md). |
| **1.0.52 Stats** | shipped (2026-10-01) | The collection in numbers (tiles, quality, tempo, keys, top genres/artists, years, added per month) for the whole collection or a folder; Add to queue on every row; threejs-visualisers 0.3.0 (Origins, Liquid renamed); Show on a screen fixed (visualizers were black, Now playing unstyled). [Feature](../features/stats.md). |

## Next (roughly in priority order; S ≤ a day, M = a few days, L = a week+)
1. **Smart crates (M)** — saved filter rules (tags AND/OR, BPM range, key, energy, format, date
   added) shown like playlists, after [Playlists](../features/playlists.md) (shipped in 1.0.53).
2. **Portable library: relative paths (M)** — store paths relative to the collection folder, migrate
   once, resolve everywhere a path is used (media protocol, analysis, drag, reveal, tag export). Today
   a collection moved to a different path loses its tags ([ADR 0004](../adr/0004-never-delete-track-rows.md)).
3. **Hot cues and loops (L)** — up to 8 cue points per track (`track_cues`), waveform markers,
   number keys and MIDI pads, a zoomable waveform, loops later; in the Rekordbox export, and the
   user's 111 Rekordbox hot cues imported from its collection XML
   ([research](../research/rekordbox-collection.md)).
4. **Two-way Rekordbox sync (L)** — Rekordbox's collection export compared with MCO against the
   last sync's snapshot (a three-way diff); one-sided changes carried over, conflicts resolved in a
   wizard of findings: playlists, music info (titles, artists, genre ↔ Tags…), cue points, files
   (missing, moved, outside the collection). MCO's side applied with undo; Rekordbox's written to
   the XML it reads, plus a checklist. Starts with a probe of what Rekordbox 7 overwrites on import,
   then a read-only report. [Spec](../features/rekordbox-sync.md),
   [ADR 0052](../adr/0052-two-way-rekordbox-sync-with-a-merge-wizard.md).
5. **Home (S–M)** — a calm first page: mixes of the day to play, queue or show (50 random from a
   Tag/Subtag, not played in a while, never played, just added, around a tempo, a harmonic run),
   never saved as playlists unless asked; the last music added, the last backups, and warnings with
   one action each (backup old or failed, files not found, not analysed, cloud-only, untagged,
   update). [Spec](../features/home.md), [ADR 0053](../adr/0053-mixes-are-temporary-lists.md).
6. **TV visualizer quality (M)** — make more themes run on the Chromecast HD
   ([research](../research/cast-devices.md#chromecast-hd-gpu)).
7. **Tag writing for FLAC and ID3v2.2 (S–M)**, and a reviewed bulk flow for filename suggestions
   (still one explicit confirmation — [ADR 0028](../adr/0028-suggest-never-auto-write-file-tags.md)).

## Known issues
- **`npm run dev` + React StrictMode**: Player's mount effect runs twice, so
  `createMediaElementSource` throws in dev only (packaged builds are fine).
- **Absolute track paths** (see Next #2); tag export/import has the same limitation.
- Genre names are unique case-sensitively in SQLite but matched case-insensitively in the UI.
- Undoing a genre deletion keys sub-genre associations by name, so two same-named sub-genres under
  one genre merge.
- The external-disk backup hasn't been run against a real external disk yet.

## UX improvements
- Discoverable context menus: a "⋮" button on hovered rows in the folder tree, tag trees and table.
- Column visibility: hide columns, not just reorder.
- Undo countdown on the tag-deletion toast.

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
