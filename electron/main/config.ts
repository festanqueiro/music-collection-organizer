import Store from 'electron-store'

interface ConfigSchema {
  collectionFolder?: string
}

let store = new Store<ConfigSchema>({ name: 'config', projectName: 'v1-library-organizer' })

export function __setStoreForTests(testStore: Store<ConfigSchema>) {
  store = testStore
}

export function getCollectionFolder(): string | null {
  return store.get('collectionFolder') ?? null
}

export function setCollectionFolder(path: string): void {
  store.set('collectionFolder', path)
}
