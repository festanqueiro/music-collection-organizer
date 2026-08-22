import Store from 'electron-store'

// The one thing that must always live at electron-store's fixed default
// location (userData) no matter where the rest of the app's data ends up —
// otherwise nothing could find config.json/collection.db after they
// relocate into the collection folder. Deliberately minimal: a single
// field, so there's nothing here that itself ever needs migrating.
interface BootstrapSchema {
  dataFolder?: string
}

let bootstrapStore: Store<BootstrapSchema> | null = null

function getBootstrapStore(): Store<BootstrapSchema> {
  if (!bootstrapStore) {
    bootstrapStore = new Store<BootstrapSchema>({ name: 'bootstrap' })
  }
  return bootstrapStore
}

export function __setBootstrapStoreForTests(testStore: Store<BootstrapSchema>) {
  bootstrapStore = testStore
}

// null means "still on the default" (userData) — the state every install
// starts in, before a collection folder has ever been picked.
export function getDataFolder(): string | null {
  return getBootstrapStore().get('dataFolder') ?? null
}

export function setDataFolder(folder: string): void {
  getBootstrapStore().set('dataFolder', folder)
}
