// electron/main/recording.ts
//
// Record mode's file side (docs/features/recording.md). The renderer taps
// the audio engine's mix bus and streams 24-bit PCM here in chunks; this
// appends them to a WAV as they come (WavWriter keeps it valid on disk the
// whole time) and, on stop, has ffmpeg make a FLAC or MP3 of it if asked.
import { app, ipcMain, dialog, shell, systemPreferences, BrowserWindow, powerSaveBlocker, type IpcMainInvokeEvent } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { WavWriter } from './wavWriter'
import { resolveFfmpegPath } from './ffmpegPath'
import { getMicSettings, getRecordingFolder, setMicSettings, setRecordingFolder } from './config'
import type { MicSettings, RecordingFormat, RecordingResult } from '../../src/types'

const CHANNELS = 2
const BITS_PER_SAMPLE = 24
const MP3_BITRATE = '192k'

function defaultRecordingFolder(): string {
  return join(app.getPath('music'), 'MCO Recordings')
}

export function recordingFolder(): string {
  return getRecordingFolder() ?? defaultRecordingFolder()
}

// "MCO Recording 2026-09-27 16.40.12" (dots: macOS Finder shows colons as
// slashes), with " 2", " 3"… if that name is taken in any format.
function recordingBaseName(folder: string, now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`
  const taken = (name: string) => ['wav', 'flac', 'mp3'].some((ext) => existsSync(join(folder, `${name}.${ext}`)))
  let name = `MCO Recording ${stamp}`
  for (let i = 2; taken(name); i++) name = `MCO Recording ${stamp} ${i}`
  return name
}

function ffmpegArgs(format: Exclude<RecordingFormat, 'wav'>): string[] {
  return format === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', MP3_BITRATE] : ['-c:a', 'flac']
}

function convert(wavPath: string, outPath: string, format: Exclude<RecordingFormat, 'wav'>): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = resolveFfmpegPath()
    if (!ffmpegPath) {
      reject(new Error('ffmpeg is missing'))
      return
    }
    const proc = spawn(ffmpegPath, ['-y', '-i', wavPath, ...ffmpegArgs(format), '-loglevel', 'error', outPath])
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `ffmpeg exited with ${code}`))))
  })
}

export function registerRecordingIpc(sendToRenderer: (channel: string, payload: unknown) => void): void {
  let writer: WavWriter | null = null
  // Keeps the Mac from sleeping mid-show (the display may still sleep).
  let sleepBlocker: number | null = null

  function finishWriting(): string | null {
    if (!writer) return null
    writer.close()
    const path = writer.path
    writer = null
    if (sleepBlocker !== null) powerSaveBlocker.stop(sleepBlocker)
    sleepBlocker = null
    return path
  }

  ipcMain.handle('mic:getSettings', (): MicSettings => getMicSettings())
  ipcMain.handle('mic:setSettings', (_e, settings: MicSettings): void => setMicSettings(settings))
  // macOS asks once whether MCO may use the microphone (true if allowed).
  ipcMain.handle('mic:requestAccess', (): Promise<boolean> => systemPreferences.askForMediaAccess('microphone'))

  ipcMain.handle('recording:getFolder', (): string => recordingFolder())

  ipcMain.handle('recording:chooseFolder', async (e: IpcMainInvokeEvent): Promise<string | null> => {
    const options = {
      defaultPath: recordingFolder(),
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
    }
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    setRecordingFolder(result.filePaths[0])
    return result.filePaths[0]
  })

  ipcMain.handle('recording:start', (_e, sampleRate: number): string => {
    finishWriting()
    const folder = recordingFolder()
    mkdirSync(folder, { recursive: true })
    const path = join(folder, `${recordingBaseName(folder, new Date())}.wav`)
    writer = new WavWriter(path, Math.round(Number(sampleRate)), CHANNELS, BITS_PER_SAMPLE)
    sleepBlocker = powerSaveBlocker.start('prevent-app-suspension')
    return path
  })

  ipcMain.on('recording:chunk', (_e, pcm: Uint8Array) => {
    if (!writer || !(pcm instanceof Uint8Array)) return
    // The WAV is full (~6 h): tell the renderer, which stops the recording.
    if (!writer.append(pcm)) sendToRenderer('recording:full', null)
  })

  ipcMain.handle('recording:stop', async (_e, format: RecordingFormat): Promise<RecordingResult> => {
    const wavPath = finishWriting()
    if (!wavPath) return { path: null, error: 'Nothing was being recorded' }
    if (format !== 'flac' && format !== 'mp3') return { path: wavPath, error: null }
    const outPath = wavPath.replace(/\.wav$/, `.${format}`)
    try {
      await convert(wavPath, outPath, format)
      unlinkSync(wavPath)
      return { path: outPath, error: null }
    } catch (err) {
      // The WAV is still there, complete.
      console.error('recording conversion failed', err)
      return { path: wavPath, error: `Couldn't make the ${format.toUpperCase()}, so the recording was kept as WAV` }
    }
  })

  ipcMain.handle('recording:reveal', (_e, path: string): void => {
    if (typeof path === 'string' && existsSync(path)) shell.showItemInFolder(path)
  })

  // Quitting mid-recording keeps what was recorded, as a WAV.
  app.on('before-quit', () => {
    finishWriting()
  })
}
