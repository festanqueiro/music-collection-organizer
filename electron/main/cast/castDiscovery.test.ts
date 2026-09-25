import { describe, it, expect } from 'vitest'
import { parseCastResponse } from './castDiscovery'

const instance = 'Google-TV-abc123._googlecast._tcp.local'

describe('parseCastResponse', () => {
  it('builds a device from PTR, SRV, A and TXT records', () => {
    const devices = parseCastResponse([
      { name: '_googlecast._tcp.local', type: 'PTR', data: instance },
      { name: instance, type: 'SRV', data: { target: 'abc123.local', port: 8009 } },
      { name: 'abc123.local', type: 'A', data: '192.168.1.40' },
      { name: instance, type: 'TXT', data: [Buffer.from('id=abc123'), Buffer.from('md=Chromecast'), Buffer.from('fn=Living Room TV'), Buffer.from('ca=465413')] },
    ])
    expect(devices).toEqual([{ id: 'abc123', name: 'Living Room TV', model: 'Chromecast', host: '192.168.1.40', port: 8009, audioOnly: false }])
  })

  it('marks devices without the video capability bit as audio-only', () => {
    const devices = parseCastResponse([
      { name: '_googlecast._tcp.local', type: 'PTR', data: instance },
      { name: instance, type: 'SRV', data: { target: 'abc123.local', port: 8009 } },
      { name: 'abc123.local', type: 'A', data: '192.168.1.41' },
      { name: instance, type: 'TXT', data: [Buffer.from('fn=Kitchen'), Buffer.from('ca=198660')] },
    ])
    expect(devices[0].audioOnly).toBe(true)
  })

  it('skips a device whose address has not arrived yet', () => {
    const devices = parseCastResponse([
      { name: '_googlecast._tcp.local', type: 'PTR', data: instance },
      { name: instance, type: 'SRV', data: { target: 'abc123.local', port: 8009 } },
    ])
    expect(devices).toEqual([])
  })

  it('falls back to the instance name when TXT is missing', () => {
    const devices = parseCastResponse([
      { name: '_googlecast._tcp.local', type: 'PTR', data: instance },
      { name: instance, type: 'SRV', data: { target: 'abc123.local', port: 8009 } },
      { name: 'abc123.local', type: 'A', data: '192.168.1.40' },
    ])
    expect(devices[0]).toMatchObject({ id: instance, name: 'Google-TV-abc123', model: null, audioOnly: false })
  })
})
