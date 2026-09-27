// src/components/audioOutputs.tsx
//
// The Mac's audio outputs, for choosing where MCO plays (the Audio popover
// in the player bar and Settings → Audio). Real device names come from the
// main process's 'media' permission-check grant (registerPermissionHandlers
// in electron/main/index.ts) — no mic stream is ever opened for this, which
// would drop Bluetooth headphones into their hands-free profile. The list
// follows devices coming and going (an AirPlay speaker picked in Control
// Center appears then).
import { useEffect, useState } from 'react'

export function useAudioOutputs(): { devices: MediaDeviceInfo[]; error: string | null } {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const refresh = () =>
      navigator.mediaDevices
        .enumerateDevices()
        .then((all) => {
          if (cancelled) return
          setDevices(all.filter((d) => d.kind === 'audiooutput'))
          setError(null)
        })
        .catch((err) => {
          if (!cancelled) setError('Could not list audio output devices.')
          console.error('enumerateDevices failed', err)
        })
    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener('devicechange', refresh)
    }
  }, [])
  return { devices, error }
}

// A device picker; "System default" follows the Mac's sound output.
export function OutputSelect({
  value,
  onChange,
  devices,
  title,
}: {
  value: string | null
  onChange: (id: string | null) => void
  devices: MediaDeviceInfo[]
  title?: string
}) {
  return (
    <select
      value={value ?? ''}
      title={title}
      onChange={(e) => {
        onChange(e.target.value || null)
        // Otherwise the focused menu swallows Space (play/pause).
        e.currentTarget.blur()
      }}
      style={{ maxWidth: '100%', width: '100%' }}
    >
      <option value="">System default</option>
      {devices.map((d, i) => (
        <option key={d.deviceId} value={d.deviceId}>
          {d.label || `Audio output ${i + 1}`}
        </option>
      ))}
    </select>
  )
}

// Whether two output choices are the same device: null ("System default")
// and macOS's own 'default' entry both mean the system output.
export function sameOutput(a: string | null, b: string | null): boolean {
  const norm = (id: string | null) => (id === null || id === 'default' ? '' : id)
  return norm(a) === norm(b)
}
