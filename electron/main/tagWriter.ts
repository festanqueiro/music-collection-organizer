// Writes the user-editable text tags (title, artist, album, genre, year)
// into an audio file — without re-encoding and without touching anything
// else in it. DJ files carry more than these five fields: cover art,
// comments, ISRCs, cue points (WAV cue/adtl), broadcast info (bext), and
// other apps' private chunks and frames (Serato/Traktor data). Tools that
// rebuild the tag from scratch (ffmpeg included) drop what they don't
// understand, so this edits the bytes directly instead:
//
//   - ID3v2.3/2.4 (MP3's leading tag, AIFF's "ID3 " chunk, WAV's "id3 "
//     chunk): only the five text frames are replaced or removed; every
//     other frame is copied byte-for-byte.
//   - AIFF/WAV containers: only the ID3 chunk (and, in WAV, the matching
//     LIST/INFO entries, when the file has that chunk) changes; every other
//     chunk — audio included — is copied as is.
//
// Anything unusual (ID3v2.2, unsynchronised or extended-header tags,
// malformed chunks, FLAC/M4A) is refused rather than guessed at.
import { open, readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { parseBuffer } from 'music-metadata'
import type { EditableTags } from '../../src/types'

export class TagWriteError extends Error {}

// --- ID3v2 -----------------------------------------------------------------

interface Id3Frame {
  id: string
  flags: Buffer // 2 bytes, kept as is for frames this doesn't replace
  data: Buffer
}

interface Id3Tag {
  version: 3 | 4
  frames: Id3Frame[]
}

function readSyncsafe(buf: Buffer, offset: number): number {
  return (buf[offset] << 21) | (buf[offset + 1] << 14) | (buf[offset + 2] << 7) | buf[offset + 3]
}

function writeSyncsafe(value: number): Buffer {
  return Buffer.from([(value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f])
}

// Total bytes of the ID3v2 tag at the start of `buf` (header + body +
// footer), or 0 if there isn't one.
export function id3TagLength(buf: Buffer): number {
  if (buf.length < 10 || buf.toString('latin1', 0, 3) !== 'ID3') return 0
  const footer = buf[5] & 0x10 ? 10 : 0
  return 10 + readSyncsafe(buf, 6) + footer
}

export function parseId3(buf: Buffer): Id3Tag {
  if (buf.toString('latin1', 0, 3) !== 'ID3') throw new TagWriteError('Not an ID3 tag')
  const version = buf[3]
  if (version !== 3 && version !== 4) throw new TagWriteError(`ID3v2.${version} tags can't be edited`)
  const flags = buf[5]
  if (flags & 0x80) throw new TagWriteError("This file's ID3 tag is unsynchronised, which isn't supported")
  if (flags & 0x40) throw new TagWriteError("This file's ID3 tag has an extended header, which isn't supported")
  if (flags & 0x10) throw new TagWriteError("This file's ID3 tag has a footer, which isn't supported")
  const end = Math.min(buf.length, 10 + readSyncsafe(buf, 6))
  const frames: Id3Frame[] = []
  let p = 10
  while (p + 10 <= end) {
    const id = buf.toString('latin1', p, p + 4)
    if (id === '\0\0\0\0') break // padding
    if (!/^[A-Z0-9]{4}$/.test(id)) throw new TagWriteError('Unreadable ID3 frame')
    const size = version === 4 ? readSyncsafe(buf, p + 4) : buf.readUInt32BE(p + 4)
    if (p + 10 + size > end) throw new TagWriteError('Truncated ID3 frame')
    frames.push({ id, flags: buf.subarray(p + 8, p + 10), data: buf.subarray(p + 10, p + 10 + size) })
    p += 10 + size
  }
  return { version, frames }
}

// Room left after the frames, so a later edit that grows the tag slightly
// doesn't have to move anything in an MP3.
const ID3_PADDING = 512

export function serializeId3(tag: Id3Tag): Buffer {
  const frames = tag.frames.map((f) => {
    const header = Buffer.alloc(10)
    header.write(f.id, 0, 'latin1')
    if (tag.version === 4) writeSyncsafe(f.data.length).copy(header, 4)
    else header.writeUInt32BE(f.data.length, 4)
    f.flags.copy(header, 8)
    return Buffer.concat([header, f.data])
  })
  const body = Buffer.concat([...frames, Buffer.alloc(ID3_PADDING)])
  const header = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, tag.version, 0, 0]), writeSyncsafe(body.length)])
  return Buffer.concat([header, body])
}

