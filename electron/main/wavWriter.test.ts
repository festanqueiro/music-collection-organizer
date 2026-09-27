import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WavWriter, wavHeader } from './wavWriter'

describe('wavHeader', () => {
  it('describes 24-bit stereo PCM', () => {
    const header = wavHeader(48000, 2, 24, 600)
    expect(header.toString('ascii', 0, 4)).toBe('RIFF')
    expect(header.readUInt32LE(4)).toBe(36 + 600)
    expect(header.toString('ascii', 8, 16)).toBe('WAVEfmt ')
    expect(header.readUInt16LE(20)).toBe(1)
    expect(header.readUInt16LE(22)).toBe(2)
    expect(header.readUInt32LE(24)).toBe(48000)
    expect(header.readUInt32LE(28)).toBe(48000 * 6)
    expect(header.readUInt16LE(32)).toBe(6)
    expect(header.readUInt16LE(34)).toBe(24)
    expect(header.toString('ascii', 36, 40)).toBe('data')
    expect(header.readUInt32LE(40)).toBe(600)
  })
})

describe('WavWriter', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wav-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('keeps the file valid after every chunk, before close', () => {
    const path = join(dir, 'a.wav')
    const writer = new WavWriter(path, 44100, 2, 24)
    writer.append(new Uint8Array([1, 2, 3, 4, 5, 6]))
    writer.append(new Uint8Array([7, 8, 9, 10, 11, 12]))
    const file = readFileSync(path)
    expect(file.length).toBe(44 + 12)
    expect(file.readUInt32LE(4)).toBe(36 + 12)
    expect(file.readUInt32LE(40)).toBe(12)
    expect([...file.subarray(44)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    writer.close()
    expect(writer.bytesWritten).toBe(12)
  })

  it('ignores writes after close', () => {
    const writer = new WavWriter(join(dir, 'b.wav'), 44100, 2, 24)
    writer.close()
    expect(writer.append(new Uint8Array(6))).toBe(false)
  })
})
