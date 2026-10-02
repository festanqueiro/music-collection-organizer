# Changelog

What changed in each MCO release. Releases are on the
[Releases page](https://github.com/festanqueiro/music-collection-organizer/releases);
installed copies update themselves.

## 1.0.53 — 2026-10-02

### Added
- **Hot cues A–H**: eight cue points per track, saved with it. Pads on a
  row under the player (and keys **1–8**) set a cue where the track is, or jump to it
  and play; **Shift-1–8** deletes one. Right-click a pad to name it, pick a
  colour or delete it. They're drawn on the waveform in their colours, can
  be mapped to your MIDI controller's pads (lit while set), and a **Cues**
  column shows how many a track has. Each of the eight pads has its own
  colour.
- **Drag hot cues** along the player's waveform to move them. While you
  drag, a zoom opens above with a detailed waveform of the bars around the
  cue, the bar and beat lines, the exact time, which bar and beat it's on,
  and how far it has moved. Hold **⌥** to move it finely, **Shift** to snap
  it to the beat, **Esc** to put it back; a click on a cue jumps there.
- **Suggested hot cues**: next to the pads, buttons for bars **16, 32, 48
  and 64** from the first beat (where most dance tracks change phrase),
  also shown as dashed lines on the waveform. Click one to put it on the
  first empty pad (or jump to it once it's set); right-click to choose the
  pad, A–H. Analysis now finds where the first beat is; songs analysed
  before get it the next time they play (until then the suggestions are
  marked ≈).
- **Your Rekordbox cues in MCO**: *Compare with Rekordbox* now compares cue
  points too, and **Bring Rekordbox's cues into MCO** copies them (hot cues,
  memory cues and loops, with their colours) for songs that have none in MCO.
- **Playlists** (first part): a **Playlists** box at the bottom of the
  sidebar, under Folders / Tags / Subtags / Filters. Make playlists and
  folders with **+**; click one to see its songs in the table, in the
  playlist's order (click a column to sort, *Playlist order* to go back).
  Add songs by dragging rows onto a playlist or with right-click → **Add to
  playlist…**; remove them with right-click → **Remove from…**. Right-click
  a playlist to **Play playlist** (replaces the queue — *Undo* brings the
  old one back), add it to the queue, rename it or **Delete** it (after a
  confirmation; the songs stay in your collection).
- **Playlists you already have**: importing from Rekordbox checks each
  playlist against MCO's — same name, or the same (or mostly the same)
  songs — and asks: skip it, import it as a new playlist, or update yours
  with Rekordbox's songs (it stays where it is, and later imports refresh
  it). Identical ones are skipped unless you say otherwise.
- **Import playlists from Rekordbox** (Playlists **+** → *Import from
  Rekordbox…*): pick one or more playlists exported from Rekordbox
  (right-click a playlist → *Export a playlist to a file* → **m3u8** is
  best, **Text** works too), or the whole collection exported from
  Rekordbox's **File → Export Collection in xml format** with all its
  folders. A summary shows how many songs were found before anything
  changes. They go in a **Rekordbox** folder; importing the same export
  again refreshes them. *Keep as my own* stops a playlist being refreshed.
- **Playlists**: drag playlists and folders inside the Playlists box — onto
  a folder to put them in it, onto the top or bottom edge of a row to place
  them before or after it, or below the tree to bring them to the top level.
- **Playlists → Rekordbox**: right-click a playlist → **Export for Rekordbox
  (m3u8)…** saves it as an .m3u8 with each song's file, which Rekordbox
  imports (File → Import → Import Playlist). Right-click a folder to export
  every playlist in it, one file each.
- **Playlists — editing songs**: while a playlist shows in its own order,
  drag rows up and down to reorder it (checked rows move together). **⌫**
  removes the selected song, or every checked one, from the playlist — with
  an *Undo* that puts them back in place; elsewhere ⌫ does nothing. Songs
  whose file is missing can now be removed too (right-click → *Remove
  from…*).
- **Playlists — finishing touches**: an **Add to playlist** button in the
  bar that appears when songs are checked; the playlists you added to last
  come first in *Add to playlist*; **F2** renames the selected playlist; a
  playlist icon in the collapsed sidebar opens it on the Playlists box;
  *Import from Rekordbox…* opens in the folder you last imported from.
