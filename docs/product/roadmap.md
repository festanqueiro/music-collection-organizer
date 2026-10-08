---
updated: 2026-10-08
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
| **1.0.53 Playlists** | shipped (2026-10-02, PR #99) | Playlists in folders (play, add, remove, drag to reorder, ⌫ with Undo), import from Rekordbox (XML, m3u8, text — songs at a different path on old USB sticks found and confirmed) and export (m3u8, and in the Rekordbox XML); Compare with Rekordbox (read-only report); hot cues A–H with Rekordbox's cues in and out; Energy, LUFS and Volume Score columns and an Energy filter; why analysis failed; the website. [Feature](../features/playlists.md). |
| **1.0.52 Stats** | shipped (2026-10-01) | The collection in numbers (tiles, quality, tempo, keys, top genres/artists, years, added per month) for the whole collection or a folder; Add to queue on every row; threejs-visualisers 0.3.0 (Origins, Liquid renamed); Show on a screen fixed (visualizers were black, Now playing unstyled). [Feature](../features/stats.md). |
| **1.0.55 Track details** | shipped (2026-10-07, PR #103) | The details in sections, playlists a track is in, Similar tracks, a menu bar, the bar counter, the start of the tune. |
| **1.0.56–1.0.57 Playlists polish, Convert** | shipped (2026-10-08, PRs #105, #108) | Search in the Playlists box, a destination and a fixed-size summary for Rekordbox imports, folders first; Tags suggested from playlists; **Convert to…** (format, bit depth, sampling frequency — [feature](../features/convert.md)). |
| **1.0.58–1.0.59 Tempo** | shipped (2026-10-08, PRs #110, #113) | The tempo measured over the whole track ([ADR 0062](../adr/0062-tempo-measured-over-the-whole-track.md)) and two thirds of it caught ([ADR 0064](../adr/0064-bpm-two-thirds-and-set-by-hand.md)); **Refine BPM**; a choice of what a Rekordbox collection import brings; resizable panels; the largest files split; Graphify as a dev tool. |
| **1.0.60 Waveform** | shipped (2026-10-08, PR #115) | Bar lines and three waveform styles ([ADR 0065](../adr/0065-coloured-waveforms-from-three-bands.md)), a larger player, an × on hot cues with Undo, right-click menus kept on screen, sync and analysis status in the details. |

## Next (roughly in priority order; S ≤ a day, M = a few days, L = a week+)
1. **Smart crates (M)** — saved filter rules (tags AND/OR, BPM range, key, energy, format, date
   added) shown like playlists, after [Playlists](../features/playlists.md) (shipped in 1.0.53).
2. **Portable library: relative paths (M)** — store paths relative to the collection folder, migrate
   once, resolve everywhere a path is used (media protocol, analysis, drag, reveal, tag export). Today
   a collection moved to a different path loses its tags ([ADR 0004](../adr/0004-never-delete-track-rows.md)).
3. **Hot cues and loops (L)** — hot cues A–H are built ([Hot cues](../features/hot-cues.md),
   [ADR 0055](../adr/0055-cue-points-in-mco-kept-rekordbox-compatible.md)): pads, keys 1–8, MIDI
   pads, waveform markers, names and colours, the Cues column, Rekordbox import and export. Still to
   do: playable loops and memory cues, a zoomable waveform, quantize to the beat, pads on the Live
   screen.
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

## Code health (from the review of 2026-10-08)
Done with the review and right after it:
- a same-name Convert replace that could lose the converted file; Refine BPM freezing the window
  on a batch (now a worker thread, with progress); a Rekordbox import without playlists ignoring
  songs found at another path;
- **unused code fails the type-check** (`noUnusedLocals`, `noUnusedParameters`, so CI too);
- **`npm run test:app`**: the built app driven with Playwright on the demo library
  (`tests/app/smoke.mjs`, 24 checks — handlers, details sections, popovers, a menu on the last
  row, Refine BPM, hot cue × and Undo, the larger player, bar lines, the waveform styles);
- **`npm run bpm:compare`**: MCO's tempos against a Rekordbox export
  ([research](../research/bpm-accuracy.md));
- every right-click menu through `ContextMenu` (the player's three included) and closed by Esc;
- the Classic waveform drawn once, the played part revealed by a clip;
- a Rekordbox collection export parsed once per import;
- `readStored` / `writeStored` / `readStoredFlag` (`src/state/stored.ts`) for the identical save
  blocks and on/off loaders (33 of them); `foldText` for accent folding;
- dependencies updated within their ranges (Electron 43.7.9, React 19.3, Vite 7.3.7,
  music-metadata 11.16); `checkout`, `setup-node` and the artifact actions on current versions in
  `ci.yml` and `release.yml`;
- README, and how to update the vendored Graphify skill (CLAUDE.md);
- **`store.ts` from 2,286 lines to 1,380**: hot cues and waveforms (`cueSlice.ts`), saved
  playlists (`savedPlaylistSlice.ts`), MIDI (`midiSlice.ts`), Tags (`tagSlice.ts`), and what the
  playing actions share (`playbackHelpers.ts`) — code moved, not changed;
- Convert works on three files at a time;
- **half time** settled by a slowest tempo in the analysis, with the Slow BPM filter and *Measure
  it again* for tracks already analysed ([ADR 0066](../adr/0066-half-time-is-a-slowest-tempo.md));
  **Tag names** the same whatever their capitals.

Still to do, most useful first:

1. **The rest of `store.ts` (M)** — 1,380 lines, of which the `CollectionState` type is 580: split
   the type by slice, and take the player and queue, the cast and screen settings, and the
   collection actions out. Then **one Undo** for the five separate ones (queue, playlist, hot cue,
   tag, subtag). The other large files: `TrackTable.tsx` 1,460 (its two menus), `ipc.ts` 976
   (cast, backups), `App.tsx` 915, `Player.tsx` 897.
2. **Re-check the tempo rules on the whole collection (S)** — `npm run bpm:compare` after the
   collection's tempos are measured again: the two-thirds threshold rests on 32 tracks, and the
   slowest tempo ([ADR 0066](../adr/0066-half-time-is-a-slowest-tempo.md)) on 19.
3. **The other remembered settings (S)** — 26 `localStorage` calls keep their own validation
   (layouts, lists, choices); none of the remembered settings are in the backups.
4. **`version-bump.yml` and `pages.yml` on current actions (S)** — left on the old versions: they
   only run on `main`, so a break can't be seen in a PR. `checkout` v6 changed how credentials are
   kept, which the bump's push depends on.
5. **Major dependency updates (S each, one at a time)** — Electron 44, Vite 8, Vitest 5,
   music-metadata 12, `@vitejs/plugin-react` 6.
6. **The smoke test in CI (S–M)** — it needs a display (xvfb) and the demo collection made on
   the runner.
7. **The website (S)** — no mention of Convert, Refine BPM, the waveform styles or the larger
   player; clips from 1.0.53 (they don't record on a Mac with Playwright 1.64).

## Known issues
- **`npm run dev` + React StrictMode**: Player's mount effect runs twice, so
  `createMediaElementSource` throws in dev only (packaged builds are fine).
- **Absolute track paths** (see Next #2); tag export/import has the same limitation.
- Reloading the window (dev builds and the smoke test only) logs six fonts given as `data:` URIs
  and refused by the page's Content-Security-Policy (`default-src 'self'`, no `font-src`). Not on a
  first load; where they come from wasn't traced.
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
- React component tests (`@testing-library/react`); see Code health #2 for the smoke test first.
- A "Copy diagnostics" button (version, recent main-process errors) for bug reports.
