# Ideas

Improvements worth building next, in priority order: roughly the most
useful per unit of effort first. Each has a short "how", so it can be
picked up directly. Known bugs and small UX fixes live in `TODO.md`.

Effort: **S** = a day or less, **M** = a few days, **L** = a week or more.

---

## 1. Smart crates and saved playlists (M)

**Why:** the queue is temporary. DJs build lists for a set and want
"all Dub at 70–75 BPM in A minor" to stay current as the library grows.

**How:**

- **Crates** are named, ordered track lists stored in new
  `crates`/`crate_tracks` tables.
- **Smart crates** are saved filter rules (tags AND/OR, BPM range, key,
  format, date added), evaluated with the same predicate code the table
  filter already uses.
- They show in a new left-panel tab. They'd also feed the Rekordbox
  export.

## 2. Portable library: relative paths (M)

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

## 3. Hot cues and loops (L)

**Why:** marking the drop, the breakdown, or the intro loop is core set
prep. It builds on the Rekordbox export, since Rekordbox XML can carry
cue points.

**How:**

- Up to 8 cue points per track in a `track_cues` table, shown as
  markers on the waveform.
- Set and jump with the number keys or MIDI pads (new
  `player.cueN` MIDI controls).
- Add a zoomable waveform in the expanded player view.
- Loops come later as in/out pairs.

---

## Done

- **Auto-updater** — a custom GitHub Releases updater (see
  `docs/features/settings-and-data.md#automatic-updates`).
- **Export to Rekordbox**, **harmonic mixing helpers**, and **headphone
  pre-listen** — see `docs/features/dj-tools.md`. (A duplicate finder was
  added and later removed.)
- **MP3, M4A/AAC, and OGG/Opus support**, with a Bitrate column.
- **Watch folder / auto-import** — see
  `docs/features/library.md#watching-the-folder`.

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