- **Playlists from old Rekordbox USB sticks**: when an imported playlist
  lists a song at a path that isn't in your collection (the stick's, or a
  moved file), MCO looks for the same song in your collection — same file
  size, same title and artist, or the same (or shortened) file name — and
  lists each one under *Found at a different path* in the import summary to
  confirm. Confirmed songs are remembered for the next import.
- **Export to Rekordbox** (Settings → Import & export) now includes your
  playlists, in an **MCO Playlists** folder next to the tags' **MCO**
  folder, and your cue points.
- **Energy, LUFS and Volume Score columns**: each track's 1–10 energy
  (with a small bar), its loudness in LUFS, and its *Volume Score* — how
  many dB to turn it up or down to match the rest of your collection (its
  median loudness). Also in the track's details. Turn them on or off from
  the columns menu.
- **Energy filter** (Filters): pick a range — *Warm-up 1–4*, *Build 5–7*,
  *Peak 8–10*, or any from–to.
- **Why analysis failed**: a track whose analysis failed now says why (the
  file is gone, damaged, not fully downloaded…) in its red icon's tooltip
  and in its details, with **Try again**.
- **Compare with Rekordbox** (Settings → Import & export): reads the
  collection Rekordbox exports (File → Export Collection in xml format) and
  lists what differs from MCO — playlists (only in one, or different songs
  or order), titles, artists, albums, years, genres against your Tags, BPM
  and keys, Rekordbox's cue points, and files that are only in one or
  missing. Nothing is changed; applying differences comes next.

### Fixed
- The track menu said "Show in File Explorer" on the Mac; it's **Show in
  Finder** now (and *Show in File Explorer* on Windows), everywhere.

## 1.0.52 — 2026-10-01

### Added
- **Visualizer**: a new **Origins** theme — a flight through the dark past
  floating yellow spheres, a spiral of white spheres and squiggly sound
  waves, drawn like a grainy illustration. Its **Colours** can be *Dream*,
  *Candy*, *Noir* or *Shifting*. Key **9** picks it. It's also in the
  Screen menu for Show on a screen.
- **Stats**: the collection in numbers, from the new icon between Update
  Collection and Settings — songs, playtime, size, artists, albums and
  genres; file quality (lossless, lossy, low bitrate, not analysed) and
  formats; songs per tempo and per key; the top 10 genres and artists;
  years of release and songs added per month; how many are analysed,
  tagged, missing or only in iCloud. For the whole collection or one folder.
- **Table**: an **Add to queue** icon on every row, between play and
  pre-listen. It lights up while the song is waiting in the queue.

### Changed
- **Visualizer**: the *Liquid 3D* theme is now just called **Liquid**. If
  you had it picked, it stays picked, with its options.
- **Visualizer**: its controls moved to the bottom right, so they no longer
  cover a long track title. The frame rate picker shows the rate again
  ("30 fps", not just "fps").
- **Show on a screen**: the visualizer's track info no longer shows the BPM.

### Fixed
- **Show on a screen**: the **Now playing** screen showed only a huge MCO
  logo — its styles were blocked in the screen's window. It now shows the
  track's artwork, details, queue and waveform as intended.
- **Show on a screen**: visualizers stayed black (or white) on the screen,
  with only the track title showing. They draw again.

## 1.0.51 — 2026-09-28

### Added
- **Windows**: every release now has a Windows installer,
  `MCO-<version>-win-x64-setup.exe` (64-bit). It isn't signed, so Windows
  warns the first time (**More info → Run anyway**), and it doesn't update
  itself yet: install a new version over the old one. It's new and hasn't
  been tried on a Windows PC yet.
- **Show on a screen** can show the **Now playing** screen from casting —
  the track's artwork, details and stats, what's up next and the waveform —
  instead of a visualizer (Screen menu → Show). 1.0.50 listed this, but it
  was left out of that release by mistake.

## 1.0.50 — 2026-09-28

### Added
- **Show on a screen**: a **Screen** button in the player bar puts the
  visualizer, with the track info, full screen on another display — an
  Apple TV used as an AirPlay display, a projector or a monitor — or in a
  window, while you keep using MCO. The Mac draws it, so every theme runs
  smoothly.
