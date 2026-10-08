---
status: accepted
date: 2026-10-08
supersedes: the "never leaves ±3.5 %" rule of 0062
---
# 0064. Try the tempo one and a half times faster; a BPM set by hand is the user's

## Context
[ADR 0062](0062-tempo-measured-over-the-whole-track.md) sharpens the beat tracker's tempo within
±3.5 % and leaves the choice of tempo to the tracker. On broken beats the tracker often reports
two thirds of the tempo (106.67 for 160), and often half of it (85 for 170)
([research](../research/bpm-accuracy.md)). Bars, suggested cues and the Compatible filter all
count with that number. And however good the analysis gets, the user knows the tempo of their
own tunes.

## Decision
- **Two thirds, automatically.** After the tracker, the analysis also measures the tempo 1.5
  times faster (when that stays under 200 BPM). It takes it when it stands out and the track is
  more than **1.65** times stronger there than at the tracker's tempo. Measured: the nine tracks
  that were two thirds out are at 1.80 and above, the 23 that weren't at 1.47 and below.
- **Half and double, never automatically.** 85 and 170 describe the same track; which one is
  "the" tempo is a matter of how it is mixed. (Since [ADR 0066](0066-half-time-is-a-slowest-tempo.md)
  a slowest tempo settles it.)
- **Refine BPM** in a track's menu: Double, Halve, Two-thirds fix (× 1.5), Set the BPM. A
  multiplied tempo is sharpened on the audio near the result (106.58 × 1.5 → 160, not 159.87),
  kept only if it lands within 3.5 % of it; a typed tempo is taken as typed. 30 to 300 BPM.
- **A tempo set this way is the user's**: `tracks.bpm_edited = 1`, and analysis writes every
  other result but keeps that BPM (`bpm = CASE WHEN bpm_edited = 1 THEN bpm ELSE @bpm END`).
  *Detect it again* clears the flag and analyses the track.
- **Rekordbox's BPM** (the collection import's *BPM* choice) counts as set by the user too:
  it replaces MCO's where they differ and survives analysis.

## Alternatives considered
- **Pick the strongest tempo anywhere from 60 to 200**: it would also "fix" half time, in both
  directions, on tracks where the user wants the other reading; and a strong 2× component is
  normal (hats), so it would double tracks that are right.
- **A lower or higher threshold**: at 2.5 two of the nine were missed; below 1.47 a half-time
  track and an ambient dub would have been moved to tempos that are not theirs.
- **Overwrite a hand-set BPM on re-analysis**: the user would have to fix the same tracks after
  every analysis.
- **A separate "manual BPM" column next to the analysed one**: two tempos per track for every
  reader to choose between; one value and a flag is enough.

## Consequences
- The gap the threshold sits in is narrow and comes from 32 tracks: a track can still come out
  wrong either way. Refine BPM is the way out.
- Tracks analysed before this keep their BPM until re-analysed.
- A re-analysis no longer changes the BPM of a track whose BPM was set by hand or taken from
  Rekordbox, until *Detect it again*.
- The analysed first beat is not re-detected when the BPM is changed by hand.
