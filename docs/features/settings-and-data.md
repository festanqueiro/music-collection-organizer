# Settings & data

Open **Settings** from the toolbar. It has three tabs.

| Tab | Sections |
| --- | --- |
| **General** | Collection folder (Change…), Database & settings location (Change…) |
| **Audio** | Audio Output device, MIDI (mapping buttons, export/import/reset) |
| **Backups** | Backup status and **Back up now**, Restore, Tag data (export/import) |

## Where data lives

MCO stores:

- `collection.db` — the SQLite database (tracks, analysis results, tags);
- `config.json` — collection folder, FX and MIDI settings, table column
  order and sort, audio output device.

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
