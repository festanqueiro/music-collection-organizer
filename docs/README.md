---
updated: 2026-09-26
---
# MCO vault

The project's memory: what MCO is, what it does, why it's built the way it is, what went wrong along
the way, and what comes next. Written for both people and AI agents. Plain Markdown with relative
links, so it reads on GitHub and opens as an [Obsidian](https://obsidian.md) vault. The layout follows
[GLUE's vault](https://github.com/joaopmanso/glue/tree/main/vault) ([ADR 0001](adr/0001-record-decisions-in-docs.md)).

## Start here
- [Vision](product/vision.md): what MCO is for and the principles it keeps.
- [Roadmap](product/roadmap.md): shipped, in progress, next; known issues.
- [Glossary](product/glossary.md): the words we use (collection, Tags/Subtags, cue, receiver…).
- [Changelog](../CHANGELOG.md): what changed in each release, newest first.
- [Latest session](log/2026-09-26-session.md): what was built on 2026-09-26 and the issues faced.

## Sections
| Folder | Holds | One file per |
|---|---|---|
| [product/](product/) | vision, roadmap, glossary, release install notes | topic |
| [features/](features/) | what each feature does, how it works, how it's tested, its limits | feature |
| [adr/](adr/) | architecture decision records: context, decision, alternatives, consequences | decision |
| [research/](research/) | measured and sourced findings (Cast devices, file tags, performance) | subject |
| [log/](log/) | changelog pointer, session write-ups, history, the original design specs and plans | session / document |

## Conventions
- **Status** (front matter `status:`): features `idea` · `planned` · `in-progress` · `shipped` ·
  `superseded`; ADRs `proposed` · `accepted` · `superseded by NNNN` · `deprecated`.
- **Features** follow [features/_template.md](features/_template.md), named by slug
  (`casting.md`), and list the ADRs that shaped them (`adrs:`).
- **ADRs** follow [adr/_template.md](adr/_template.md), numbered `NNNN-slug.md` and never renumbered. A
  changed decision gets a new ADR that supersedes the old one; the old one stays.
- **Research** says how something was measured and marks anything unverified as **[UNVERIFIED]**.
- Dates are absolute (`2026-09-26`), never "last week".
- Every change updates its feature page, the [changelog](../CHANGELOG.md), and the roadmap if a
  milestone moves; every new architectural choice gets an ADR; a working session with notable findings
  gets a `log/` write-up. (Also in [CLAUDE.md](../CLAUDE.md).)
- The files in `log/` dated 2026-08-20/21 are the original design specs and implementation plans —
  historical; the code has moved on.

## Feature index
[Library](features/library.md) (folder, scanning, tag reading, analysis, sidebar, table, details, delete) ·
[Filters](features/filters.md) ·
[Tags](features/tags.md) ·
[ID3 tags](features/id3-tags.md) (editing, filename suggestions) ·
[Player](features/player.md) ·
[Queue](features/queue.md) ·
[FX](features/fx.md) ·
[MIDI](features/midi.md) ·
[DJ tools](features/dj-tools.md) (Camelot, Compatible, pre-listen, Rekordbox export) ·
[Visualizer](features/visualizer.md) ·
[Casting](features/casting.md) ·
[Settings & data](features/settings-and-data.md) (data location, backups, external-disk backup, updates) ·
[Releases & updates](features/releases-and-updates.md)

## ADR index
| # | Decision | Status |
|---|---|---|
| [0001](adr/0001-record-decisions-in-docs.md) | Record decisions, features and findings in `docs/` | accepted |
| [0002](adr/0002-electron-react-typescript.md) | Build MCO as an Electron + React + TypeScript desktop app, macOS only | accepted |
| [0003](adr/0003-node-sqlite.md) | Use Node's built-in `node:sqlite` for the database | accepted |
| [0004](adr/0004-never-delete-track-rows.md) | Never delete track rows on a scan; hide missing files instead | accepted |
| [0005](adr/0005-cloud-only-detection.md) | Detect cloud-only files from allocated blocks vs size | accepted |
| [0006](adr/0006-analysis-in-worker-threads.md) | Analyse audio with essentia.js (WASM) and ffmpeg in a pool of worker threads | accepted |
| [0007](adr/0007-config-separate-from-database.md) | Keep settings in `electron-store`, separate from the collection database | accepted |
| [0008](adr/0008-tags-live-in-the-database.md) | MCO's tags live in the database; batch writes are additive; IPC returns post-write state | accepted |
| [0009](adr/0009-data-folder-inside-collection.md) | Move the database and settings into a `.mco` folder inside the collection | accepted |
| [0010](adr/0010-aiff-playback-via-flac-cache.md) | Play AIFF through a cached lossless FLAC transcode | accepted |
| [0011](adr/0011-daily-database-backups.md) | Back up the database and settings daily with `VACUUM INTO` | accepted |
| [0012](adr/0012-fifo-queue.md) | A FIFO play queue whose head is the current track — no saved playlists yet | accepted |
| [0013](adr/0013-github-releases-updater-ad-hoc-signing.md) | Ad-hoc signed releases and a custom GitHub Releases updater | accepted |
| [0014](adr/0014-visualizers-in-their-own-package.md) | Visualizer themes live in the `threejs-visualisers` package, pinned by tag | accepted |
| [0015](adr/0015-cast-by-streaming-live-output.md) | Cast by streaming MCO's live output to Google's Default Media Receiver | superseded by 0016 and 0017 |
| [0016](adr/0016-cast-direct-mode.md) | The Cast device plays each track file itself; MCO's player is its remote | accepted |
| [0017](adr/0017-own-cast-receiver-app.md) | MCO's own Cast receiver app runs the effects, siren and visualizer on the TV | accepted |
| [0018](adr/0018-ci-bump-and-deploy-on-every-merge.md) | Every merge to `main` bumps the version and deploys the Cast receiver | accepted |
| [0019](adr/0019-no-airplay.md) | No AirPlay; Cast is the way to play on other devices | accepted |
| [0020](adr/0020-speakers-use-default-media-receiver.md) | Audio-only Cast devices go straight to Google's Default Media Receiver | accepted |
| [0021](adr/0021-advance-queue-on-device-finished.md) | While casting, the device finishing a track moves the queue on | accepted |
| [0022](adr/0022-cast-session-lifetime.md) | A cast session keeps the Mac awake, ends when the TV moves on, and dies on missed heartbeats | accepted |
| [0023](adr/0023-fx-settings-outside-react.md) | FX settings reach the audio engines through store subscriptions, not React state | accepted |
| [0024](adr/0024-virtualised-track-table.md) | Render only the visible rows of the track table, at a fixed row height | accepted |
| [0025](adr/0025-suspend-idle-audio-engines.md) | Suspend the audio engines when nothing is playing | accepted |
| [0026](adr/0026-write-tags-byte-for-byte.md) | Write file tags by editing bytes in place — never re-encode, never rebuild the tag | accepted |
| [0027](adr/0027-read-file-tags-in-background.md) | Read every file's tags in the background, not only during analysis | accepted |
| [0028](adr/0028-suggest-never-auto-write-file-tags.md) | Tag changes to files are suggested, never saved automatically | accepted |
| [0029](adr/0029-filter-resonance-fades-in.md) | Filter resonance fades in as a stage closes, with level compensation | accepted |
| [0030](adr/0030-filters-combine-with-sidebar-views.md) | Filters are a sidebar view that combines with the folder/tag selection; Tags stay their own views | accepted |
| [0031](adr/0031-delete-moves-to-trash.md) | Deleting a track moves its file to the Trash and hides its row | accepted |
| [0032](adr/0032-duplicates-by-normalised-names.md) | Duplicates: same normalised artist + title, else same normalised filename | accepted |
| [0033](adr/0033-external-backup-to-another-disk.md) | Back up the collection to a folder on another disk, incrementally, never deleting | accepted |
| [0034](adr/0034-fx-screen-fits-the-window.md) | The FX screen scales to fill the window with CSS zoom | accepted |
| [0035](adr/0035-changelog-labelled-in-the-feature-pr.md) | Keep a CHANGELOG, and label its section with the version inside the feature PR | accepted |

## Keyboard shortcuts
| Key | Where | Action |
| --- | --- | --- |
| Space | anywhere (not while typing) | Play/pause |
| → | anywhere (not while typing) | Play the next queued track |
| C (hold) | anywhere | CUE |
| ↑ / ↓ | track table | Move the selected row |
| Home / End | track table | First / last visible row |
| Page Up / Page Down | track table | Jump a page of rows |
| Shift-click | track table rows / checkboxes | Check a range of tracks |
| P | track table | Pre-listen to the selected track in the headphones (again to stop) |
| S (hold) | anywhere | Fire the Dub Siren (when it's on and Beat is Off) |
| Esc | visualizer, dialogs, tag editor | Close / cancel |
| 1–8 | visualizer | Switch theme |
