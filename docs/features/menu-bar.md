---
status: shipped
updated: 2026-10-09
adrs: []
---
# Menu bar

## What it does
MCO has its own application menu (the menu bar on macOS, the window's menu on Windows) instead of
Electron's default one: the standard items plus MCO's main actions, with shortcuts.

## Behaviour
| Menu | Item | Shortcut | Does |
| --- | --- | --- | --- |
| MCO | About MCO | | The standard About box |
| | Check for Updates… | | Checks now; a toast says *up to date*, or the update banner appears |
| | Settings… | ⌘, | Opens Settings |
| File | New Playlist | ⌘N | A new playlist's name field in the Playlists box (the sidebar opens if collapsed) |
| | Import from Rekordbox (xml)… | | The Playlists box's import: Rekordbox's collection export (xml) or playlist files (m3u8, txt) — its playlists, after a preview |
| | Export Collection to Rekordbox (xml)… | | Saves the whole collection as a `rekordbox.xml` — the same file as Settings → Import & export |
| | Update Collection… | ⌘U | The toolbar's Update Collection dialog |
| | Show Collection Folder in Finder | | Opens the collection folder |
| Edit | Undo … Select All | standard | Text editing |
| | Find | ⌘F | Focuses the search box |
| Playback | Play / Pause | | The player's toggle |
| | Next Track | ⌥⌘→ | Plays the next queued track |
| | Shuffle Queue, Clear Queue | | As in the Queue view |
| View | Collection / Queue / FX / Live | ⌘1 – ⌘4 | Back to the table, or that full-screen view |
| | Visualizer | ⇧⌘V | Opens it (needs a track loaded) |
| | Stats | ⌘I | Opens Stats |
| | Show / Hide Sidebar | ⌘B | Collapses or reopens the sidebar |
| | Enter Full Screen | standard | |
| Bulk Operations | Analyse Tracks Not Analysed Yet… | | Asks, then analyses every local track still waiting (or that failed). Was *File → Analyse Collection…* |
| | Measure Every BPM Again… | | Asks, then measures the BPM of every local analysed track again — [Refine BPM](dj-tools.md)'s *Measure it again* on the whole collection: only the BPM changes, a BPM set by hand stays. About a second a track, with a count in a toast |
| | Stop | | Stops the analysis runs in progress, and a BPM batch after the track it is on (the ones done keep their new BPM) |
| Window | standard | | Minimise, zoom, bring to front |
| Help | MCO Website, Release Notes | | Open in the browser |

- Play / Pause has no shortcut in the menu: **Space** as a menu shortcut would be taken from the
  search box. The page's own keys (Space, →, C, …) work as before.
- While a dialog is open nothing from the menu acts behind it; Settings and Stats swap with each
  other.
- With every window closed (macOS), the items do nothing until a window is reopened.
- Reload and the developer tools are in View only in a development run, not in an installed app.
- On Windows there is no app menu: Settings is in File, Check for Updates and About in Help.

## How it works
- `electron/main/appMenu.ts` builds the template (`buildAppMenuTemplate`, no Electron calls of
  its own); `electron/main/index.ts` installs it once at startup.
- An MCO item sends a `MenuCommand` (`src/types.ts`) to the page on `menu:command`. In the page,
  `src/menuCommands.ts` hands it to whoever owns the action: `App.tsx` for most, the Toolbar
  (Find, Update Collection) and the Playlists box (New Playlist, Import) for their own dialogs —
  so a menu item does exactly what its button does.

## Tests
- `appMenu.test.ts`: the menus per platform, each action sending its command, no two items with
  the same shortcut and none with a bare key, no Reload / developer tools when installed.
- Checked in the BETA build by sending the commands to the page.
- `npm run test:app` (`tests/app/smoke.mjs`): the Bulk Operations menu has its three items, and
  *Measure Every BPM Again…* asks first, with the number of tracks.

## Limits & open questions
- *Measure Every BPM Again* works on one track at a time: an hour for 3,600 tracks.
- Items aren't greyed out when they don't apply (nothing playing, no analysis running).
- Not offered yet: the tag export / import and Rekordbox export (in Settings → Transfer).
