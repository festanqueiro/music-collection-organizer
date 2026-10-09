// The application menu (the menu bar on macOS, the window's menu on
// Windows): MCO's own actions next to the standard ones. An MCO action is
// sent to the page as a MenuCommand (src/menuCommands.ts), which does it the
// same way its button would.
import type { MenuItemConstructorOptions } from 'electron'
import type { MenuCommand } from '../../src/types'

export const WEBSITE_URL = 'https://festanqueiro.github.io/music-collection-organizer/'
export const RELEASES_URL = 'https://github.com/festanqueiro/music-collection-organizer/releases'

export interface AppMenuOptions {
  isMac: boolean
  // Reload and the developer tools: not in an installed app.
  isDev: boolean
  appName: string
  send: (command: MenuCommand) => void
  openUrl: (url: string) => void
  showCollectionFolder: () => void
}

export function buildAppMenuTemplate(options: AppMenuOptions): MenuItemConstructorOptions[] {
  const { isMac, isDev, appName, send, openUrl, showCollectionFolder } = options
  const command = (label: string, id: MenuCommand, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: () => send(id),
  })
  const separator: MenuItemConstructorOptions = { type: 'separator' }
  const settings = command('Settings…', 'settings', 'CmdOrCtrl+,')
  const checkForUpdates = command('Check for Updates…', 'check-for-updates')

  const appMenu: MenuItemConstructorOptions = {
    label: appName,
    submenu: [
      { role: 'about' },
      checkForUpdates,
      separator,
      settings,
      separator,
      { role: 'services' },
      separator,
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      separator,
      { role: 'quit' },
    ],
  }

  return [
    ...(isMac ? [appMenu] : []),
    {
      label: 'File',
      submenu: [
        command('New Playlist', 'new-playlist', 'CmdOrCtrl+N'),
        separator,
        command('Import from Rekordbox (xml)…', 'import-rekordbox'),
        command('Export Collection to Rekordbox (xml)…', 'export-rekordbox'),
        separator,
        command('Update Collection…', 'update-collection', 'CmdOrCtrl+U'),
        separator,
        { label: isMac ? 'Show Collection Folder in Finder' : 'Show Collection Folder', click: showCollectionFolder },
        separator,
        ...(isMac ? [] : [settings, separator]),
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        separator,
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        separator,
        command('Find', 'find', 'CmdOrCtrl+F'),
      ],
    },
    {
      // No Space or → here: as menu shortcuts they would be taken from the
      // search box. The page's own keys (docs/README.md) still work.
      label: 'Playback',
      submenu: [
        command('Play / Pause', 'play-pause'),
        command('Next Track', 'next-track', 'CmdOrCtrl+Alt+Right'),
        separator,
        command('Shuffle Queue', 'shuffle-queue'),
        command('Clear Queue', 'clear-queue'),
      ],
    },
    {
      label: 'View',
      submenu: [
        command('Collection', 'show-collection', 'CmdOrCtrl+1'),
        command('Queue', 'show-queue', 'CmdOrCtrl+2'),
        command('FX', 'show-fx', 'CmdOrCtrl+3'),
        command('Live', 'show-live', 'CmdOrCtrl+4'),
        command('Visualizer', 'show-visualizer', 'CmdOrCtrl+Shift+V'),
        separator,
        command('Stats', 'stats', 'CmdOrCtrl+I'),
        command('Show / Hide Sidebar', 'toggle-sidebar', 'CmdOrCtrl+B'),
        separator,
        { role: 'togglefullscreen' },
        ...(isDev ? [separator, { role: 'reload' } as const, { role: 'toggleDevTools' } as const] : []),
      ],
    },
    {
      // Work on the whole collection: each asks first, and Stop ends it.
      label: 'Bulk Operations',
      submenu: [
        command('Analyse Tracks Not Analysed Yet…', 'analyse-collection'),
        command('Measure Every BPM Again…', 'remeasure-bpms'),
        separator,
        command('Stop', 'stop-analysis'),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'MCO Website', click: () => openUrl(WEBSITE_URL) },
        { label: 'Release Notes', click: () => openUrl(RELEASES_URL) },
        ...(isMac ? [] : [separator, checkForUpdates, { role: 'about' } as const]),
      ],
    },
  ]
}
