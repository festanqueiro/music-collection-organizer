---
updated: 2026-10-09
---
# Analysis speed

Where the time of a track's analysis goes, and what makes it faster without changing the results.
Measured with scratch scripts in Node 24 (the same `essentia.js` 0.1.3 and bundled ffmpeg as the
app, outside Electron) on the user's Mac (M1 Pro, 8 fast + 2 slow cores, 16 GB). Nothing in the app
was changed by these measurements.

## 2026-10-09 — where the time goes

Fourteen tracks of the BETA collection copied to local disk (9 AIFF, 3 WAV, 1 MP3, 1 FLAC; 3 to
7 minutes), one at a time, each step timed:

| Step | Time, 14 tracks | Share |
|---|---|---|
| Beat tracker (`RhythmExtractor2013`, essentia) | 128.9 s | 65 % |
| Loudness (`LoudnessEBUR128`, essentia) | 29.4 s | 15 % |
| Onset rate (`OnsetRate`, essentia) | 17.8 s | 9 % |
| Key (`KeyExtractor`, essentia) | 6.9 s | 3 % |
| AIFF → FLAC transcode into the media cache | 5.5 s | 3 % |
| Tempo refinement (`tempoRefine.ts`) | 4.1 s | 2 % |
| Decode (ffmpeg) | 1.9 s | 1 % |
| First beat, waveforms, copies into WASM, tags | 2.7 s | 1 % |
| **Total** | **197.1 s (14.1 s a track)** | |

So 92 % is inside essentia's WASM, and MCO's own TypeScript is about 3 %. Rewriting MCO's code in
Rust (or anything else) would not be noticed; the gain is in which essentia algorithms are called.

## What was tried

### 1. The beat tracker's `degara` method instead of `multifeature` — 6.5× faster, same tempos

`RhythmExtractor2013` has two methods; MCO uses the default, `multifeature`. `degara` took 20.0 s
on the 14 tracks against 128.9 s.

The tracker's tempo is only a starting point: `tempoRefine.ts` then measures it over the whole
track ([ADR 0062](../adr/0062-tempo-measured-over-the-whole-track.md)). Compared on the 196
analysed tracks of the BETA collection that are on disk, with the stored BPM both ways:

- the two methods give a different BPM on 3 of 196 tracks (one by 0.01, one in the sixth decimal,
  and one where `degara` is right: 130 against `multifeature`'s 170.6, Rekordbox 130);
- against Rekordbox (`exportCollection_0810.xml`, 190 tracks in common): `multifeature` the same on
  174, `degara` on 175; the other verdicts (5 close, 8 double, 1 three-halves) are identical.

It also uses far less memory: on a 6 min 47 s track, the WASM heap grows to 455 MB with
`multifeature` and 112 MB with `degara`. That heap never shrinks, so it is most of a worker's size.

The cost is the first beat, which is read from the tracker's beats: `degara`'s is a little worse
(see 3).

### 2. Loudness in TypeScript instead of essentia — 30× faster, and closer to a real meter

EBU R128 integrated loudness is two filters and a gated average. Written directly (K-weighting
coefficients computed for 44.1 kHz, 400 ms blocks every 100 ms, the -70 LUFS and -10 LU gates) it
took 0.9 s on the 14 tracks against 29.4 s.

- On a 1 kHz tone both give -22.99.
- On music it reads 0.06 to 0.55 dB higher than essentia.js (median 0.21, 196 tracks). Checked on
  five tracks against ffmpeg's `ebur128` filter fed the same signal: the TypeScript one is within
  0.05 dB of ffmpeg, essentia.js is the one that is 0.1–0.35 dB low.
- The energy rating (1–10) changes on 9 of 196 tracks, each one step up.

**Found on the way**: the stored loudness is about 2.7–3 dB higher than a meter shows for the file
(-6.2 stored for a track ffmpeg measures at -8.9 LUFS). `decodeToPcm`'s `-ac 1` adds left and right
at 0.707 each when the output is float, so the mono signal is 3 dB hot, and can pass 1.0. The
energy rating's scale was set on these numbers, so it is consistent with itself. **Not changed.**

### 3. The first beat measured on the audio instead of read from the tracker

With the tempo known to 0.01 BPM, the onset envelope (already computed for the refinement) can be
folded at the beat's length: the place in the beat where the onsets pile up is the beat. About
80 ms a track, envelope included.

Distance from the first beat to the nearest beat of Rekordbox's grid, on the 135 tracks where the
BPM agrees and Rekordbox has one tempo:

| Method | Median | Within 25 ms | Over 100 ms |
|---|---|---|---|
| `multifeature` ticks (today) | 25 ms | 67 | 34 |
| `degara` ticks | 31 ms | 63 | 39 |
| Folded envelope | 6 ms | 96 | 31 |

The folded envelope's misses are mostly half a beat out (it locks on the off-beat). Limiting it to
a quarter beat around the tracker's first beat did not help (30 over 100 ms). Rekordbox's grid is
not a perfect reference either: some of those grids were never corrected. **[UNVERIFIED]** how
many of the 31 are Rekordbox's.

### 4. The tracker on part of the track — works, but no better than `degara`

`multifeature` on the middle 60 s, refined over the whole track, gave the same BPM on 14 of 14
(27.6 s). Slower than `degara` on the whole track, and it gives no beats near the start.

### 5. Onset rate on part of the track — not worth it

On a half, a third or a quarter of the track (10–15 s slices) it is 2–4× faster, but the rate moves
by up to 0.65 onsets a second and the energy rating changes on 1 to 3 of 14 tracks, in both
directions. Left as it is. With 1 and 2 applied it becomes the largest step (about 1.3 s of 4 s);
porting it to TypeScript would be the next thing to try.

### 6. More workers

28 tracks (the 14 twice), in separate processes, decoded straight from the files:

| Pipeline | Workers | Time a track | Memory, all workers (peak RSS) |
|---|---|---|---|
| Today | 4 | 3.79 s | 3.7 GB |
| Today | 8 | 2.31 s | 6.6 GB |
| 1 + 2 | 1 | 3.83 s | 1.2 GB |
| 1 + 2 | 4 | 1.07 s | 3.1 GB |
| 1 + 2 | 6 | 0.83 s | 3.7 GB |
| 1 + 2 | 8 | 0.67 s | 4.6 GB |
| 1 + 2 | 10 | 0.61 s | 5.5 GB |

Past the 8 fast cores there is little left. Part of each worker's peak is the decode's copies:
`decodeToPcm` holds the track three times while it joins ffmpeg's chunks (215 MB for a 72 MB
track). Reading into one buffer would take about 150 MB off a worker's peak (not tried). **[UNVERIFIED]** inside Electron's worker threads the
numbers will differ a little.

### 7. The AIFF transcode — small

Analysis decodes an AIFF from its FLAC copy in the media cache, making the copy first if needed:
0.4–1 s a track, 3 % today, about 10 % once 1 and 2 are in. It is there so analysis and playback
never read a cloud file twice at once (`queue.ts`). Not changed.

## What it adds up to

| | Time a track, 4 workers | Whole collection (2,641 tracks) |
|---|---|---|
| Today | 3.79 s | about 2 h 45 min |
| `degara` + TypeScript loudness | 1.07 s | about 47 min |
| The same with 8 workers | 0.67 s | about 30 min |

A native build of essentia (C++) or a Rust port was not measured: there is no ready arm64 build,
and after 1 and 2 the remaining essentia work is about 3 s a track on one core (tracker 1.4 s,
onset rate 1.3 s, key 0.5 s).
