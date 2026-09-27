import { describe, expect, it } from 'vitest'
import { isReceiverRemote } from './receiverProtocol'

describe('isReceiverRemote', () => {
  it('accepts the Next command from the TV', () => {
    expect(isReceiverRemote({ type: 'remote', command: 'next' })).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isReceiverRemote({ type: 'remote', command: 'previous' })).toBe(false)
    expect(isReceiverRemote({ type: 'status', command: 'next' })).toBe(false)
    expect(isReceiverRemote(null)).toBe(false)
    expect(isReceiverRemote('next')).toBe(false)
  })
})
