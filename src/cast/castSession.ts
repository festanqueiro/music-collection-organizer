// Renderer side of starting and stopping a cast. The device plays each
// track itself — in MCO's own Cast app where it can, Google's player
// otherwise (see electron/main/cast/castSession.ts) — with the Player as
// its remote (directCast.ts) and MCO's app kept in step with MCO's
// effects, siren and visualizer (receiverSync.ts).
import { useCollectionStore } from '../state/store'
import type { CastDevice, CastStatus } from '../types'

export function isCastActive(status: CastStatus): boolean {
  return status.state === 'connecting' || status.state === 'casting'
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
}

export async function startCasting(device: CastDevice): Promise<void> {
  try {
    await window.api.startCast(device.id)
  } catch (err) {
    useCollectionStore.getState().setCastStatus({ state: 'error', error: errorMessage(err) })
  }
}

export function stopCasting(): void {
  window.api.stopCast()
}

// Wires main-process cast events into the store; call once at startup.
export function initCast(): () => void {
  const offStatus = window.api.onCastStatus((status) => useCollectionStore.getState().setCastStatus(status))
  const offDevices = window.api.onCastDevices((devices) => useCollectionStore.getState().setCastDevices(devices))
  // Picks up a session that outlived a renderer reload.
  window.api.getCastStatus().then((status) => useCollectionStore.getState().setCastStatus(status))
  return () => {
    offStatus()
    offDevices()
  }
}
