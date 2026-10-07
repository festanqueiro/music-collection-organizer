---
updated: 2026-10-07
---
# Performance measurements

Measured on the BETA build over the Chrome DevTools protocol (`--remote-debugging-port`), on the
user's Apple silicon Mac (M1 Pro, 16 GB). fps = `requestAnimationFrame` rate. Memory is RSS from
`ps`, CPU is % of one core.

## 2026-10-07 — 1.0.54, 2,641 tracks (BETA: 208 analysed; production: all analysed)

### What was measured
| Scenario | Result |
|---|---|
| Idle, 45 s after a clean launch | 0 % CPU in every process; main 153 MB, renderer 159 MB, GPU 72 MB, utility 126 MB (~510 MB in all) |
| Idle | 119 fps, p95 frame 8.6 ms; ~2,500 DOM nodes, 27 MB JS heap |
| Scrolling the table 400 px/frame | 117 fps, 2 frames > 25 ms in 3 s |
| Typing in search | 4–9 ms per keystroke to paint |
| Sorting by a column | 6–14 ms (Date Added 27 ms) |
| Selecting a row / arrow keys held | 7–8 ms; 119 fps |
| Checking a row / check all | 7–13 ms |
| Playing (muted), table showing | 120 fps, no long tasks; renderer ~6 % CPU |
| FX / Queue / Live views | open in 23 / 11 / 17 ms, 117–120 fps |
| Visualizer (Origins, 30 fps cap, 2400×1536) | renderer ~24 %, GPU ~13 % |
| After all of it, forced GC | 1,920 DOM nodes, 420 listeners, 20 MB heap — nothing leaks |
| Analysing 8 tracks (4 workers), 33 s | main up to **2.0 GB** and ~400 % CPU; UI 116–120 fps still, 85–95 fps scrolling; back to 276 MB after |
| Playing a track analysed before energy/first beat existed | re-analysed in the background: main ~740 MB, one core, ~10 s; UI unaffected |
| Renderer while playing and using the views | 460–620 MB RSS (JS heap stays ~20 MB — audio and GPU memory) |

### Findings
1. **The track list carries every waveform.** `tracks:getAll` returns each track's 800 peaks
   (~15 kB of JSON each, full float precision). On BETA (208 analysed) that is 5 MB and ~45 ms a
   call; with the whole collection analysed, as in production (38 MB of peaks in the database),
   a copy of the database timed in Node gave ~100–140 ms of query + `JSON.parse` on the main
   thread plus ~250–300 ms of structured cloning, per call (78 MB as JSON). It runs at startup,
   after every tag create / rename / recolour / delete, after a download, on every tag-read
   progress event and every 300 ms during an analysis run. Only the player, the cast queue and
   the hot-cue suggestions read the peaks. Without them the same call is ~20 ms and 2.3 MB.
   Rounding the peaks to 3 decimals alone gives 26 MB and ~300 ms. **Fixed the same day**
   ([ADR 0058](../adr/0058-waveforms-read-per-track.md)): the list no longer carries them; on BETA
   the call went from 5.1 MB / ~45 ms to 2.1 MB / ~27 ms, and it no longer grows as tracks are
   analysed.
2. **Analysis memory**: ~500 MB per worker (the whole track decoded in memory, plus essentia's
   WASM heap), so 4 workers peak at ~2 GB. Released when the run ends.
3. **Tracks stuck in "analyzing"**: BETA had 11 rows left in `analysis_status = 'analyzing'`
   from runs that ended with the app (quit or reinstall mid-analysis). Nothing resets them at
   startup, a bulk run only picks `pending` and `error`, so they keep their spinner and are
   skipped by *Analyse Collection*. **Fixed the same day**: they go back to `pending` at startup
   (`resetInterruptedAnalysis`); BETA's 11 were reset on the next launch.
4. **Disk**: the transcode cache is capped at 10 GB per install (`MEDIA_CACHE_MAX_BYTES`):
   production is at the cap, BETA at 8.1 GB — ~18 GB on a disk with 77 GB free. Production
   backups are 1.2 GB (60 files, the older ones 40 MB each).
5. The first launch after reinstalling BETA showed main at ~900 MB / ~98 % CPU for a while; it
   did not happen again on a clean relaunch and matches a background analysis of the tracks the
   test selected and played (finding 2), not startup work.

## 2026-09-26 — 2,643 tracks

### Before the fixes
| Scenario | Result |
|---|---|
| Idle | ~40 fps; ~54,000 DOM nodes |
| FX knob drag (120 moves) | ~41 fps; JS almost idle — time went to style/layout/paint |
| Renderer CPU, nothing playing | ~12 % (`top`) |
| Web Audio render capacity, idle | FX context ~7 %, siren context ~2 % |

### After ([ADR 0023](../adr/0023-fx-settings-outside-react.md), [0024](../adr/0024-virtualised-track-table.md), [0025](../adr/0025-suspend-idle-audio-engines.md))
| Scenario | Result |
|---|---|
| Idle | 120 fps, worst frame 13 ms, ~800 DOM nodes, 17 MB JS heap |
| Playing (muted), waveform showing | 121 fps |
| Scrolling the table 400 px/frame | 114 fps, 2 frames > 25 ms in 3 s |
| Typing in search | 15–25 ms per keystroke |
| FX open + knob drag (276 moves) | 121 fps, worst frame 9 ms |
| Visualizer | 102 fps |
| Views (tags, folders, queue, settings) | open in 11–16 ms, 120 fps |
| Startup to first track rows | ~0.9 s |
| Renderer CPU, nothing playing | ~0 % (contexts suspended 15 s after going quiet) |
| Memory | renderer ~300 MB RSS, main ~168 MB |

## Other timings
- Background tag read: 2,388 files in ~221 s (~90 ms/file) from Google Drive.
- Renderer bundle ~3.3 MB JS; Material Symbols font ~3.9 MB (local, fine).

## Notes
- The main process's synchronous work (scan, `VACUUM INTO`) delays timers and I/O callbacks; anything
  time-based there must tolerate it ([ADR 0022](../adr/0022-cast-session-lifetime.md)).
