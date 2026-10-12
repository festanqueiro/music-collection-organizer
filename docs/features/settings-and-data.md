---
status: shipped
updated: 2026-10-12
adrs: [0007, 0009, 0011, 0013, 0033, 0069, 0071]
---
# Settings & data

Open **Settings** from the toolbar. Its pages are listed down the left
(it reopens on the last one you used; **Esc** closes it):

| Page | What's there |
| --- | --- |
| **Library** | Collection folder (Change…); watch for new and removed files; analyse new tracks automatically |
| **Appearance** | Theme; key notation |
| **Audio** | Main output device; cue output (headphones) |
| **MIDI** | Show MIDI mapping buttons; export, import or reset all bindings |
| **Import & export** | Tag data (export/import); Export to Rekordbox |
| **Backups & data** | Database & settings location (Change…); backups and **Back up now**; restore |
| **Updates** | Version; check automatically; **Check now** |

Code: `src/components/SettingsModal.tsx` (the sidebar) and one file per
page in `src/components/settings/`.

## Themes

**Settings → Appearance → Theme** picks the app's colours: three dark themes
(**MCO Dark**, the default; **Midnight**, indigo; **Carbon**, black and
orange) and three light (**MCO Light**, teal; **Paper**, warm cream and
rust; **Arctic**, cool white and blue). It applies straight away and is
remembered with the rest of the settings. The visualizer stays dark in
every theme, and the TV's Cast screen keeps its own design.

Palettes: `src/themes.css` (one block of `--color-*` variables per
theme); the list: `src/appThemes.ts`.

## Where data lives

MCO stores:

- `collection.db` — the SQLite database (tracks, analysis results, tags);
- `config.json` — collection folder, FX and MIDI settings, table column
  order and sort, audio output device, theme.

Both start in the app's userData folder
(`~/Library/Application Support/<app name>/`). The first time you pick a
collection folder they move into a hidden `.mco` folder inside it, so the
music and its data can travel together. **Database & settings → Change…**
moves them anywhere else. A move copies (never deletes) the old files, and
if the destination already has a `collection.db` that one is adopted
instead of overwritten. The app relaunches after a move.

Tracks are stored by absolute path, but a collection that moved — another
computer, another drive, a renamed folder — keeps its tracks: the scan finds
each one at its new place, with its analysis, cues, tags and playlists
([ADR 0071](../adr/0071-a-moved-collection-keeps-its-tracks.md)). Copy the
collection folder with its `.mco` folder, and pick it in MCO.

A few view preferences (visualizer theme and options, whether MIDI badges
are shown) are kept in the window's local storage instead.

The BETA build (`npm run dist:beta`) uses its own userData folder, so its
data is separate from production.

## Backups

- **Automatic**: once a day (checked at launch and hourly), MCO snapshots
  the database (`VACUUM INTO`) and the config file into
  `<userData>/backups/`. The last 30 are kept. "Today's backup" is this computer's own newest
  one: with the data folder in a synced folder, each computer takes its own.
- **Back up now** makes an extra snapshot immediately.
- The Backups tab shows when the last backup ran and the error, if the
  last one failed.
- **Restore** replaces the database and settings with a chosen snapshot
  and relaunches the app. First the snapshot is opened and checked (a damaged one is refused,
  nothing changed), and the collection as it is now is kept beside the backups as
  `before-restore-<time>.db`/`.json` (the last three; not in the list — copy one over
  `collection.db` by hand to go back). Each file is copied next to its target and renamed over it,
  so a copy that fails leaves the collection whole.
- **Moving the data folder** copies each file under another name and renames it when whole: a move
  that fails half way leaves nothing the next attempt would take for existing data, and the data
  stays where it was.
- **Open on another computer**: with the data folder in a synced folder, MCO warns at launch when
  another computer seems to have the collection open
  ([ADR 0069](../adr/0069-warn-when-open-on-another-computer.md)) — a hint, not a lock.

## Backup to an external disk

**Settings → Backups & data → Backup to an external disk** copies the
database, settings and every file in the collection folder to a folder on
another disk, under `MCO Backup/` ([ADR 0033](../adr/0033-external-backup-to-another-disk.md)):

- **Choose disk…** refuses a folder on the collection's own disk (your
  Google Drive folder is on the Mac's internal disk, so anywhere on the Mac
  is refused), inside the collection, or not writable; a disk that isn't
  connected shows as such.
- **Back up now** snapshots the database and settings (the last 10 are
  kept in `MCO Backup/Database/`) and copies the collection's files into
  `MCO Backup/Files/`, keeping folders and modification times. Hidden files
  and the `.mco` folder are skipped.
- Later runs copy only new and changed files (size and modification time),
  and **nothing is ever deleted** from the backup.
- Cloud-only files are skipped and counted — download them to back them up.
- It checks there's enough free space first, shows progress, and can be
  stopped; an interrupted copy is never mistaken for a finished one.
- The last run's summary (copied, already up to date, skipped, failed) is
  shown.

Code: `src/components/SettingsModal.tsx`, `src/components/settings/DataPage.tsx`,
`electron/main/config.ts`, `bootstrap.ts`, `dataMigration.ts`, `backup.ts`,
`externalBackup.ts`.

## When MCO can't start
If the database or the settings file can't be opened (a damaged file, a drive that isn't
connected), a message says what failed and where the data is, instead of no window. If the data
folder was moved and has no `collection.db` in it, MCO asks before making a new, empty one
(**Quit** is the default). The window only ever shows MCO's page: a file or link dropped outside a
drop area does nothing (`will-navigate` in `index.ts`, and a document-level drop guard).

## Automatic updates

The installed app checks GitHub for a newer release about 20 seconds
after launch and every 6 hours after that. You can turn this off, or
check straight away, under **Settings → Updates**.

When a new version is found, a banner at the top offers:

- **Update and restart** — downloads the new version, checks it, then
  quits MCO, swaps in the new app, and reopens it. Your library and
  settings are untouched, and there's no "Open Anyway" prompt this time,
  because the app downloaded the update itself.
- **What's new** — opens the release page;
- **Later** — hides the banner for that version until the next launch.

If MCO can't replace itself, the banner shows **Download** instead. That
happens when the app is still running from the DMG, hasn't been moved to
Applications, or sits in a folder you can't write to. If an update fails
partway, the old app is kept and the banner says so.

`npm run dev` and BETA builds never update themselves.

Code: `electron/main/updater.ts`, `src/components/UpdateBanner.tsx`.

## Tests
- `backup.test.ts`, `externalBackup.test.ts` (same-disk and inside-collection refusals, incremental
  copy, hidden files skipped, cancel), `config.test.ts`, `bootstrap.test.ts`, `dataFolder.test.ts`,
  `dataMigration.test.ts`, `updater.test.ts`.

## Limits & open questions
- The external backup hasn't been run against a real external disk yet (none connected, 2026-09-26).
- Files removed from the collection stay in the external backup (by design; pruning would be opt-in).
