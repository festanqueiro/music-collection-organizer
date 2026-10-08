---
updated: 2026-10-08
---
# BPM accuracy: the beat tracker's tempo against the whole track

## 2026-10-08 — "the bars aren't right" on a 175 BPM tune

### The report
`4am Kru & Sir HIss - Earshots (Extended Mix).aiff` (4:28): the bar counter and the suggested
cues drift away from the music. MCO had analysed it as **172.265 BPM**.

### What the file says
Decoded to mono 11.025 kHz, onset envelope by spectral flux (2.9 ms hop), and for every tempo
from 160 to 185 BPM in 0.01 steps the size of the envelope's Fourier component at the beat rate
and at 2× and 4× (numpy, outside the app):

| Tempo | Score (best = 1) |
|---|---|
| 175.00 | 1.000 |
| 175.01 | 0.946 |
| 174.99 | 0.940 |

Refined to 0.001: **175.000 BPM**. First sound at 0.136 s.

### Why 172.265
essentia's `RhythmExtractor2013` works in frames of 512 samples at 44.1 kHz: 86.13 frames a
second. A beat a whole number of frames long can only be 5168 / n BPM: n = 29 → 178.21,
n = 30 → **172.27**, n = 31 → 166.71. A 175 BPM beat is 29.53 frames, and it reports 30. Slower
music has more frames a beat and its results are much closer (140.002, 129.96).

### What it does to the bars
Bars are counted as `(time − start) / (4 × 60 / BPM)`:

| Bar | Really at (175) | Counted at (172.265) | Late by |
|---|---|---|---|
| 16 | 21.94 s | 22.29 s | 0.35 s — a beat |
| 32 | 43.89 s | 44.58 s | 0.70 s |
| 64 | 87.77 s | 89.17 s | 1.39 s — a bar |
| 190 (the end) | 260.57 s | 264.71 s | 4.14 s — three bars |

### The fix, and what it gives on real tracks
`refineBpm` (`electron/main/analysis/tempoRefine.ts`,
[ADR 0062](../adr/0062-tempo-measured-over-the-whole-track.md)) does the same measurement inside
the app, ±3.5 % around the tracker's tempo. Sixteen tracks of the BETA collection, through the
app's own decode and `detectBpmAndKey`:

| Tracker | Refined | Track |
|---|---|---|
| 172.265 | **175** | 4am Kru & Sir Hiss — Earshots (Extended Mix) |
| 172.265 | **170** | LMajor — 12000 Watts |
| 172.265 | **170.6** | Tessela — Hackney Parrot |
| 166.169 | **168** | Y.L.S. — Roll z Bass |
| 164.995 | 165 | Zero — Amazon |
| 152.001 | 152 | Amy Kisnorbo & Sam Binga — Shake |
| 150.139 | 150 | Borai — Gunfingers |
| 146.011 | 146 | Dawa Hifi and Roots Raid — Maxidose |
| 143.953 | 144 | Babe Roots — World Struggle |
| 140.002 | 140 | 11th Hour — Armored; Strategy — Premium Grease |
| 139.986 | 140 | 2 Bad Mice — Snake Charmer; 207 — Živ |
| 129.960 | 130 | LMAJOR — Engineer; Violinbwoy — Big Dub Bang |
| 178.206 | 178.206 (kept) | Babe Roots — It A Come (Acapella): no tempo stands out |

Three tracks the tracker all called 172.265 are 175, 170 and 170.6. The refinement took 0.1–0.35 s
a track, against 6–13 s for the tracker itself.

### Not checked
- The refined values against Rekordbox's for the same files.
- Tracks whose tempo changes (live drums, vinyl rips that drift): one tempo is still assumed.
- Whether 170.6 for Hackney Parrot is right; it wasn't measured outside the app.
