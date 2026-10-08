import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, type AppDatabase } from './db'
import { alreadyConverted, buildConvertArgs, convertTracks, parseAudioInfo, planOutput, resolveTarget, type ConvertDeps } from './convert'
import type { AudioInfo, ConvertOptions } from '../../src/types'

const wav24: AudioInfo = { codec: 'pcm_s24le', lossless: true, bitDepth: 24, sampleRate: 44100 }
const wav16: AudioInfo = { codec: 'pcm_s16le', lossless: true, bitDepth: 16, sampleRate: 44100 }
const float96: AudioInfo = { codec: 'pcm_f32le', lossless: true, bitDepth: 32, sampleRate: 96000 }
const mp3: AudioInfo = { codec: 'mp3', lossless: false, bitDepth: null, sampleRate: 44100 }
const options = (o: Partial<ConvertOptions> = {}): ConvertOptions => ({ format: 'aiff', bitDepth: null, bitrate: 320, sampleRate: null, folder: null, replace: false, ...o })

describe('parseAudioInfo', () => {
  const stream = (rest: string) => `Input #0, wav, from 'a.wav':\n  Duration: 00:00:02.00\n  Stream #0:0: Audio: ${rest}\nAt least one output file must be specified`

  it('reads the codec, bit depth and sampling frequency of lossless files', () => {
    expect(parseAudioInfo(stream('pcm_s24le ([1][0][0][0] / 0x0001), 44100 Hz, stereo, s32 (24 bit), 2116 kb/s'))).toEqual(wav24)
    expect(parseAudioInfo(stream('pcm_s16be, 48000 Hz, stereo, s16, 1536 kb/s'))).toEqual({ codec: 'pcm_s16be', lossless: true, bitDepth: 16, sampleRate: 48000 })
    expect(parseAudioInfo(stream('pcm_f32le ([3][0][0][0] / 0x0003), 96000 Hz, 2 channels, flt, 6144 kb/s'))).toEqual(float96)
    expect(parseAudioInfo(stream('flac, 44100 Hz, stereo, s32 (24 bit)'))).toMatchObject({ codec: 'flac', lossless: true, bitDepth: 24 })
    expect(parseAudioInfo(`  Stream #0:0[0x1](und): Audio: alac (alac / 0x63616C61), 44100 Hz, stereo, s16p, 230 kb/s (default)`)).toMatchObject({ codec: 'alac', bitDepth: 16 })
  })

  it('gives a lossy file no bit depth', () => {
    expect(parseAudioInfo(stream('mp3 (mp3float), 44100 Hz, stereo, fltp, 320 kb/s'))).toEqual(mp3)
    expect(parseAudioInfo(stream('aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 224 kb/s (default)'))).toMatchObject({ codec: 'aac', lossless: false, bitDepth: null, sampleRate: 48000 })
  })

  it('finds nothing in a file with no audio', () => {
    expect(parseAudioInfo('a.txt: Invalid data found when processing input')).toBeNull()
  })
})

describe('resolveTarget', () => {
  it('keeps 16-bit at 16, takes anything deeper to 24, and a lossy file to 16', () => {
    expect(resolveTarget(options(), wav16).bitDepth).toBe(16)
    expect(resolveTarget(options(), wav24).bitDepth).toBe(24)
    expect(resolveTarget(options(), float96).bitDepth).toBe(24)
    expect(resolveTarget(options(), mp3).bitDepth).toBe(16)
    expect(resolveTarget(options({ bitDepth: 16 }), wav24).bitDepth).toBe(16)
  })

  it("keeps the file's frequency unless asked, and stops MP3 and AAC at 48 kHz", () => {
    expect(resolveTarget(options(), float96).sampleRate).toBeNull()
    expect(resolveTarget(options({ sampleRate: 44100 }), float96).sampleRate).toBe(44100)
    expect(resolveTarget(options({ sampleRate: 44100 }), wav24).sampleRate).toBeNull()
    expect(resolveTarget(options({ format: 'mp3' }), float96).sampleRate).toBe(48000)
    expect(resolveTarget(options({ format: 'aac', sampleRate: 96000 }), wav24).sampleRate).toBe(48000)
    expect(resolveTarget(options({ format: 'mp3' }), mp3).sampleRate).toBeNull()
  })
})

