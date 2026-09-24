# Ideas

Ten improvements worth building next, in priority order: roughly the
most useful per unit of effort first. Each has a short "how", so it can
be picked up directly. Known bugs and small UX fixes live in `TODO.md`.

Effort: **S** = a day or less, **M** = a few days, **L** = a week or more.

---

## 1. Auto-updater (M)

**Why:** releases are manual downloads today, so people stay on old
versions and miss fixes.

**How:** the usual tool, `electron-updater`, **won't work here**. On
macOS it validates each update's code signature against the running
app's, and ad-hoc signatures (see `docs/releasing.md`) don't carry a
stable identity, so every update would be rejected. A small custom
updater fits better:

- On launch (and daily), fetch
  `https://api.github.com/repos/festanqueiro/music-collection-organizer/releases/latest`
  and compare its tag with `app.getVersion()`.
- If newer, show a non-blocking "MCO 1.0.x is available" banner with
  **Update**, **Release notes**, and **Later**.
- **Update** downloads `MCO-<version>-arm64.zip` in the main process,
  unzips it with `ditto -x -k` next to the current app, swaps the `.app`
  bundles, and relaunches. The first attempt should be copying into a
  temp dir, verifying with `codesign --verify`, then renaming.
- A file downloaded by the app itself (Node `https`) doesn't get the
  quarantine flag, so the update opens **without** the Gatekeeper
  "Open Anyway" step. Only the very first install needs it.
- Fall back to opening the release page if the app can't write to its
  own location (e.g. installed in `/Applications` by another user).
- Settings → General: "Check for updates automatically" toggle and a
  "Check now" button.

## 2. Export to Rekordbox (M)

**Why:** DJs prepare in a library tool but play on CDJs or Rekordbox.
Today MCO's tags stay inside MCO.

**How:** Rekordbox imports a documented XML format (`DJ_PLAYLISTS`). Export
every track with BPM, key, and genre, and turn each genre and sub-genre
into a playlist folder, so the tag tree shows up in Rekordbox as
playlists. It's one-way and read-only for Rekordbox, so there's no risk
to either library. Later: Traktor NML and Serato crates the same way.

## 3. Smart crates and saved playlists (M)

**Why:** the queue is temporary. DJs build lists for a set and want
"all Dub at 70–75 BPM in A minor" to stay current as the library grows.

**How:**

- **Crates** are named, ordered track lists stored in new
  `crates`/`crate_tracks` tables.
- **Smart crates** are saved filter rules (tags AND/OR, BPM range, key,
  format, date added), evaluated with the same predicate code the table
  filter already uses.
- They show in a new left-panel tab. They'd also feed the Rekordbox
  export (#2).

## 4. Harmonic mixing helpers (S–M)

**Why:** key is already analysed but shown as plain text ("A minor"),
and there's nothing to help pick the next track.

**How:**

- Show keys in Camelot notation (8A) as well as, or instead of, the key
  name, with a Settings choice.
- Colour the key column by Camelot position.
- Add a "Compatible with playing track" filter: same key, ±1 on the
  wheel, or relative major/minor, plus BPM within ±6%.
- Pure functions, easy to unit-test.

## 5. Portable library: relative paths (M)

**Why:** tracks are stored by absolute path, so moving the collection
to another drive or Mac makes every track look new and its tags are
effectively lost (see `TODO.md`). The `.mco` folder is designed to
travel with the music, but the paths inside it don't.

**How:**

- Store paths relative to the collection folder in a new column.
- Migrate existing rows once.
- Resolve relative paths against the current folder everywhere a path
  is used (media protocol, analysis, drag, reveal).
- Tag export/import should use relative paths too.

## 6. Headphone pre-listen (cue output) (M)

**Why:** a DJ tool should let you audition the next track in
headphones while the main output keeps playing.

**How:**

- Add a second, lightweight preview player (no FX) with its own output
  device, reusing the existing `setSinkId` plumbing.
- Holding a key or clicking a row's "preview" icon plays that track on
  the cue device.
- Add a "Cue output" picker to Settings → Audio.

## 7. Hot cues and loops (L)

**Why:** marking the drop, the breakdown, or the intro loop is core set
prep. It pairs with #2, since Rekordbox XML can carry cue points.

**How:**

- Up to 8 cue points per track in a `track_cues` table, shown as
  markers on the waveform.
- Set and jump with the number keys or MIDI pads (new
  `player.cueN` MIDI controls).
- Add a zoomable waveform in the expanded player view.
- Loops come later as in/out pairs.

## 8. AAC / M4A / OGG support (S)

**Why:** MP3 is supported now, but some collections also have AAC/M4A
(iTunes/Apple Music purchases, Bandcamp downloads) and OGG files. The
rest of the pipeline (ffmpeg decode, `music-metadata`, and the
`media://` MIME map) already handles them.

**How:** add `.m4a`, `.aac`, and `.ogg` to `AUDIO_EXTENSIONS` in
`electron/main/folderWalk.ts`, then add fixture-based tests like the MP3
ones: decode, and full analysis including tags. Also show a bitrate
column, so low-quality lossy files stand out.

## 9. Duplicate finder (M)

**Why:** big collections collect the same track as WAV and MP3, or as
two downloads with different filenames.

**How:**

- **First pass:** group by normalized title + artist and duration
  within ±1 s.
- **Second pass:** compare an audio fingerprint of a short PCM excerpt
  (computed during analysis, e.g. chroma or Chromaprint) to catch
  mistagged files.
- Show a "Duplicates" view that lets you choose which copy keeps the
  tags. Never delete files from MCO; offer "Show in Finder" instead.

## 10. Watch folder / auto-import (S–M)

**Why:** after downloading new music you have to remember to click
"Update Collection".

**How:**

- Watch the collection folder with `fs.watch` (recursive on macOS), and
  debounce changes into a background scan.
- Show a toast with "12 new tracks" and optionally auto-analyse them.
- Keep it behind a Settings toggle, since external drives and cloud
  folders can produce noisy events.

---

## Backlog (not prioritized)

- **Multiple collection folders** — one at a time today.
- **Fuller DJ mixing/deck features** — the player is a single deck with a
  queue and FX, not a two-deck mixing surface.
- **Intel build** — releases are arm64-only; `ffmpeg-static` needs an
  Intel runner to fetch the right binary. Another option is a universal
  build with a lipo'd ffmpeg.
- **Windows/Linux support** — the cloud-only detection heuristic is tuned
  to APFS/Google Drive for Desktop on macOS and would need revisiting.
- **Write tags back to files** (opt-in) — genre/comment frames, so other
  apps see MCO's tags. Risky, so it needs backups and a dry-run preview.
- **React component tests** — no `@testing-library/react` yet; UI is
  verified by hand.
- **Crash/error log** — a "Copy diagnostics" button in Settings (app
  version, recent main-process errors) to make bug reports useful.
