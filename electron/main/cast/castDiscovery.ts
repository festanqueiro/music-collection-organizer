// Finds Cast devices (Chromecast, Google TV, Nest speakers) on the LAN via
// mDNS: they advertise `_googlecast._tcp.local`, with the friendly name
// in the TXT record's `fn` key and the address/port in SRV + A records.
import makeMdns from 'multicast-dns'
import type { CastDevice } from '../../../src/types'

const SERVICE = '_googlecast._tcp.local'
const QUERY_INTERVAL_MS = 4000

// Loosely typed on purpose — @types/multicast-dns's record unions make
// narrowing each record type more noise than it's worth for four fields.
interface MdnsRecord {
  name: string
  type: string
  data: unknown
}

function txtValues(data: unknown): Record<string, string> {
  const entries = Array.isArray(data) ? data : [data]
  const values: Record<string, string> = {}
  for (const entry of entries) {
    const text = Buffer.isBuffer(entry) ? entry.toString('utf8') : typeof entry === 'string' ? entry : ''
    const eq = text.indexOf('=')
    if (eq > 0) values[text.slice(0, eq)] = text.slice(eq + 1)
  }
  return values
}

// Extracts every Cast device fully described by one mDNS response (PTR ->
// SRV -> A, plus TXT). Records usually all arrive together in the answers
// + additionals of a single response; a partial one is simply skipped
// until a later response fills it in.
export function parseCastResponse(records: MdnsRecord[]): CastDevice[] {
  const byName = (type: string, name: string) => records.find((r) => r.type === type && r.name === name)
  const devices: CastDevice[] = []
  for (const ptr of records) {
    if (ptr.type !== 'PTR' || ptr.name !== SERVICE || typeof ptr.data !== 'string') continue
    const instance = ptr.data
    const srv = byName('SRV', instance)?.data as { target?: string; port?: number } | undefined
    if (!srv?.target || !srv.port) continue
    const address = byName('A', srv.target)?.data
    if (typeof address !== 'string') continue
    const txt = txtValues(byName('TXT', instance)?.data)
    // Speaker groups advertise too (on their own port, no video bit) and
    // take a LOAD the same way as a single device.
    devices.push({
      id: txt.id || instance,
      name: txt.fn || instance.replace(`.${SERVICE}`, ''),
      model: txt.md || null,
      host: address,
      port: srv.port,
      // `ca` is the device's capability bitmask; bit 0 is video output.
      audioOnly: txt.ca !== undefined && (Number(txt.ca) & 1) === 0,
    })
  }
  return devices
}

// Scans while running, reporting the full device list whenever it
// changes. Devices aren't expired while a scan is running — the picker
// is only open for a few seconds at a time.
export class CastDiscovery {
  private mdns: ReturnType<typeof makeMdns> | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private devices = new Map<string, CastDevice>()

  constructor(private readonly onDevices: (devices: CastDevice[]) => void) {}

  start(): void {
    if (this.mdns) {
      this.onDevices(this.list())
      return
    }
    const mdns = makeMdns()
    this.mdns = mdns
    mdns.on('response', (response) => {
      const records = [...response.answers, ...(response.additionals ?? [])] as unknown as MdnsRecord[]
      let changed = false
      for (const device of parseCastResponse(records)) {
        const existing = this.devices.get(device.id)
        if (!existing || existing.host !== device.host || existing.port !== device.port || existing.name !== device.name) {
          this.devices.set(device.id, device)
          changed = true
        }
      }
      if (changed) this.onDevices(this.list())
    })
    mdns.on('error', (err) => console.error('cast discovery error', err))
    const query = () => mdns.query({ questions: [{ name: SERVICE, type: 'PTR' }] })
    query()
    this.timer = setInterval(query, QUERY_INTERVAL_MS)
    this.onDevices(this.list())
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.mdns?.destroy()
    this.mdns = null
  }

  get(id: string): CastDevice | undefined {
    return this.devices.get(id)
  }

  list(): CastDevice[] {
    return [...this.devices.values()].sort((a, b) => a.name.localeCompare(b.name))
  }
}
