import { spawn } from 'node:child_process'
import { resolveFfmpegPath } from '../ffmpegPath'

// `range`: only that part of the file (seconds), e.g. a section's detailed
// waveform while dragging a hot cue.
export function decodeToPcm(filePath: string, sampleRate = 44100, range?: { start: number; duration: number }): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = resolveFfmpegPath()
    if (!ffmpegPath) {
      reject(new Error('ffmpeg-static did not resolve a binary path for this platform/arch'))
      return
    }
    const seek = range ? ['-ss', String(Math.max(0, range.start)), '-t', String(Math.max(0, range.duration))] : []
    const args = [...seek, '-i', filePath, '-f', 'f32le', '-ac', '1', '-ar', String(sampleRate), '-loglevel', 'error', 'pipe:1']
    const proc = spawn(ffmpegPath, args)

    const chunks: Buffer[] = []
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`))
        return
      }
      const buffer = Buffer.concat(chunks)
      // The pieces aren't needed any more: an hour of audio is 635 MB, and
      // was held three times over (pieces, joined, copied).
      chunks.length = 0
      const samples = Math.floor(buffer.length / 4)
      // Joined into a buffer of its own (anything this size is): used as it
      // is. Only a small one can sit in Node's shared pool, and is copied out.
      const ownBuffer = buffer.byteOffset % 4 === 0 && buffer.buffer.byteLength === buffer.length
      const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, samples)
      resolve(ownBuffer ? floatArray : new Float32Array(floatArray))
    })
  })
}
