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

## 2026-10-08 — "tracks around 160 show as about 108"

### What it is
On broken beats (jungle, footwork, 160) the beat tracker follows every third half-beat and
reports **two thirds** of the tempo: 106.67 for 160, 113.33 for 170.

### How strongly each tempo is in the track
The same measurement as above (the size of the onset envelope's component at the beat rate and at
2× and 4×), at the stored tempo and at 1.5 times it, for 32 tracks of the BETA collection where
1.5× stays under 200 BPM. The ratio is faster ÷ stored:

| Ratio | Stored → 1.5× | Track | Really |
|---|---|---|---|
| 11.72 | 111.43 → 167.8 | Hidden Agenda — Dispatches #1 | two thirds |
| 6.01 | 111.15 → 167 | Y.L.S. — Looking In | two thirds (Rekordbox: 167) |
| 4.48 | 109.41 → 165 | Xtanki, Zero — Extent | two thirds |
| 4.33 | 112.43 → 170 | Zero — Homecoming | two thirds |
| 3.51 | 106.65 → 160 | Freud & Xtanki — Bos | two thirds |
| 3.27 | 113.23 → 170 | Y.L.S., JSwift — Seeded | two thirds (Rekordbox: 170) |
| 2.64 | 106.58 → 160 | LMajor — 160 Yo | two thirds (Rekordbox: 160) |
| 2.10 | 93.19 → 140 | Benton — Badman BBS VIP | two thirds (140 is the strongest tempo from 60 to 200) |
| 1.80 | 100.03 → 150 | Kessler — Tribunal | two thirds (150 is the strongest tempo from 60 to 200) |
| 1.47 | 84.99 → 127.5 | Quartz — Runtime | not this (half time, more likely) |
| 1.44 | 71.88 → 108 | Babe Roots — World Struggle (Ambient Dub) | not this |
| ≤ 0.93 | | the other 21, among them real 108, 109, 122–128 BPM tracks | right as stored |

So the tracks that are two thirds out sit at 1.80 and above, the others at 1.47 and below. The
analysis takes the faster tempo above **1.65** (`THREE_HALVES_RATIO` in `tempoRefine.ts`,
[ADR 0064](../adr/0064-bpm-two-thirds-and-set-by-hand.md)). On 77 tracks (those 32 and 45 more)
it moved those nine and no other.

### Against Rekordbox
One collection export (`exportCollection_0810.xml`, 2,777 tracks) against the BETA database as
it was before this fix, on the 218 songs both have a BPM for:

| MCO against Rekordbox | Songs |
|---|---|
| the same (within 0.05) | 96 |
| within 1 % | 84 |
| MCO has two thirds of Rekordbox's | 5 |
| MCO has half of Rekordbox's | 16 |
| MCO has twice Rekordbox's | 2 |
| something else | 15 |

Half time is three times as common as two thirds here. It isn't corrected automatically — 85 and
170 are both honest readings of the same track — which is what **Refine BPM → Double** is for, or
importing Rekordbox's BPM.

### Not checked
- The 15 "something else" and the 84 within 1 % (most of those were analysed before the
  whole-track refinement).
- The threshold on other collections: the gap between 1.47 and 1.80 is narrow, and it comes from
  32 tracks.

## 2026-10-08 — half time: can the audio tell?

The 19 tracks of the BETA collection stored under 97 BPM, with how much stronger each is at
double the stored tempo (the same measure as above) and what Rekordbox has:

| Ratio | MCO | Rekordbox | |
|---|---|---|---|
| 3.25 | 82.37 | 165 | doubled |
| 2.56 | 84.99 | 85 | kept |
| 2.09 | 79.82 | 80.01 | kept |
| 2.01 | 82.54 | 165 | doubled |
| 1.90 | 80.01 | 160 | doubled |
| 1.77 | 80.09 | 160 | doubled |
| 1.59 | 83.43 | 83.5 | kept |
| 1.58 | 82.32 | 164.99 | doubled |
| 1.54 | 82.45 | 165 | doubled |
| 1.36 – 0.64 | 65 – 71.88 | 130 – 143.98 | doubled (nine tracks) |
| 0.82 | 93.19 | 93.35 | kept |

No ratio separates the doubled from the kept: half time is a convention
([ADR 0066](../adr/0066-half-time-is-a-slowest-tempo.md)). With a slowest tempo of 90, a read-only
run of the new measurement over those tracks and a sample of others (30 in all): the 17 under 90
doubled to 130, 135, 136.94, 140 (×4), 143.97, 159.8, 160 (×2), 165 (×4), 167 and 170 — Rekordbox's
values within 0.02 BPM on the 14 it doubles; 91.93 → 138 and 93.19 → 140 by the two-thirds check;
ten faster tracks unchanged but for the whole number next to them.

`npm run bpm:compare` gives the comparison with Rekordbox for a whole collection.
