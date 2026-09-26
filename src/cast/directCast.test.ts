import { describe, it, expect } from 'vitest'
import { reconcile } from './directCast'

const playing = { paused: false, currentTime: 30 }
const paused = { paused: true, currentTime: 30 }

describe('reconcile', () => {
  it('ignores the device right after MCO sent it a command', () => {
    expect(reconcile({ playerState: 'PAUSED', idleReason: null, currentTime: 10 }, playing, 500)).toEqual({
      pause: false,
      play: false,
      seekTo: null,
    })
  })

  it('pauses MCO when the device was paused from elsewhere', () => {
    expect(reconcile({ playerState: 'PAUSED', idleReason: null, currentTime: 30.2 }, playing, 10_000)).toEqual({
      pause: true,
      play: false,
      seekTo: null,
    })
  })

  it('resumes MCO when the device was resumed from elsewhere', () => {
    expect(reconcile({ playerState: 'PLAYING', idleReason: null, currentTime: 30 }, paused, 10_000).play).toBe(true)
  })

  it('follows the device position once it has drifted more than about a third of a second', () => {
    expect(reconcile({ playerState: 'PLAYING', idleReason: null, currentTime: 29.5 }, playing, 10_000).seekTo).toBe(29.5)
    expect(reconcile({ playerState: 'PLAYING', idleReason: null, currentTime: 29.8 }, playing, 10_000).seekTo).toBeNull()
  })

  it('leaves MCO alone while the device is buffering or has finished', () => {
    for (const playerState of ['BUFFERING', 'LOADING', 'IDLE'] as const) {
      expect(reconcile({ playerState, idleReason: null, currentTime: 0 }, playing, 10_000)).toEqual({
        pause: false,
        play: false,
        seekTo: null,
      })
    }
  })
})