function textFrameData(version: 3 | 4, value: string): Buffer {
  // v2.4: UTF-8. v2.3 has no UTF-8, so UTF-16 with a BOM.
  if (version === 4) return Buffer.concat([Buffer.from([0x03]), Buffer.from(value, 'utf8')])
  return Buffer.concat([Buffer.from([0x01, 0xff, 0xfe]), Buffer.from(value, 'utf16le')])
}

// Replaces the frame in place (keeping frame order), adds it at the end,
// or removes it when `value` is empty.
function setTextFrame(tag: Id3Tag, id: string, value: string | null): void {
  const index = tag.frames.findIndex((f) => f.id === id)
  const frames = tag.frames.filter((f) => f.id !== id)
  if (value) {
    const frame: Id3Frame = { id, flags: Buffer.alloc(2), data: textFrameData(tag.version, value) }
    frames.splice(index === -1 ? frames.length : index, 0, frame)
  }
  tag.frames = frames
}

// Returns a new ID3 tag: `existing` (if any) with the five fields replaced.
export function updateId3(existing: Buffer | null, tags: EditableTags): Buffer {
  const tag: Id3Tag = existing ? parseId3(existing) : { version: 3, frames: [] }
  setTextFrame(tag, 'TIT2', tags.title)
  setTextFrame(tag, 'TPE1', tags.artist)
  setTextFrame(tag, 'TALB', tags.album)
  setTextFrame(tag, 'TCON', tags.genre)
  const year = tags.year ? String(tags.year) : null
  // v2.4's year frame is TDRC, v2.3's TYER — but plenty of v2.4 files
  // carry a TYER anyway; update whichever are there.
  const has = (id: string) => tag.frames.some((f) => f.id === id)
  const yearFrames = ['TYER', 'TDRC'].filter(has)
  if (yearFrames.length === 0) yearFrames.push(tag.version === 4 ? 'TDRC' : 'TYER')
  for (const id of yearFrames) setTextFrame(tag, id, year)
  return serializeId3(tag)
}

// --- IFF containers (AIFF, WAV) ---------------------------------------------

interface Chunk {
  id: string
  data: Buffer
}

interface IffFile {
  bigEndian: boolean
  magic: string // 'FORM' or 'RIFF'
  formType: string // 'AIFF', 'AIFC' or 'WAVE'
  chunks: Chunk[]
  trailing: Buffer // anything after the container's declared end
}

function parseIff(buf: Buffer): IffFile {
  const magic = buf.toString('latin1', 0, 4)
  if (magic !== 'FORM' && magic !== 'RIFF') throw new TagWriteError('Not an AIFF or WAV file')
  const bigEndian = magic === 'FORM'
  const declared = bigEndian ? buf.readUInt32BE(4) : buf.readUInt32LE(4)
  const end = Math.min(buf.length, 8 + declared)
  const chunks: Chunk[] = []
  let p = 12
  while (p + 8 <= end) {
    const id = buf.toString('latin1', p, p + 4)
    const size = bigEndian ? buf.readUInt32BE(p + 4) : buf.readUInt32LE(p + 4)
    if (p + 8 + size > buf.length) throw new TagWriteError(`The file's "${id.trim()}" chunk runs past its end`)
    chunks.push({ id, data: buf.subarray(p + 8, p + 8 + size) })
    p += 8 + size + (size % 2)
  }
  return { bigEndian, magic, formType: buf.toString('latin1', 8, 12), chunks, trailing: buf.subarray(Math.max(p, end)) }
}

