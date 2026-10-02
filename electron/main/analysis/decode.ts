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
      const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4)
      resolve(new Float32Array(floatArray)) // copy out of the shared buffer
    })
  })
}
