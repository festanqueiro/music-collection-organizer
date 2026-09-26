---
updated: 2026-09-26
---
# Performance measurements

Measured on the BETA build over the Chrome DevTools protocol (`--remote-debugging-port`), on the
user's Apple silicon Mac with 2,643 tracks (2026-09-26). fps = `requestAnimationFrame` rate.

## Before the fixes
| Scenario | Result |
|---|---|
| Idle | ~40 fps; ~54,000 DOM nodes |
| FX knob drag (120 moves) | ~41 fps; JS almost idle — time went to style/layout/paint |
| Renderer CPU, nothing playing | ~12 % (`top`) |
| Web Audio render capacity, idle | FX context ~7 %, siren context ~2 % |

## After ([ADR 0023](../adr/0023-fx-settings-outside-react.md), [0024](../adr/0024-virtualised-track-table.md), [0025](../adr/0025-suspend-idle-audio-engines.md))
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
