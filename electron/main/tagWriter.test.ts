import { describe, it, expect } from 'vitest'
import { parseBuffer } from 'music-metadata'
import { applyTags, parseId3, updateId3, TagWriteError } from './tagWriter'
import type { EditableTags } from '../../src/types'

const TAGS: EditableTags = { title: 'Tïtle ✓', artist: 'Artist', album: 'Album', genre: 'House, Deep House', year: 2024 }
const EMPTY: EditableTags = { title: null, artist: null, album: null, genre: null, year: null }

function chunk(id: string, data: Buffer, bigEndian: boolean): Buffer {
  const header = Buffer.alloc(8)
  header.write(id, 0, 'latin1')
  if (bigEndian) header.writeUInt32BE(data.length, 4)
  else header.writeUInt32LE(data.length, 4)
  return Buffer.concat([header, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)])
}

function container(magic: string, formType: string, chunks: Buffer[], bigEndian: boolean): Buffer {
  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(12)
  header.write(magic, 0, 'latin1')
  if (bigEndian) header.writeUInt32BE(body.length + 4, 4)
  else header.writeUInt32LE(body.length + 4, 4)
  header.write(formType, 8, 'latin1')
  return Buffer.concat([header, body])
}

function syncsafe(n: number): Buffer {
  return Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f])
}

// ID3v2.4 tag with a title plus a private frame that must survive edits.
function id3With(frames: [string, Buffer][]): Buffer {
  const body = Buffer.concat(
    frames.map(([id, data]) => {
      const h = Buffer.alloc(10)
      h.write(id, 0, 'latin1')
      syncsafe(data.length).copy(h, 4)
      return Buffer.concat([h, data])
    })
  )
  const header = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 4, 0, 0]), syncsafe(body.length)])
  return Buffer.concat([header, body])
}

const PRIV = Buffer.from('com.example.dj\0opaque-cue-data', 'latin1')

function wav(extraChunks: Buffer[]): Buffer {
  const fmt = Buffer.alloc(16)
  fmt.writeUInt16LE(1, 0) // PCM
  fmt.writeUInt16LE(1, 2) // mono
  fmt.writeUInt32LE(44100, 4)
  fmt.writeUInt32LE(88200, 8)
  fmt.writeUInt16LE(2, 12)
  fmt.writeUInt16LE(16, 14)
  const samples = Buffer.alloc(4410 * 2)
  for (let i = 0; i < 4410; i++) samples.writeInt16LE(Math.round(Math.sin(i / 10) * 8000), i * 2)
  return container('RIFF', 'WAVE', [chunk('fmt ', fmt, false), chunk('data', samples, false), ...extraChunks], false)
}

function aiff(extraChunks: Buffer[]): Buffer {
  const comm = Buffer.alloc(18)
  comm.writeUInt16BE(1, 0) // channels
  comm.writeUInt32BE(4410, 2) // frames
  comm.writeUInt16BE(16, 6) // bits
  // 44100 as an 80-bit extended float
  Buffer.from([0x40, 0x0e, 0xac, 0x44, 0, 0, 0, 0, 0, 0]).copy(comm, 8)
  const ssnd = Buffer.concat([Buffer.alloc(8), Buffer.alloc(4410 * 2, 7)])
  return container('FORM', 'AIFF', [chunk('COMM', comm, true), chunk('SSND', ssnd, true), ...extraChunks], true)
}

describe('ID3 editing', () => {
  it('replaces the text frames and keeps every other frame byte-for-byte', () => {
    const original = id3With([
      ['TIT2', Buffer.from('\x03Old title', 'latin1')],
      ['PRIV', PRIV],
      ['TYER', Buffer.from('\x031999', 'latin1')],
    ])
    const tag = parseId3(updateId3(original, TAGS))
    expect(tag.version).toBe(4)
    expect(tag.frames.map((f) => f.id)).toEqual(['TIT2', 'PRIV', 'TYER', 'TPE1', 'TALB', 'TCON'])
    expect(tag.frames.find((f) => f.id === 'PRIV')!.data.equals(PRIV)).toBe(true)
    expect(tag.frames.find((f) => f.id === 'TYER')!.data.toString('utf8', 1)).toBe('2024')
  })

  it('removes frames for cleared fields', () => {
    const original = id3With([
      ['TIT2', Buffer.from('\x03Old', 'latin1')],
      ['PRIV', PRIV],
    ])
    expect(parseId3(updateId3(original, EMPTY)).frames.map((f) => f.id)).toEqual(['PRIV'])
  })

  it('refuses tags it would have to guess at', () => {
    const v22 = Buffer.from([0x49, 0x44, 0x33, 2, 0, 0, 0, 0, 0, 0])
    expect(() => parseId3(v22)).toThrow(TagWriteError)
  })
})

describe('applyTags', () => {
  it('WAV: writes an id3 chunk, updates INFO, and leaves the audio and other chunks alone', async () => {
    const info = Buffer.concat([Buffer.from('INFO'), chunk('INAM', Buffer.from('Old\0'), false), chunk('ISFT', Buffer.from('Some DAW\0'), false)])
    const cue = Buffer.from('cue-points-go-here')
    const original = wav([chunk('LIST', info, false), chunk('cue ', cue, false)])
    const updated = applyTags(original, 'wav', TAGS)

    const meta = await parseBuffer(updated, { mimeType: 'audio/wav' })
    expect(meta.common.title).toBe(TAGS.title)
    expect(meta.common.artist).toBe(TAGS.artist)
    expect(meta.common.genre?.[0]).toBe(TAGS.genre)
    expect(meta.common.year).toBe(2024)
    expect(meta.format.numberOfSamples).toBe(4410)
    expect(updated.includes(cue)).toBe(true)
    expect(updated.includes(Buffer.from('Some DAW'))).toBe(true)
    expect(updated.includes(original.subarray(44, 44 + 8820))).toBe(true) // the samples
  })

  it('AIFF: replaces the ID3 chunk and keeps its other frames', async () => {
    const original = aiff([chunk('ID3 ', id3With([['TIT2', Buffer.from('\x03Old', 'latin1')], ['PRIV', PRIV]]), true)])
    const updated = applyTags(original, 'aiff', TAGS)

    const meta = await parseBuffer(updated, { mimeType: 'audio/aiff' })
    expect(meta.common.title).toBe(TAGS.title)
    expect(meta.common.album).toBe(TAGS.album)
    expect(updated.includes(PRIV)).toBe(true)
    expect(updated.includes(Buffer.alloc(4410 * 2, 7))).toBe(true)
  })

  it('clearing every field leaves no text tags behind', async () => {
    const tagged = applyTags(aiff([]), 'aiff', TAGS)
    const cleared = applyTags(tagged, 'aiff', EMPTY)
    const meta = await parseBuffer(cleared, { mimeType: 'audio/aiff' })
    expect(meta.common.title).toBeUndefined()
    expect(meta.common.genre).toBeUndefined()
  })

  it('refuses formats it does not write', () => {
    expect(() => applyTags(Buffer.from('fLaC'), 'flac', TAGS)).toThrow(TagWriteError)
  })
})
