// Actions picked in the application menu (electron/main/appMenu.ts), handed
// to whichever component owns them: App for most, the Toolbar and the
// Playlists box for the ones that open their own dialogs.
import type { MenuCommand } from './types'

type Handler = () => void
const handlers = new Map<MenuCommand, Set<Handler>>()

// Returns the unsubscribe, for a useEffect.
export function onMenuCommand(command: MenuCommand, handler: Handler): () => void {
  const set = handlers.get(command) ?? new Set()
  handlers.set(command, set)
  set.add(handler)
  return () => {
    set.delete(handler)
  }
}

export function runMenuCommand(command: MenuCommand): void {
  for (const handler of handlers.get(command) ?? []) handler()
}