describe('alreadyConverted', () => {
  const same = (path: string, o: Partial<ConvertOptions>, info: AudioInfo) => alreadyConverted(path, options(o).format, resolveTarget(options(o), info), info)

  it('is a lossless file already in that format, depth and frequency', () => {
    expect(same('/a.wav', { format: 'wav' }, wav24)).toBe(true)
    expect(same('/a.AIF', { format: 'aiff' }, { ...wav24, codec: 'pcm_s24be' })).toBe(true)
    expect(same('/a.m4a', { format: 'alac' }, { ...wav16, codec: 'alac' })).toBe(true)
  })

  it("isn't when anything would change, or for MP3 and AAC", () => {
    expect(same('/a.wav', { format: 'wav', bitDepth: 16 }, wav24)).toBe(false)
    expect(same('/a.wav', { format: 'wav', sampleRate: 48000 }, wav24)).toBe(false)
    expect(same('/a.wav', { format: 'wav' }, float96)).toBe(false)
    expect(same('/a.wav', { format: 'aiff' }, wav24)).toBe(false)
    expect(same('/a.m4a', { format: 'alac' }, { ...mp3, codec: 'aac' })).toBe(false)
    expect(same('/a.mp3', { format: 'mp3' }, mp3)).toBe(false)
  })
})

describe('buildConvertArgs', () => {
  const args = (o: Partial<ConvertOptions>, info: AudioInfo, cover = true) => buildConvertArgs('/in.wav', '/out.tmp', options(o).format, resolveTarget(options(o), info), info, cover).join(' ')

  it('writes each format at the depth asked, with the tags', () => {
    expect(args({ format: 'wav' }, wav24)).toBe('-y -loglevel error -i /in.wav -map 0:a:0 -map_metadata 0 -c:a pcm_s24le -f wav /out.tmp')
    expect(args({ format: 'aiff' }, wav16)).toContain('-c:a pcm_s16be -write_id3v2 1 -f aiff')
    expect(args({ format: 'flac' }, wav24)).toContain('-c:a flac -sample_fmt s32 -bits_per_raw_sample 24 -f flac')
    expect(args({ format: 'alac' }, wav16)).toContain('-c:a alac -sample_fmt s16p -f ipod')
    expect(args({ format: 'mp3', bitrate: 192 }, wav24)).toContain('-c:a libmp3lame -b:a 192k -id3v2_version 3 -f mp3')
    expect(args({ format: 'aac', bitrate: 256 }, wav24)).toContain('-c:a aac -b:a 256k -f ipod')
  })

  it('keeps the cover where the format holds one, and only when asked', () => {
    expect(args({ format: 'aiff' }, wav16)).toContain('-map 0:v? -c:v copy -disposition:v attached_pic')
    expect(args({ format: 'aiff' }, wav16, false)).not.toContain('0:v?')
    expect(args({ format: 'wav' }, wav16)).not.toContain('0:v?')
  })

  it('dithers on the way down to 16-bit, with the new frequency in the same step', () => {
    expect(args({ format: 'wav', bitDepth: 16 }, wav24)).toContain('-af aresample=osf=s16:dither_method=triangular')
    expect(args({ format: 'wav', bitDepth: 16, sampleRate: 44100 }, float96)).toContain('-af aresample=44100:osf=s16:dither_method=triangular')
    expect(args({ format: 'wav', bitDepth: 16 }, wav16)).not.toContain('-af')
    expect(args({ format: 'wav', bitDepth: 24, sampleRate: 48000 }, wav24)).toContain('-ar 48000')
    expect(args({ format: 'mp3' }, float96)).toContain('-ar 48000')
  })
})

describe('planOutput', () => {
  const on = (...paths: string[]) => (path: string) => paths.includes(path)

  it('replaces with the same name and the new extension, in place when it stays', () => {
    expect(planOutput('/m/Song.wav', null, 'aiff', true, on())).toEqual({ path: '/m/Song.aiff', inPlace: false })
    expect(planOutput('/m/Song.wav', null, 'wav', true, on('/m/Song.wav'))).toEqual({ path: '/m/Song.wav', inPlace: true })
    expect(planOutput('/m/Song.WAV', null, 'wav', true, on('/m/Song.wav'))).toEqual({ path: '/m/Song.wav', inPlace: true })
    expect(planOutput('/m/Song.wav', null, 'aiff', true, on('/m/Song.aiff'))).toEqual({ conflict: '/m/Song.aiff' })
  })

  it('never overwrites with a copy: the next free name', () => {
    expect(planOutput('/m/Song.wav', null, 'aiff', false, on())).toEqual({ path: '/m/Song.aiff', inPlace: false })
    expect(planOutput('/m/Song.wav', null, 'wav', false, on('/m/Song.wav'))).toEqual({ path: '/m/Song (2).wav', inPlace: false })
    expect(planOutput('/m/Song.wav', null, 'aiff', false, on('/m/Song.aiff', '/m/Song (2).aiff'))).toEqual({ path: '/m/Song (3).aiff', inPlace: false })
    expect(planOutput('/m/My.Song.v2.wav', '/usb', 'alac', false, on())).toEqual({ path: '/usb/My.Song.v2.m4a', inPlace: false })
  })
})

