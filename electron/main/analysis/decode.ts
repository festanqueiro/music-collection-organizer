import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'

export function decodeToPcm(filePath: string, sampleRate = 44100): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const args = ['-i', filePath, '-f', 'f32le', '-ac', '1', '-ar', String(sampleRate), '-loglevel', 'error', 'pipe:1']
    const proc = spawn(ffmpegPath as string, args)

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