function serializeIff(file: IffFile): Buffer {
  const parts: Buffer[] = []
  for (const chunk of file.chunks) {
    const header = Buffer.alloc(8)
    header.write(chunk.id, 0, 'latin1')
    if (file.bigEndian) header.writeUInt32BE(chunk.data.length, 4)
    else header.writeUInt32LE(chunk.data.length, 4)
    parts.push(header, chunk.data)
    if (chunk.data.length % 2) parts.push(Buffer.alloc(1))
  }
  const body = Buffer.concat(parts)
  const header = Buffer.alloc(12)
  header.write(file.magic, 0, 'latin1')
  if (file.bigEndian) header.writeUInt32BE(body.length + 4, 4)
  else header.writeUInt32LE(body.length + 4, 4)
  header.write(file.formType, 8, 'latin1')
  return Buffer.concat([header, body, file.trailing])
}

function isId3Chunk(id: string): boolean {
  return id === 'ID3 ' || id === 'id3 '
}

// WAV's own tags: LIST/INFO subchunks, null-terminated strings.
const INFO_IDS: [keyof EditableTags, string][] = [
  ['title', 'INAM'],
  ['artist', 'IART'],
  ['album', 'IPRD'],
  ['genre', 'IGNR'],
  ['year', 'ICRD'],
]

export function updateInfoList(data: Buffer, tags: EditableTags): Buffer {
  const entries: Chunk[] = []
  let p = 4 // after 'INFO'
  while (p + 8 <= data.length) {
    const id = data.toString('latin1', p, p + 4)
    const size = data.readUInt32LE(p + 4)
    if (p + 8 + size > data.length) throw new TagWriteError("The file's INFO tags are malformed")
    entries.push({ id, data: data.subarray(p + 8, p + 8 + size) })
    p += 8 + size + (size % 2)
  }
  for (const [field, id] of INFO_IDS) {
    const value = tags[field] == null || tags[field] === '' ? null : String(tags[field])
    const index = entries.findIndex((e) => e.id === id)
    const entry = value ? { id, data: Buffer.from(`${value}\0`, 'utf8') } : null
    if (index === -1) {
      if (entry) entries.push(entry)
    } else if (entry) {
      entries[index] = entry
    } else {
      entries.splice(index, 1)
    }
  }
  const parts: Buffer[] = [Buffer.from('INFO', 'latin1')]
  for (const e of entries) {
    const header = Buffer.alloc(8)
    header.write(e.id, 0, 'latin1')
    header.writeUInt32LE(e.data.length, 4)
    parts.push(header, e.data)
    if (e.data.length % 2) parts.push(Buffer.alloc(1))
  }
  return Buffer.concat(parts)
}

function updateIff(buf: Buffer, tags: EditableTags): Buffer {
  const file = parseIff(buf)
  const isWav = file.formType === 'WAVE'
  if (!isWav && file.formType !== 'AIFF' && file.formType !== 'AIFC') throw new TagWriteError('Unsupported file type')
  const id3Index = file.chunks.findIndex((c) => isId3Chunk(c.id))
  const id3 = updateId3(id3Index === -1 ? null : file.chunks[id3Index].data, tags)
  if (id3Index === -1) file.chunks.push({ id: isWav ? 'id3 ' : 'ID3 ', data: id3 })
  else file.chunks[id3Index] = { id: file.chunks[id3Index].id, data: id3 }
  if (isWav) {
    file.chunks = file.chunks.map((c) =>
      c.id === 'LIST' && c.data.toString('latin1', 0, 4) === 'INFO' ? { id: c.id, data: updateInfoList(c.data, tags) } : c
    )
  } else {
    // AIFF's own text chunks, when present, take precedence over ID3 in
    // some readers — keep them in step (or drop them when cleared).
    for (const [id, value] of [
      ['NAME', tags.title],
      ['AUTH', tags.artist],
    ] as const) {
      const index = file.chunks.findIndex((c) => c.id === id)
      if (index === -1) continue
      if (value) file.chunks[index] = { id, data: Buffer.from(value, 'latin1') }
      else file.chunks.splice(index, 1)
    }
  }
  return serializeIff(file)
}

// --- ID3v1 (the fixed 128 bytes some MP3s end with) --------------------------

