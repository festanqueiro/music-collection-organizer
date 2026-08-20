// electron/main/analysis/metadata.ts
import { parseFile } from 'music-metadata'

export interface ExtractedMetadata {
  title: string | null
  artist: string | null
  album: string | null
  genre: string | null
  year: number | null
  duration: number | null
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
  }
}
