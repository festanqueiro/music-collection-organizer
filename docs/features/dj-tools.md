# DJ tools

Helpers for preparing sets: finding tracks that mix, hearing the next one
in your headphones, cleaning up duplicates, and taking your tags to
Rekordbox.

## Harmonic mixing

Keys are shown in **Camelot** notation ([the wheel](https://mixedinkey.com/wp-content/uploads/2024/09/CamelotWheel-Official.webp) most DJ
software uses): numbers 1–12 go round the circle of fifths, **A** is minor and
**B** is major, so A minor is **8A** and C major is **8B**. The Key
column shows a colour-coded badge, and neighbouring (compatible) keys get
neighbouring colours. Sorting by Key goes round the wheel.

**Settings → Appearance → Key notation** chooses Camelot (8A), musical (Am),
or both (8A · Am). The detail panel and queue follow the same setting.

### Compatible filter

With a track playing, **Compatible** (above the table) shows only tracks
that mix with it:

- **key**: the same key, one step either way round the wheel (8A → 7A or
  9A), or the relative major/minor (8A ↔ 8B);
- **BPM**: within 6%, or half/double time (70 BPM mixes with 140).
  Tracks with no BPM yet aren't ruled out.

It combines with search, the folder tree, and tag filters. Click it
again to switch it off.

Code: `src/state/harmonic.ts`, `src/components/TrackTable.tsx`. The
tests in `src/state/harmonic.test.ts` check every key's position and
compatible neighbours against Mixed In Key's official wheel.

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

## Duplicate finder

The **Duplicates** tab in the left panel lists groups of likely
duplicates: the same recording saved twice, for example as WAV and MP3,
or as two downloads. Tracks count as duplicates when their durations are
within a second of each other and either:

- their title and artist match (ignoring case, accents, and
  punctuation), or
- their filenames match (ignoring track-number prefixes and the
  extension).

Different mixes stay separate, e.g. "(Dub Mix)" vs "(Vocal Mix)".

The table shows all duplicates, or one group when you click it. For each
copy you see its format, size, duration, and tag count, plus a **Show in
Finder** button. **Merge tags** gives every copy in the group all the
group's tags, so nothing is lost whichever copy you keep. MCO never
deletes files: remove the copy you don't want in Finder, then click
**Update Collection**.

Code: `src/state/duplicates.ts`, `src/components/DuplicatesPanel.tsx`.

## Export to Rekordbox

**Settings → Import & export → Rekordbox → Export to Rekordbox…** writes an XML
file Rekordbox can read:

- every track (title, artist, album, genre tag, BPM, key, duration, date
  added), with your MCO tags in the Comments field;
- an **MCO** playlist folder with one playlist per genre. A genre with
  sub-genres becomes a folder holding "*Genre* (all)" plus one playlist
  per sub-genre.

To use it in Rekordbox, go to **Preferences → Advanced → Database →
rekordbox xml** and choose the file. It then appears under "rekordbox
xml" in the sidebar, where you can import playlists. The export is
one-way and never changes your files or your Rekordbox library. Beat
grids and cue points aren't included: Rekordbox analyses those itself.

Code: `electron/main/rekordboxExport.ts`.