describe('convertTracks', () => {
  let db: AppDatabase
  let dir: string
  let trashed: string[]
  let deps: ConvertDeps
  let id: number
  const row = () => db.prepare('SELECT path, filename, format, size FROM tracks WHERE id = ?').get(id) as { path: string; filename: string; format: string; size: number }

  beforeEach(() => {
    db = openDatabase(':memory:')
    dir = mkdtempSync(join(tmpdir(), 'mco-convert-'))
    writeFileSync(join(dir, 'Song.wav'), 'original')
    id = db
      .prepare(`INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES (?, 'Song.wav', ?, 'wav', 8, 1)`)
      .run(join(dir, 'Song.wav'), dir).lastInsertRowid as number
    trashed = []
    deps = {
      probe: async () => wav24,
      // Stands in for ffmpeg: writes the output file, which is its last argument.
      ffmpeg: async (args) => {
        writeFileSync(args[args.length - 1], 'converted!')
        return { code: 0, stderr: '' }
      },
      trash: async (path) => {
        trashed.push(path)
        rmSync(path)
      },
      rename: (from, to) => rename(from, to),
    }
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('makes a copy next to the original and leaves the track alone', async () => {
    const [result] = await convertTracks(db, deps, [id], options())
    expect(result).toMatchObject({ status: 'converted', path: join(dir, 'Song.aiff'), replaced: false })
    expect(readFileSync(join(dir, 'Song.aiff'), 'utf8')).toBe('converted!')
    expect(readFileSync(join(dir, 'Song.wav'), 'utf8')).toBe('original')
    expect(row()).toMatchObject({ path: join(dir, 'Song.wav'), format: 'wav' })
    expect(trashed).toEqual([])
  })

  it('saves in another folder, making it if needed', async () => {
    const usb = join(dir, 'usb', 'set')
    const [result] = await convertTracks(db, deps, [id], options({ folder: usb, replace: true }))
    // Replacing is only for the original's own folder.
    expect(result).toMatchObject({ status: 'converted', path: join(usb, 'Song.aiff'), replaced: false })
    expect(existsSync(join(dir, 'Song.wav'))).toBe(true)
    expect(row().path).toBe(join(dir, 'Song.wav'))
  })

  it('replaces: the track follows the new file and the original goes to the Trash', async () => {
    const [result] = await convertTracks(db, deps, [id], options({ replace: true }))
    expect(result).toMatchObject({ status: 'converted', replaced: true })
    expect(trashed).toEqual([join(dir, 'Song.wav')])
    expect(row()).toEqual({ path: join(dir, 'Song.aiff'), filename: 'Song.aiff', format: 'aiff', size: 10 })
  })

  it('replaces a file by one of the same name (another bit depth)', async () => {
    const [result] = await convertTracks(db, deps, [id], options({ format: 'wav', bitDepth: 16, replace: true }))
    expect(result).toMatchObject({ status: 'converted', replaced: true, path: join(dir, 'Song.wav') })
    expect(trashed).toEqual([join(dir, 'Song.wav')])
    expect(readFileSync(join(dir, 'Song.wav'), 'utf8')).toBe('converted!')
    expect(row()).toMatchObject({ path: join(dir, 'Song.wav'), size: 10 })
  })

  it('keeps the converted file when it cannot take the name of an original already in the Trash', async () => {
    deps.rename = async () => {
      throw new Error('EPERM')
    }
    const [result] = await convertTracks(db, deps, [id], options({ format: 'wav', bitDepth: 16, replace: true }))
    expect(result.status).toBe('failed')
    expect(result.message).toMatch(/kept next to it as Song\.wav\.[0-9a-f]+\.mcotmp/)
    expect(trashed).toEqual([join(dir, 'Song.wav')])
    const left = readdirSync(dir)
    expect(left).toHaveLength(1)
    expect(readFileSync(join(dir, left[0]), 'utf8')).toBe('converted!')
  })

  it('leaves no half-made file when a copy cannot be put in place', async () => {
    deps.rename = async () => {
      throw new Error('EPERM')
    }
    expect((await convertTracks(db, deps, [id], options()))[0].status).toBe('failed')
    expect(readdirSync(dir)).toEqual(['Song.wav'])
  })

  it('skips a replace that would change nothing, and refuses to overwrite another file', async () => {
    expect((await convertTracks(db, deps, [id], options({ format: 'wav', replace: true })))[0]).toMatchObject({ status: 'skipped' })
    writeFileSync(join(dir, 'Song.aiff'), 'someone else')
    expect((await convertTracks(db, deps, [id], options({ replace: true })))[0]).toMatchObject({ status: 'failed', message: 'Song.aiff is already there' })
    expect(readFileSync(join(dir, 'Song.aiff'), 'utf8')).toBe('someone else')
    expect(trashed).toEqual([])
  })

  it('leaves everything as it was when ffmpeg fails, with no half-written file', async () => {
    deps.ffmpeg = async (args) => {
      writeFileSync(args[args.length - 1], 'half')
      return { code: 1, stderr: 'warning\nInvalid data found when processing input\n' }
    }
    const [result] = await convertTracks(db, deps, [id], options({ replace: true }))
    expect(result).toMatchObject({ status: 'failed', message: 'Invalid data found when processing input' })
    expect(trashed).toEqual([])
    expect(row().path).toBe(join(dir, 'Song.wav'))
    expect(existsSync(join(dir, 'Song.aiff'))).toBe(false)
  })

  it("tries again without the cover when the format's writer refuses it", async () => {
    const runs: string[] = []
    deps.ffmpeg = async (args) => {
      runs.push(args.includes('0:v?') ? 'cover' : 'plain')
      if (args.includes('0:v?')) return { code: 1, stderr: 'no pictures' }
      writeFileSync(args[args.length - 1], 'converted!')
      return { code: 0, stderr: '' }
    }
    expect((await convertTracks(db, deps, [id], options()))[0].status).toBe('converted')
    expect(runs).toEqual(['cover', 'plain'])
  })

  it('reports a converted file whose original would not go to the Trash', async () => {
    deps.trash = async () => {
      throw new Error('no Trash on this volume')
    }
    const [result] = await convertTracks(db, deps, [id], options({ replace: true }))
    expect(result).toMatchObject({ status: 'converted', replaced: true })
    expect(result.message).toMatch(/Trash/)
    expect(row().path).toBe(join(dir, 'Song.aiff'))
  })

  it('converts a few files at once, in order, and never gives two of them the same name', async () => {
    // Three more tracks with the same file name in other folders, all copied into one folder.
    const ids = [id]
    for (const sub of ['b', 'c', 'd']) {
      const folder = join(dir, sub)
      mkdirSync(folder)
      writeFileSync(join(folder, 'Song.wav'), 'original')
      ids.push(db.prepare(`INSERT INTO tracks (path, filename, folder, format, size, mtime) VALUES (?, 'Song.wav', ?, 'wav', 8, 1)`).run(join(folder, 'Song.wav'), folder).lastInsertRowid as number)
    }
    let running = 0
    let most = 0
    deps.ffmpeg = async (args) => {
      most = Math.max(most, ++running)
      await new Promise((resolve) => setTimeout(resolve, 20))
      writeFileSync(args[args.length - 1], 'converted!')
      running--
      return { code: 0, stderr: '' }
    }
    const out = join(dir, 'out')
    const results = await convertTracks(db, deps, ids, options({ folder: out }))
    expect(most).toBe(3)
    expect(results.map((r) => r.trackId)).toEqual(ids)
    expect(results.every((r) => r.status === 'converted')).toBe(true)
    expect(readdirSync(out).sort()).toEqual(['Song (2).aiff', 'Song (3).aiff', 'Song (4).aiff', 'Song.aiff'])
  })

  it("doesn't convert missing or cloud-only tracks, and stops between files when asked", async () => {
    db.prepare("UPDATE tracks SET cloud_status = 'cloud_only' WHERE id = ?").run(id)
    expect((await convertTracks(db, deps, [id], options()))[0]).toMatchObject({ status: 'failed' })
    db.prepare("UPDATE tracks SET cloud_status = 'local', present = 0 WHERE id = ?").run(id)
    expect((await convertTracks(db, deps, [id, 999], options())).map((r) => r.status)).toEqual(['failed', 'failed'])
    db.prepare('UPDATE tracks SET present = 1 WHERE id = ?').run(id)
    const progress: number[] = []
    let asked = 0
    const results = await convertTracks(db, deps, [id, id, id], options(), (p) => progress.push(p.done), () => asked++ >= 1, 1)
    expect(results).toHaveLength(1)
    expect(progress).toEqual([0, 1])
  })
})
