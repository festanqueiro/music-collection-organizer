---
status: accepted
date: 2026-10-08
supersedes: "Half and double, never automatically" in 0064
---
# 0066. Half time is settled by a slowest tempo, not by the audio

## Context
[ADR 0064](0064-bpm-two-thirds-and-set-by-hand.md) left half time to the user: 85 and 170
describe the same track. Against a Rekordbox export it was the most common difference by far —
16 of 218 songs at half Rekordbox's BPM, against 5 at two thirds
([research](../research/bpm-accuracy.md)).

Could the audio decide, as it does for two thirds? Measured on the 19 slow tracks of the BETA
collection (stored under 97 BPM): how much stronger the track is at double the stored tempo. For
the 14 Rekordbox doubles the ratio runs from 0.64 to 3.25; for the 4 it keeps slow, from 0.82 to
2.56. They overlap completely: the audio says nothing. Rekordbox isn't consistent either — it has
165 for one tune and 82.5 for another by the same producers.

It is a convention. DJ software handles it with a tempo range: analysis results are folded into
the range the user mixes in.

## Decision
- **A slowest tempo** (Settings → Library → Tempo; 90 BPM by default; 70, 80, 100 or none): after
  the tempo is sharpened and the two-thirds check, a BPM below it is **doubled**, then sharpened
  on the audio near the double (82.37 → 165; kept as the plain product, 164.74, if the audio
  doesn't agree within 3.5 %). Never past 200 BPM.
- It is applied **when a track is analysed** (`analysedBpm` in `analysis/tempoRefine.ts`; the
  limit travels to the workers with each task). No fastest tempo: nothing halves.
- **For tracks already analysed**, without a full re-analysis:
  - the **Slow BPM** filter lists the tracks below the limit whose BPM wasn't set by hand;
  - **Refine BPM → Measure it again** runs the tempo part of the analysis alone, from the stored
    BPM, in a worker — about a second a track — and stores the result as the analysis's own
    (`bpm_edited` stays 0). **Double** does the same by hand, as the user's own.
- A BPM set by hand or taken from Rekordbox is never doubled or re-measured.
- Nothing is changed in an existing collection on its own: the user runs it.

## Alternatives considered
- **Decide from the audio**: measured above; it can't.
- **Leave it to the user** (ADR 0064): 7 % of a collection to find and fix by hand, with no way to
  find them.
- **A full range with a fastest tempo too** (halve above 180): nothing in this collection is
  analysed that fast, and halving a 175 BPM tune would be the wrong way round for it.
- **Double at analysis only**: the existing collection would need a full re-analysis, 6–13 s a
  track, for a one-second measurement.
- **A lower default (80)**: the tunes at 80–85 here are 160–170 jungle; Rekordbox keeps four of
  them slow, and their DJ plays them fast.

## Consequences
- A tune really meant at 70–89 BPM (hip hop, slow reggae) is stored doubled: lower the limit, or
  set its BPM by hand (which sticks).
- The limit is read when a track is analysed or re-measured: changing it changes nothing already
  stored.
- On the BETA collection, read-only: all 17 tracks under 90 BPM doubled to 130–170 (the 14
  Rekordbox doubles among them, to its values within 0.02 BPM), and the two at 92–93 moved to
  138 and 140 by the two-thirds check.
