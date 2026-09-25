import { describe, it, expect } from 'vitest'
import type { NetworkInterfaceInfo } from 'node:os'
import { pickLocalAddress } from './castStream'

function iface(address: string, netmask: string, internal = false): NetworkInterfaceInfo {
  return { address, netmask, family: 'IPv4', mac: '00:00:00:00:00:00', internal, cidr: null }
}

describe('pickLocalAddress', () => {
  const interfaces = {
    lo0: [iface('127.0.0.1', '255.0.0.0', true)],
    utun3: [iface('10.8.0.2', '255.255.255.0')],
    en0: [iface('192.168.1.23', '255.255.255.0')],
  }

  it('prefers the interface on the same subnet as the device', () => {
    expect(pickLocalAddress('192.168.1.40', interfaces)).toBe('192.168.1.23')
  })

  it('falls back to the first non-internal address', () => {
    expect(pickLocalAddress('172.16.0.9', interfaces)).toBe('10.8.0.2')
  })

  it('returns null with no usable interface', () => {
    expect(pickLocalAddress('192.168.1.40', { lo0: interfaces.lo0 })).toBeNull()
  })
})
