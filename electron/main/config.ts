import Store from 'electron-store'

interface ConfigSchema {
  collectionFolder?: string
}

let store: Store<ConfigSchema> | null = null

function getStore(): Store<ConfigSchema> {
  if (!store) {
    store = new Store<ConfigSchema>({ name: 'config' })
  }
  return store
}

export function __setStoreForTests(testStore: Store<ConfigSchema>) {
  store = testStore
}

export function getCollectionFolder(): string | null {
  return getStore().get('collectionFolder') ?? null
}

export function setCollectionFolder(path: string): void {
  getStore().set('collectionFolder', path)
}
