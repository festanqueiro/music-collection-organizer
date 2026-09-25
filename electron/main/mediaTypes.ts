import { extname } from 'node:path'

// Content types for the audio formats MCO serves — to its own <audio>
// element over media://, and to cast devices in direct mode.
const MEDIA_MIME_TYPES: Record<string, string> = {
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
}

export function mimeTypeFor(filePath: string): string {
  return MEDIA_MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}
