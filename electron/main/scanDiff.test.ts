import { describe, it, expect } from 'vitest'
import { diffScan } from './scanDiff'

describe('diffScan', () => {
  it('flags new files as toInsert', () => {
    const result = diffScan([{ path: '/a.wav', size: 100, mtime: 1, birthtime: 1 }], [])
    expect(result.toInsert).toEqual([{ path: '/a.wav', size: 100, mtime: 1, birthtime: 1 }])
    expect(result.toUpdate).toEqual([])
    expect(result.toRemove).toEqual([])
  })

  it('flags changed files as toUpdate', () => {
    const result = diffScan(
      [{ path: '/a.wav', size: 200, mtime: 2, birthtime: 1 }],
      [{ path: '/a.wav', size: 100, mtime: 1 }]
    )
    expect(result.toUpdate).toEqual([{ path: '/a.wav', size: 200, mtime: 2, birthtime: 1 }])
    expect(result.toInsert).toEqual([])
  })

  it('leaves unchanged files alone', () => {
    const result = diffScan(
      [{ path: '/a.wav', size: 100, mtime: 1, birthtime: 1 }],
      [{ path: '/a.wav', size: 100, mtime: 1 }]
    )
    expect(result.toInsert).toEqual([])
    expect(result.toUpdate).toEqual([])
    expect(result.toRemove).toEqual([])
  })

  it('flags missing files as toRemove', () => {
    const result = diffScan([], [{ path: '/gone.wav', size: 100, mtime: 1 }])
    expect(result.toRemove).toEqual(['/gone.wav'])
  })
})
