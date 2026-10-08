---
status: shipped
updated: 2026-10-08
adrs: []
---
# DJ tools

Helpers for preparing sets: finding tracks that mix, hearing the next one
in your headphones, and taking your tags to Rekordbox.

## Harmonic mixing

Keys are shown in **Camelot** notation ([the wheel](https://mixedinkey.com/wp-content/uploads/2024/09/CamelotWheel-Official.webp) most DJ
software uses): numbers 1–12 go round the circle of fifths, **A** is minor and
**B** is major, so A minor is **8A** and C major is **8B**. The Key
column shows a colour-coded badge, and neighbouring (compatible) keys get
neighbouring colours. Sorting by Key goes round the wheel.

**Settings → Appearance → Key notation** chooses Camelot (8A), musical (Am),
or both (8A · Am). The detail panel and queue follow the same setting.

### Compatible filter

With a track playing, **Compatible** (in the sidebar's [Filters](filters.md)
view) shows only tracks that mix with it:

- **key**: the same key, one step either way round the wheel (8A → 7A or
  9A), or the relative major/minor (8A ↔ 8B);
- **BPM**: within 6%, or half/double time (70 BPM mixes with 140).
  Tracks with no BPM yet aren't ruled out.

It combines with search, the folder tree, and tag filters, and shows as a
chip above the table (× switches it off).

Code: `src/state/harmonic.ts`, `src/components/TrackTable.tsx`. The
tests in `src/state/harmonic.test.ts` check every key's position and
compatible neighbours against Mixed In Key's official wheel.

### Similar tracks

The detail panel has a **Similar tracks** section for the selected track (playing or not):

- **Key**: tracks in the same key, or a compatible one (the same rule as the Compatible filter).
- **Tags**: tracks sharing a Tag or a Subtag with it.
- **BPM**: tracks at a tempo that mixes with it (within 6 %, or half/double time).
- Three switches in the section's header, **Key**, **Tags** and **BPM**, choose what counts
  (Key and Tags on by default, BPM off — a tempo alone matches a large part of a collection;
  all remembered); one is greyed out when the track has no key, tags or BPM yet. A track is
  listed when it matches on at least one of those that are on. With BPM off, the tempo still
  breaks ties and still shows bright on a row when it mixes.
- Best first: 3 points per shared Subtag, 2 per shared Tag, 3 for the same key, 2 for a
  compatible one, 1 for a tempo that mixes (within 6 %, or half/double time). Ties go to the
  closer tempo, then the title.
- Each row: title and artist (click to show that track's details), then the table row's
  actions — **play now** (play/pause on the loaded track), **add to queue**, **pre-listen**
  in the headphones, **add to playlist…** — and under it the key badge (coloured when it
  mixes), the BPM (bright when the tempo mixes) and the tags it shares.
- Eight rows, then **Show more**. The section collapses with the arrow by its name (remembered).

How it works: `findSimilarTracks` (`src/state/similarTracks.ts`) is one pass over the tracks
already in the store — no index, no database query — memoised on the selected track, the track
list and the tags, and skipped while the section is collapsed. Only the rows shown are rendered.

## Refine BPM

The analysis can be an octave out (85 for 170), or report two thirds of the tempo on broken
beats (108 for 162). Right-click a track → **Refine BPM…** (with several rows checked, **Refine BPM
of all…**) ([ADR 0064](../adr/0064-bpm-two-thirds-and-set-by-hand.md)):

- **Double**, **Halve**, **Two-thirds fix (× 1.5)** — for one track each shows what it gives
  (`≈ 159.87`). The result is then sharpened on the track's audio near that value, so 106.58 × 1.5
  becomes 160; if the audio doesn't agree within 3.5 % the plain product is kept.
- **Measure it again** — the tempo part of the analysis alone, from the stored BPM: sharpened,
  moved to 1.5× when two thirds was stored, doubled when below the slowest tempo (Settings →
  Library, [ADR 0066](../adr/0066-half-time-is-a-slowest-tempo.md)). About a second a track, and
  the result stays the analysis's own. This is how tracks analysed before these rules are fixed
  without a full re-analysis; a BPM set by hand is left alone (*Detect it again* first).
- **Set the BPM…** — type it (a comma works as the decimal point); taken as typed, to two decimals.
- A batch is measured in a worker thread, one track at a time (`createTempoMeasurer` in
  `analysis/queue.ts`), so the window stays usable; a toast counts *Refining the BPM: 3 of 40…*.
- 30 to 300 BPM; anything else is refused with a message. A track with no BPM yet can only be set.
- A BPM changed this way is **yours**: the menu's header says *set by you*, and analysing the
  track again updates everything else but keeps it. **Detect it again** (shown for such tracks)
  forgets it and re-analyses.
- The bar counter, the suggested cues, the Compatible filter's tempo match and the Rekordbox
  export all use the new BPM at once. The analysed first beat isn't moved.

How it works: `changeTrackBpm` (`electron/main/bpmEdit.ts`), IPC `tracks:changeBpm` (returns the
tracks as they are now), `tracks.bpm_edited`; `refineBpm(…, threeHalves = false)` does the
sharpening. UI: `src/components/RefineBpmMenu.tsx`, opened from `TrackTable`'s menus.

The analysis itself now catches the two-thirds case in most tracks, and doubles a tempo below
the **slowest tempo** (90 BPM unless changed) — half time
([measurements](../research/bpm-accuracy.md)). For the tracks already analysed, the **Slow BPM**
filter ([Filters](filters.md)) lists the ones below it: check them, right-click → *Refine BPM of
all…* → *Measure it again* or *Double*.

## Headphone pre-listen (cue)

Audition a track in your headphones while the main output keeps playing.

1. Pick the headphone output in **Settings → Audio → Cue output
   (headphones)**: your headphones, or a second output on your audio
   interface.
2. Click the **headphones icon** on a track row, choose **Pre-listen in
   headphones** from its right-click menu, or press **P** with the row
   selected.

A slim bar above the player shows the cued track with play/pause, a seek
slider, its own volume, and **×** to stop. Doing the same action on the
cued track stops it too. Pre-listen skips the FX, and it doesn't touch
the queue or the main player. If the cue device is unplugged, it falls
back to the default output.

Code: `src/components/CuePlayer.tsx`.

## Export to Rekordbox

**Settings → Import & export → Rekordbox → Export to Rekordbox…** writes an XML
file Rekordbox can read:

- every track (title, artist, album, genre tag, BPM, key, duration, date
  added), with your MCO tags in the Comments field;
- an **MCO** playlist folder with one playlist per genre. A genre with
  sub-genres becomes a folder holding "*Genre* (all)" plus one playlist
  per sub-genre;
- an **MCO Playlists** folder with your playlists, in their folders and
  order (playlists imported from Rekordbox are left out — see
  [Playlists](playlists.md)).

To use it in Rekordbox, go to **Preferences → Advanced → Database →
rekordbox xml** and choose the file. It then appears under "rekordbox
xml" in the sidebar, where you can import playlists. The export is
one-way and never changes your files or your Rekordbox library. Beat
grids and cue points aren't included: Rekordbox analyses those itself.

**Compare with Rekordbox…** (same place) reads Rekordbox's collection export and lists what
differs — playlists, music info, cue points, files — without changing anything. Applying them, both
ways, is next: [Rekordbox sync](rekordbox-sync.md).

Code: `electron/main/rekordboxExport.ts`.

## Tests
- `bpmEdit.test.ts`: factors sharpened on the audio, the plain product when the audio says nothing
  or something far off, a typed BPM, refusals, detect. `tempoRefine.test.ts`: 160 and 170 found
  from two thirds of them on a broken beat, real 108 and 128 left alone, nothing past 200.
  In the built app (Playwright, demo library): halve → 70, double → 140, set, refuse, detect, and
  the menu from a row's right-click.
- `similarTracks.test.ts`: tempo alone (BPM on, off, no BPM on the track); key matches and nothing else, shared Tags/Subtags, the ranking and its
  tempo tie-break, key-only / tags-only, a track with nothing to go on.
- `src/state/harmonic.test.ts` (every key against Mixed In Key's wheel),
  `electron/main/rekordboxExport.test.ts`.
