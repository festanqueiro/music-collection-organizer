---
status: accepted
date: 2026-10-08
---
# 0062. Measure the tempo over the whole track, near the beat tracker's

## Context
The bar counter, the suggested cues and the zoom's bar lines all count `4 × 60 / BPM` seconds a
bar from the start of the tune. essentia's `RhythmExtractor2013` reports a tempo only as fine as
its 512-sample frames: on fast music a handful of values (166.71, 172.27, 178.21…). A 175 BPM
tune analysed as 172.27 is a beat out after 16 bars and a bar out after 64
([research](../research/bpm-accuracy.md)).

## Decision
- After the tracker, `refineBpm` (`electron/main/analysis/tempoRefine.ts`) measures the tempo
  over the whole track: an onset envelope (the rise in log-energy of bass, full band and highs,
  every 128 samples), and for each tempo within **±3.5 %** of the tracker's the size of the
  envelope's Fourier component at the beat rate and at 2× and 4×. The strongest wins, found to
  0.001 BPM.
- The tracker still chooses the tempo octave (87.5 or 175); the refinement never leaves ±3.5 %.
  (Since [ADR 0064](0064-bpm-two-thirds-and-set-by-hand.md) it also tries 1.5 times the tempo.)
- The result is stored to **0.01 BPM**, and as the **whole number** when it's within 0.03 of one.
- The tracker's value is kept when the track is under 10 s or no tempo stands out (the best is
  less than twice the median of those tried) — an acapella, a drone.
- It runs inside analysis, so a track gets it when it's analysed or re-analysed.

## Alternatives considered
- **A line through the tracker's beat times** (ticks against beat number): cheaper, but it
  leans on the tracker placing every beat, breakdowns included. Not tried.
- **Another tempo estimator, or other settings for this one**: not tried; the tracker's octave
  wasn't the problem, its precision was, and this measurement needs nothing new shipped.
- **Rounding every tempo to a whole number**: wrong for vinyl rips and live recordings.
- **A beat grid that follows each beat** instead of one tempo: what Rekordbox's dynamic analysis
  does; far more to build, and produced dance music doesn't need it.

## Consequences
- Tracks analysed before this keep their old tempo until re-analysed.
- A track whose tempo really drifts gets the tempo that fits most of it; bars still slide there.
- About 0.1–0.35 s more per track, on 6–13 s of analysis.
- Rekordbox export writes the refined tempo for tracks whose start was moved.
