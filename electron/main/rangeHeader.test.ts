import { describe, it, expect } from 'vitest'
import { parseRangeHeader } from './rangeHeader'

describe('parseRangeHeader', () => {
  const fileSize = 1000

  it('parses a fully-specified range', () => {
    expect(parseRangeHeader('bytes=200-499', fileSize)).toEqual({ start: 200, end: 499 })
  })

  it('parses an open-ended range ("from here to the end")', () => {
    expect(parseRangeHeader('bytes=200-', fileSize)).toEqual({ start: 200, end: 999 })
  })

  it('parses a suffix range ("last N bytes")', () => {
    expect(parseRangeHeader('bytes=-500', fileSize)).toEqual({ start: 500, end: 999 })
  })

  it('clamps a suffix range longer than the whole file to byte 0', () => {
    expect(parseRangeHeader('bytes=-5000', fileSize)).toEqual({ start: 0, end: 999 })
  })

  it('clamps an end past the end of the file', () => {
    expect(parseRangeHeader('bytes=900-5000', fileSize)).toEqual({ start: 900, end: 999 })
  })

  it('rejects a start at or past the end of the file', () => {
    expect(parseRangeHeader('bytes=1000-', fileSize)).toBeNull()
    expect(parseRangeHeader('bytes=1500-', fileSize)).toBeNull()
  })

  it('rejects a start after the end', () => {
    expect(parseRangeHeader('bytes=500-100', fileSize)).toBeNull()
  })

  it('rejects a malformed header', () => {
    expect(parseRangeHeader('not-a-range', fileSize)).toBeNull()
    expect(parseRangeHeader('bytes=', fileSize)).toBeNull()
    expect(parseRangeHeader('bytes=-', fileSize)).toBeNull()
  })

  it('accepts the very first and very last byte', () => {
    expect(parseRangeHeader('bytes=0-0', fileSize)).toEqual({ start: 0, end: 0 })
    expect(parseRangeHeader('bytes=999-999', fileSize)).toEqual({ start: 999, end: 999 })
  })
})
