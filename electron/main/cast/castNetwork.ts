import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os'

// The address the device should use to reach this Mac: the IPv4 address
// on the same subnet as the device, falling back to the first
// non-internal IPv4 address (e.g. when the TV sits behind a separate
// access point).
export function pickLocalAddress(
  deviceHost: string,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string | null {
  const candidates = Object.values(interfaces)
    .flat()
    .filter((i): i is NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
  const toInt = (ip: string) => ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0
  const device = toInt(deviceHost)
  const sameSubnet = candidates.find((i) => {
    const mask = toInt(i.netmask)
    return (toInt(i.address) & mask) === (device & mask)
  })
  return (sameSubnet ?? candidates[0])?.address ?? null
}
