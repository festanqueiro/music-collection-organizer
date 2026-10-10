// electron/main/analysis/metadata.ts
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
export function bitDepthOf(format: Pick<IFormat, 'bitsPerSample' | 'lossless'>): number | null {
  if (format.lossless === false) return null
  return format.bitsPerSample && format.bitsPerSample > 0 ? format.bitsPerSample : null
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
    bitDepth: bitDepthOf(result.format),
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
