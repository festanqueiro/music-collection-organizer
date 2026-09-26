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

Tracks are stored by absolute path, so a moved collection keeps its tags
only if it ends up at the same path (e.g. the same `/Volumes/<name>`).

A few view preferences (visualizer theme and options, whether MIDI badges
are shown) are kept in the window's local storage instead.

The BETA build (`npm run dist:beta`) uses its own userData folder, so its
data is separate from production.

## Backups

- **Automatic**: once a day (checked at launch and hourly), MCO snapshots
  the database (`VACUUM INTO`) and the config file into
  `<userData>/backups/`. The last 30 are kept.
- **Back up now** makes an extra snapshot immediately.
- The Backups tab shows when the last backup ran and the error, if the
  last one failed.
- **Restore** replaces the database and settings with a chosen snapshot
  and relaunches the app.

Code: `src/components/SettingsModal.tsx`, `electron/main/config.ts`,
`bootstrap.ts`, `dataMigration.ts`, `backup.ts`.

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

