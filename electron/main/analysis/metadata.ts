// electron/main/analysis/metadata.ts
import { open } from 'node:fs/promises'
import { parseFile, type IFormat } from 'music-metadata'

export interface ExtractedMetadata {
  title: string | null
  artist: string | null
  album: string | null
  genre: string | null
  year: number | null
  duration: number | null
  // kbps, rounded — what the file was encoded at (lossy) or averages
  // (lossless). Null when the container doesn't say.
  bitrate: number | null
  bitDepth: number | null
}

// Bits a sample, for the formats where that says something: a lossless
// file's (16, 24…). A lossy file has none worth showing.
//
// music-metadata (11.16) says `lossless: false` for every AIFF-C file and
// for a WAV with a `fact` chunk, which is how ffmpeg writes 32-bit float —
// both uncompressed PCM. Those are told by their container and codec.
export function bitDepthOf(format: Pick<IFormat, 'bitsPerSample' | 'lossless' | 'container' | 'codec'>): number | null {
  if (format.lossless === false && !isUncompressedPcm(format)) return null
  return format.bitsPerSample && format.bitsPerSample > 0 ? format.bitsPerSample : null
}

function isUncompressedPcm({ container, codec }: Pick<IFormat, 'container' | 'codec'>): boolean {
  if (!codec) return false
  // AIFF-C names the compression in words: "PCM (byte swapped)" (sowt),
  // "… 24 bit big-endian signed integer", "… IEEE 32-bit float" — against
  // "IMA 4:1", "µLaw 2:1", "MACE 3-to-1".
  if (container === 'AIFF-C') return /PCM|float|integer/i.test(codec) && !/law|IMA|MACE|ADPCM/i.test(codec)
  // WAVE: plain PCM, IEEE float (format tag 3), or the extensible header
  // (65534) that wraps either for 24 bits and more.
  if (container === 'WAVE') return codec === 'PCM' || /\((3|65534)\)$/.test(codec)
  return false
}

// A 24-bit Apple Lossless file made by Apple's encoder (Music, afconvert)
// has 16 in the MP4 sample entry's size field, which is all music-metadata
// reads. The real depth is in the codec's own box: `alac` inside the `alac`
// sample entry, 36 bytes — size, type, version and flags, frame length,
// compatible version, then the bit depth.
const ALAC_CONFIG_HEADER = Buffer.from([0, 0, 0, 0x24, 0x61, 0x6c, 0x61, 0x63])
const ALAC_BIT_DEPTH_OFFSET = 17

export async function alacBitDepth(filePath: string): Promise<number | null> {
  const file = await open(filePath, 'r')
  try {
    const { size } = await file.stat()
    const header = Buffer.alloc(16)
    // Top-level boxes, to `moov` (before or after the audio).
    for (let at = 0; at + 8 <= size; ) {
      if ((await file.read(header, 0, 16, at)).bytesRead < 8) return null
      let length = header.readUInt32BE(0)
      let headerLength = 8
      if (length === 1) {
        length = Number(header.readBigUInt64BE(8))
        headerLength = 16
      } else if (length === 0) {
        length = size - at
      }
      if (length < headerLength) return null
      if (header.toString('latin1', 4, 8) === 'moov') {
        // A moov is small next to the audio; one with covers in it can be megabytes.
        if (length > 64 * 1024 * 1024) return null
        const moov = Buffer.alloc(length - headerLength)
        await file.read(moov, 0, moov.length, at + headerLength)
        const found = moov.indexOf(ALAC_CONFIG_HEADER)
        if (found === -1 || found + ALAC_BIT_DEPTH_OFFSET >= moov.length) return null
        const bits = moov[found + ALAC_BIT_DEPTH_OFFSET]
        return [16, 20, 24, 32].includes(bits) ? bits : null
      }
      at += length
    }
    return null
  } finally {
    await file.close()
  }
}

// bitDepthOf, with the Apple Lossless depth read from the file itself.
export async function readBitDepth(filePath: string, format: Pick<IFormat, 'bitsPerSample' | 'lossless' | 'container' | 'codec'>): Promise<number | null> {
  const fromHeader = bitDepthOf(format)
  if (format.codec !== 'ALAC') return fromHeader
  return (await alacBitDepth(filePath).catch(() => null)) ?? fromHeader
}

export async function extractMetadata(filePath: string): Promise<ExtractedMetadata> {
  const result = await parseFile(filePath)
  return {
    title: result.common.title ?? null,
    artist: result.common.artist ?? null,
    album: result.common.album ?? null,
    genre: result.common.genre?.[0] ?? null,
    year: result.common.year ?? null,
    duration: result.format.duration ?? null,
    bitrate: result.format.bitrate ? Math.round(result.format.bitrate / 1000) : null,
    bitDepth: await readBitDepth(filePath, result.format),
  }
}

// Reads just the embedded cover art (ID3 APIC frame or equivalent), as a
// data URL ready to drop straight into an <img src>. Deliberately separate
// from extractMetadata/the analysis pipeline: fetched on demand only when
// the detail panel actually needs it for the selected track, not bulk-
// loaded for the whole collection — embedding artwork for every track in
// the getTracks() payload would multiply it by however large each cover
// image is, for art that's rarely even looked at.
export async function extractArtwork(filePath: string): Promise<string | null> {
  const result = await parseFile(filePath)
  const picture = result.common.picture?.[0]
  if (!picture) return null
  return `data:${picture.format};base64,${Buffer.from(picture.data).toString('base64')}`
}
