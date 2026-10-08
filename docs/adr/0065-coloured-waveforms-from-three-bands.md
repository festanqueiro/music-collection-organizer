---
status: accepted
date: 2026-10-08
---
# 0065. Coloured waveforms from three bands, kept per track and filled in on demand

## Context
The player's waveform was one colour. DJ software draws it in a few well-known ways; the three
that keep coming up:

- **one colour** (Pioneer's classic "Blue");
- **coloured by frequency** — Serato's documentation: red for low-frequency bass, green for
  mids, blue for treble; djay describes its RGB the same way, and Rekordbox has an RGB mode;
- **three bands over each other** — Rekordbox 6's 3-Band; forum descriptions give blue for bass,
  orange for mids, white for highs (Denon: blue / green / white). Not confirmed from an official
  Pioneer page.

MCO's stored waveform is 800 peak amplitudes per track ([ADR 0058](0058-waveforms-read-per-track.md)):
nothing in it says what frequencies a slice holds.

## Decision
- **Three styles**, chosen in Settings → Appearance: Classic (unchanged), RGB, 3-band (blue,
  orange, white).
- **A second waveform in three bands**, slice for slice with the first: each slice's peak below
  200 Hz, between 200 Hz and 4 kHz, and above (`computeWaveformBands`, two one-pole filters in a
  row per cut). Stored as JSON in `tracks.waveform_bands`, read per track
  (`tracks:getWaveformBands`), never with the track list.
- **Filled in on demand**: analysis writes it from now on; for a track analysed before, it is
  worked out the first time it's asked for — decoded at 22.05 kHz, which is enough for those
  cuts — and kept. Nobody has to re-analyse a collection to see colours.
- Only asked for when a coloured style is chosen. Until it arrives the waveform is drawn Classic.
- The coloured bars are built once per track and style; what hasn't played yet is a shade over
  them, so playback moves one rectangle instead of repainting 800 or 2,400.
- Mids are lifted 1.2× and highs 2.4× for display, since they are quieter than bass in most music.
- **Bar lines** are drawn over every style from the grid the bar counter uses, thinned to at most
  128 lines.

## Alternatives considered
- **An FFT per slice**: truer colours, several times the work, and the difference is not visible
  at 800 slices.
- **Colours only, no band data** (a palette for the single-colour waveform): three looks that say
  nothing about the music.
- **Compute the bands in the renderer from the audio element**: only what has played would be
  coloured.
- **Require a re-analysis**: hours for a collection, for a display option.

## Consequences
- `tracks.waveform_bands` adds about 8 kB of JSON per track that has it.
- The first load of an older track with a coloured style decodes the file once in the main
  process (88 ms on a 48 s demo track; a full-length track takes longer — not measured).
- The second screen and the Cast receiver still draw their own single-colour waveform.
- The 3-band colours follow forum descriptions of Rekordbox's, not a published specification.