- **Audio** button in the player bar: pick the main output and the
  headphones (pre-listen) output, each with its volume, like the Mic menu.
  The list updates when devices come and go.
- **Visual delay** (Settings → Audio, and in the Screen menu): holds the
  visuals back to line them up with sound that arrives late, like AirPlay
  to an Apple TV.

### Changed
- **Visualizer**: it now reacts to the Dub Siren too.

## 1.0.48 — 2026-09-28

### Added
- **Move tracks to a folder**: drag tracks onto a folder in the Folders view;
  MCO asks before moving the files there, and they keep their tags and play
  counts.
- **Tags view**: tags fold away like folders — a chevron shows or hides a
  tag's subtags, and **Collapse all** closes them.

### Changed
- The **Folders**, **Tags** and **Subtags** views line up: same margin,
  spacing and row height.

## 1.0.47 — 2026-09-27

### Added
- **Record**: a **Rec** button in the player bar records what MCO plays — the
  track with its effects, the dub siren and the mic — to a WAV, FLAC or MP3
  file (in `Music/MCO Recordings` unless you pick another folder). It keeps
  recording through pauses and track changes until you stop, and what's
  recorded is kept even if MCO quits. A level meter (left/right, with a clip
  light) and a **Level** knob show how loud the recording is and turn it
  down without changing what you hear. You can't cast while recording, or
  record while casting.
- **Mic**: a **Mic** button in the player bar (next to Rec and Cast) puts
  your voice in the mix and in recordings: on/off, the input, a level meter,
  **Talk** (tap to mute or unmute, hold while muted to talk, or the **T**
  key), **Hear myself** (off by default: you don't hear yourself through the
  speakers unless you turn it on) and optional **Noise suppression**. The
  mic is always off when MCO starts.
- **Mic FX**: the mic's own effects — Voice (gain, noise gate, compressor),
  EQ, **Pitch** (−12…+12 semitones, with a Mix to blend in your own voice),
  Echo (with Throw, BPM-synced), Reverb, a Radio voice, and Ducking that
  turns the music down while you talk. Everything can be MIDI-mapped.
- **Live** screen (the Live button in the player bar): the queue and all the
  effects on one screen, for running a show. The button is lit while the
  mic is on.
- **Visualizer**: a **Frame rate** picker in its top bar (15, 24, 30, 60 fps
  or Max).

### Changed
- **FX screen**: the effects are in three clearly separate groups —
  **Music FX**, **Mic FX** and **Instruments** (the Dub Siren) — in three
  equal columns on a wide window, and stacked on the Live screen. The FX
  button lights up for the mic's effects too.
- **Visualizer**: renders at 30 fps by default instead of the display's full
  refresh rate, so the GPU runs cooler.
- **App menu**: says **MCO** instead of `v1-library-organizer` in About, Hide
  and Quit.

### Fixed
- **Cast**: when MCO's queue empties, the TV goes back to its **Load a song
  to continue** screen instead of keeping the last track's title, year and
  seek bar up.

## 1.0.46 — 2026-09-27

### Added
- **Album** column in the track list (after Artist), sortable like the
  others.
- **Choose which columns to show**: click the columns icon at the top of
  the track list, or right-click any column header, and tick the ones you
  want.

### Changed
- The track list's play and headphones column now comes right after the
  checkbox, instead of before it, and is only as wide as its two icons.
- The analysing spinner shows only in the Status column, no longer also
  next to the title.

### Fixed
- Text typed into the Tag or Subtag box on one track no longer stays there
  when you select another track, where it looked like an assigned subtag
  even though the track had no tag.

## 1.0.45 — 2026-09-27

### Changed
- Folder names in the folder tree stay on one line; long ones end in "…"
  and show the full name when you hover them.
- The Mac and its screen no longer go to sleep while the visualizer is on.
- **Update Collection** now removes tracks whose file is gone (and their
  tags) instead of keeping them in Missing Tracks. Background rescans still
  only hide them, and nothing is removed if the folder looks empty (e.g. an
  unplugged drive).
- The play and headphones buttons now have their own fixed first column in
  the track list, instead of sitting in the Title column (which could be
  moved).
- The EQ is always on: its on/off switch and Mix knob are gone, and its
  Low, Mid and High knobs now sit next to the master Volume in one card,
  called EQ.

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