// Rewrites an ID3v1 block's title/artist/album/year (latin1, truncated to
// its fixed widths), keeping its comment and track number. Its genre is a
// number from a fixed list, so it's set to "none" rather than left saying
// something the new genre doesn't.
export function updateId3v1(block: Buffer, tags: EditableTags): Buffer {
  const out = Buffer.from(block)
  const put = (value: string | number | null, offset: number, width: number) => {
    out.fill(0, offset, offset + width)
    if (value != null && value !== '') out.write(String(value).slice(0, width), offset, width, 'latin1')
  }
  put(tags.title, 3, 30)
  put(tags.artist, 33, 30)
  put(tags.album, 63, 30)
  put(tags.year, 93, 4)
  out[127] = 255
  return out
}

// --- Whole files -------------------------------------------------------------

export function supportsTagEditing(format: string): boolean {
  return ['mp3', 'aiff', 'aif', 'aifc', 'wav'].includes(format.toLowerCase())
}

// The file's bytes with the tags replaced.
export function applyTags(buf: Buffer, format: string, tags: EditableTags): Buffer {
  const f = format.toLowerCase()
  if (f === 'mp3') {
    const length = id3TagLength(buf)
    const tag = updateId3(length ? buf.subarray(0, length) : null, tags)
    const hasV1 = buf.length - length >= 128 && buf.toString('latin1', buf.length - 128, buf.length - 125) === 'TAG'
    if (!hasV1) return Buffer.concat([tag, buf.subarray(length)])
    const audio = buf.subarray(length, buf.length - 128)
    // An ID3v1 block with every text field empty isn't recognised as one
    // (readers take it for audio), so drop it instead.
    if (!tags.title && !tags.artist && !tags.album && !tags.year) return Buffer.concat([tag, audio])
    return Buffer.concat([tag, audio, updateId3v1(buf.subarray(buf.length - 128), tags)])
  }
  if (f === 'aiff' || f === 'aif' || f === 'aifc' || f === 'wav') return updateIff(buf, tags)
  throw new TagWriteError(`Editing tags in ${format.toUpperCase()} files isn't supported yet`)
}

const MIME: Record<string, string> = { mp3: 'audio/mpeg', aiff: 'audio/aiff', aif: 'audio/aiff', aifc: 'audio/aiff', wav: 'audio/wav' }

// Re-reads the new bytes and checks the tags came out as asked, and the
// audio (duration, sample count) is untouched.
async function verify(before: Buffer, after: Buffer, format: string, tags: EditableTags): Promise<void> {
  const mimeType = MIME[format.toLowerCase()]
  // duration: an MP3's is otherwise estimated from the file size and
  // bitrate, which shifts with the tag's size; this counts the frames.
  const options = { mimeType, duration: true }
  const [old, updated] = await Promise.all([parseBuffer(before, options), parseBuffer(after, options)])
  const c = updated.common
  const same = (a: string | number | null | undefined, b: string | number | null) => (a ?? null) === (b === '' ? null : b)
  const checks: [string, boolean][] = [
    ['title', same(c.title, tags.title)],
    ['artist', same(c.artist, tags.artist)],
    ['album', same(c.album, tags.album)],
    ['genre', same(c.genre?.[0], tags.genre)],
    ['year', same(c.year, tags.year)],
    ['duration', old.format.duration === updated.format.duration],
    ['samples', old.format.numberOfSamples === updated.format.numberOfSamples],
  ]
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name)
  if (failed.length > 0) throw new TagWriteError(`The tags didn't write cleanly (${failed.join(', ')}) — the file was left unchanged`)
}

// Writes `tags` into the file at `path`, in place: the same file (inode)
// is overwritten rather than replaced, so its creation date — MCO's Date
// Added — is kept. The original bytes are saved to `backupDir` first and
// put back if anything fails part-way.
export async function writeTags(path: string, format: string, tags: EditableTags, backupDir: string): Promise<void> {
  const before = await readFile(path)
  const after = applyTags(before, format, tags)
  await verify(before, after, format, tags)

  const backupPath = join(backupDir, `tag-edit-backup-${process.pid}-${Date.now()}`)
  await writeFile(backupPath, before)
  const handle = await open(path, 'r+')
  try {
    try {
      await handle.write(after, 0, after.length, 0)
      await handle.truncate(after.length)
      await handle.sync()
    } catch (err) {
      await handle.write(before, 0, before.length, 0)
      await handle.truncate(before.length)
      throw err
    }
  } finally {
    await handle.close()
  }
  await unlink(backupPath).catch(() => {})
}
