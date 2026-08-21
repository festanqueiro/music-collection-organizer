import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Generates a 1-second, 44100Hz, mono, 16-bit PCM WAV file containing a 440Hz sine wave.
export function createTestToneWav(dir: string, filename = 'tone.wav'): string {
  const sampleRate = 44100
  const durationSeconds = 1
  const numSamples = sampleRate * durationSeconds
  const dataSize = numSamples * 2 // 16-bit = 2 bytes/sample
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16) // fmt chunk size
  buffer.writeUInt16LE(1, 20) // PCM format
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28) // byte rate
  buffer.writeUInt16LE(2, 32) // block align
  buffer.writeUInt16LE(16, 34) // bits per sample
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.5
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2)
  }

  const filePath = join(dir, filename)
  writeFileSync(filePath, buffer)
  return filePath
}
