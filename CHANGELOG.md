# Changelog

What changed in each MCO release. Releases are on the
[Releases page](https://github.com/festanqueiro/music-collection-organizer/releases);
installed copies update themselves.

## Unreleased

### Changed
- Folder names in the folder tree stay on one line; long ones end in "…"
  and show the full name when you hover them.
- The Mac and its screen no longer go to sleep while the visualizer is on.

- **Update Collection** now removes tracks whose file is gone (and their
  tags) instead of keeping them in Missing Tracks. Background rescans still
  only hide them, and nothing is removed if the folder looks empty (e.g. an
  unplugged drive).

### Fixed
- The volume slider (and other sliders/checkboxes) now use the theme's
  accent colour instead of macOS's system blue.

## 1.0.44 — 2026-09-27

### Added
- **Not Locally Available filter**: tracks that are only in the cloud, not
  downloaded to this Mac yet.
- **Missing Tracks filter**: lists the tracks whose file is no longer in
  the collection folder. Their tags are kept, and they come back if the
  file returns.

### Changed
- On the TV's now-playing screen, a song title that fits on one line is
  centred vertically in its space.

### Fixed
- Playing a track that was only in the cloud (e.g. a long AIFF on Google
  Drive) could freeze MCO for a long time, looking like a crash. It's now
  downloaded first, without freezing the app, and then played; the next
  few queued tracks are downloaded ahead of time.
- **Analyse** on a track that's only in the cloud now downloads it first,
  instead of silently skipping it.
- The "N missing" notice kept reappearing for the same files on every
  background rescan; it now appears only when files actually go missing.

## 1.0.43 — 2026-09-27

### Added
- **Selecting several tracks**: checked rows are highlighted like the
  selected one, the details panel steps aside, and
  right-clicking one of the checked tracks acts on all of them — **Add all to
  queue**, **Add all to top of the queue**, **Analyse all**, **Clear
  selection**.
- **MCO tags filter**: show tracks with **No Tags** or **No Subtags** yet.
- **TV visualizers** while casting: **Drift**, **Ripples** (rising from the bottom),
  **Mandala** and **Scope**, drawn without the GPU so they run
  smoothly on a Chromecast, their colours slowly shifting.
- **Pick what the TV shows in the Cast menu**: the track's details (now
  playing) or one of the TV visualizers. MCO's own visualizer is off while
  casting to a TV — its button says to use the Cast menu.
- A **project vault** in `docs/`: the feature guide, every design decision
  (ADRs), research notes, the roadmap and session write-ups.

### Changed
- The **Untagged** filter is now **Missing ID3 Metadata**, and also lists
  files that have an artist but no title.
- The TV's now-playing screen keeps every part in a fixed place — nothing
  moves when a track with more or less information loads — and its stats
  are easier to read.
- The visualizer's theme and its options are picked from dropdowns in one
  bar at the top right, instead of rows of buttons; the bar keeps its layout
  when you switch theme.

### Fixed
- The headphones (pre-listen) bar couldn't be closed, and its buttons did
  nothing, while a track was loaded in the player; reopening it stacked a
  second bar.
- The TV's now-playing screen no longer pushes the progress bar and times
  off the bottom of the screen; the song title is a little smaller.
- Casting ended by itself after a few minutes: Google TV's screensaver hid
  MCO's app, which then ended the session. The TV's screen is now kept awake
  during a session; if the TV does move on, MCO says why.
- The analysis progress bar covered right-click menus (and could cover
  Settings).
- Casting could drop with "The TV stopped responding" while the TV was
  fine and still playing, when MCO was busy for a while (e.g. scanning the
  collection).

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
