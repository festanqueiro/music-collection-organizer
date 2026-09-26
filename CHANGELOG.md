# Changelog

What changed in each MCO release. Releases are on the
[Releases page](https://github.com/festanqueiro/music-collection-organizer/releases);
installed copies update themselves.

## Unreleased

## 1.0.42 — 2026-09-26

### Fixed
- The Mac no longer goes to sleep while casting (which left the TV hanging);
  the display can still turn off.
- Opening another app on the TV (Plex, YouTube…) now ends casting, instead
  of MCO still showing "casting".
- MCO notices when a cast device stops responding (e.g. after the Mac
  slept) and stops casting, instead of hanging.

## 1.0.41 — 2026-09-26

### Added
- **Backup to an external disk** (Settings → Backups & data): copies the
  database, settings and every file in the collection folder to another
  disk, under `MCO Backup/`. Only new and changed files are copied after the
  first run, nothing is deleted from the backup, and a folder on the
  collection's own disk is refused.
- **Delete** in the track details: moves the file to the Trash after a
  confirmation. Restoring the file brings the track back with its tags.
- The file's **full path** at the bottom of the track details, with
  **Copy path** and **Show in Finder**.
- **Separate Tags and Subtags columns** in the track table.
- **Chips above the table** for the search, the selected folder and the
  Tags/Subtags selection, each with an × to clear it.
- The sidebar **reopens where you left it** (open folders, selected folder,
  view), and the folder tree has **Collapse all**.

### Fixed
- **Continuous play while casting** sometimes stopped at the end of a track
  instead of playing the next one in the queue.
- A new column appears next to the column it belongs with in a customised
  column order, not at the far end.

## 1.0.40 — 2026-09-26

### Added
- **Tag suggestions from filenames**: for fields a file leaves empty, the
  track details suggest Artist / Title / Album guessed from its filename
  (`Artist - Title`, Bandcamp's `Artist - Album - 03 Title`, vinyl sides,
  store ids, "Master" suffixes…). Nothing is written until you save.
- Files' own tags are now read for every track, not just analysed ones —
  most tracks now show their real title and artist.
- **Untagged** filter: tracks whose file has no artist tag.

### Fixed
- The tag editor could open empty for a track that hadn't been analysed, and
  saving would then have erased the title/artist already in the file.

## 1.0.39 — 2026-09-26

### Added
- **Edit ID3 tags** (title, artist, album, genre, year) in the track details,
  written into the file without re-encoding and without touching anything
  else in it (cover art, cue points, other apps' data). **Use tags** fills
  Genre with the track's Tags and Subtags.
- **Filters** view in the sidebar: Compatible (key and BPM with the playing
  track), Analysed / Not analysed, Duplicates.
- The sidebar can be **collapsed** to a strip of icons.
- The **FX screen scales up** to fill the window.

### Changed
- Much smoother app: FX knobs no longer redraw the whole app, the track table
  only draws the rows on screen (~120 fps instead of ~40), and the audio
  engines pause when nothing is playing (idle CPU ~12% → ~0%).
- The low-pass/high-pass filter no longer adds hiss and rumble at high
  resonance, and sweeps don't distort.

## 1.0.38 — 2026-09-26

### Added
- **Update Collection** asks first, and can analyse the new files it finds.
- The player bar keeps its layout when nothing is queued.

### Changed
- Player bar buttons ordered Cast, Visualizer, FX, Queue; the collection
  folder sits next to Update Collection.
- **Clear queue** keeps the track that's playing.
- The analysis progress bar moves while tracks are being analysed.

### Fixed
- Casting to **Nest speakers** hung on "connecting".
- Clicking the start of the waveform now seeks to 0:00.

## 1.0.37 — 2026-09-26

### Added
- **Themes**, a reworked **Settings**, tag colours, full-screen **Queue** and
  **FX** screens, and a Camelot key-compatibility check.
- A redesigned TV screen when casting, and the **Liquid** 3D visualizer.

## 1.0.35 — 2026-09-26

### Added
- **Cast** to Chromecast, Google TV and Nest speakers — on TVs, MCO's own Cast
  app plays with the effects, dub siren and visualizer.
- **Smoke**, **Kaleidoscope** and **Paint** visualizers.
- A CDJ-style **CUE** button (MIDI-mappable): hold to play, pausing sets the
  cue point.

## 1.0.28 — 2026-09-24

### Added
- **Auto-updates**, a watched collection folder, MP3/AAC/OGG support and DJ
  tools; the first macOS installer release.
- The **visualizer**, queue actions, MIDI settings, media keys / AirPods
  controls, AND/OR tag filtering, audio output device selection, EQ with
  ±24 dB, LP/HP filter knobs, tag colours and cover art.
