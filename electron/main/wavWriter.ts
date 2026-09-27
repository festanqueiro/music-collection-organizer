// electron/main/wavWriter.ts
//
// Writes a PCM WAV to disk as audio arrives. The header's two size fields
// are rewritten after every chunk, so the file on disk is always a valid,
// playable WAV — if MCO crashes or the Mac loses power mid-recording,
// everything up to the last chunk is kept.
import { closeSync, openSync, writeSync } from 'node:fs'

const HEADER_BYTES = 44
// A plain RIFF WAV's sizes are 32-bit: data stops just short of 4 GiB
// (about 6 h 12 min of 24-bit 48 kHz stereo).
export const MAX_DATA_BYTES = 0xffffffff - (HEADER_BYTES - 8)

export function wavHeader(sampleRate: number, channels: number, bitsPerSample: number, dataBytes: number): Buffer {
  const blockAlign = channels * (bitsPerSample / 8)
  const header = Buffer.alloc(HEADER_BYTES)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(HEADER_BYTES - 8 + dataBytes, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * blockAlign, 28) // byte rate
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataBytes, 40)
  return header
}

export class WavWriter {
  private fd: number | null
  private dataBytes = 0

  constructor(
    readonly path: string,
    private sampleRate: number,
    private channels: number,
    private bitsPerSample: number
  ) {
    this.fd = openSync(path, 'w')
    writeSync(this.fd, wavHeader(sampleRate, channels, bitsPerSample, 0))
  }

  get bytesWritten(): number {
    return this.dataBytes
  }

  // Appends PCM (already in the file's format, interleaved). Returns false
  // once the file is full (see MAX_DATA_BYTES); the rest is dropped.
  append(pcm: Uint8Array): boolean {
    if (this.fd === null) return false
    const room = MAX_DATA_BYTES - this.dataBytes
    const blockAlign = this.channels * (this.bitsPerSample / 8)
    const length = Math.min(pcm.byteLength, room - (room % blockAlign))
    if (length > 0) {
      writeSync(this.fd, pcm, 0, length, HEADER_BYTES + this.dataBytes)
      this.dataBytes += length
      this.writeSizes()
    }
    return length === pcm.byteLength
  }

  close(): void {
    if (this.fd === null) return
    this.writeSizes()
    closeSync(this.fd)
    this.fd = null
  }

  private writeSizes(): void {
    if (this.fd === null) return
    const sizes = Buffer.alloc(4)
    sizes.writeUInt32LE(HEADER_BYTES - 8 + this.dataBytes, 0)
    writeSync(this.fd, sizes, 0, 4, 4)
    sizes.writeUInt32LE(this.dataBytes, 0)
    writeSync(this.fd, sizes, 0, 4, 40)
  }
}
