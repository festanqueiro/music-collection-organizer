import { describe, it, expect } from 'vitest'
import { encodeCastMessage, decodeCastMessage, CastFrameReader, type CastMessage } from './castMessage'

const message: CastMessage = {
  sourceId: 'sender-0',
  destinationId: 'receiver-0',
  namespace: 'urn:x-cast:com.google.cast.receiver',
  payload: JSON.stringify({ type: 'LAUNCH', appId: 'CC1AD845', requestId: 1, title: 'ünïcødé ' + 'x'.repeat(300) }),
}

describe('castMessage', () => {
  it('round-trips a message through encode/decode', () => {
    const frame = encodeCastMessage(message)
    expect(frame.readUInt32BE(0)).toBe(frame.length - 4)
    expect(decodeCastMessage(frame.subarray(4))).toEqual(message)
  })

  it('reassembles frames split across and merged within chunks', () => {
    const second = { ...message, payload: '{"type":"PING"}' }
    const bytes = Buffer.concat([encodeCastMessage(message), encodeCastMessage(second)])
    const reader = new CastFrameReader()
    const out: CastMessage[] = []
    for (let i = 0; i < bytes.length; i += 7) out.push(...reader.push(bytes.subarray(i, i + 7)))
    expect(out).toEqual([message, second])
  })

  it('skips unknown varint fields', () => {
    const frame = encodeCastMessage(message)
    const body = Buffer.concat([Buffer.from([(9 << 3) | 0, 0x96, 0x01]), frame.subarray(4)])
    expect(decodeCastMessage(body)).toEqual(message)
  })
})
