import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { UpdateState } from '../../src/types'
import {
  Updater,
  compareVersions,
  parseLatestRelease,
  isTrustedReleaseUrl,
  appBundlePathFromExecPath,
  installBlocker,
  buildSwapScript,
} from './updater'

const release = (overrides: Record<string, unknown> = {}) => ({
  tag_name: 'v1.2.0',
  html_url: 'https://github.com/festanqueiro/music-collection-organizer/releases/tag/v1.2.0',
  draft: false,
  prerelease: false,
  assets: [
    { name: 'MCO-1.2.0-arm64.dmg', browser_download_url: 'https://example.com/a.dmg', size: 10 },
    { name: 'MCO-1.2.0-arm64.zip', browser_download_url: 'https://example.com/a.zip', size: 20 },
  ],
  ...overrides,
})

describe('compareVersions', () => {
  it('compares numerically, ignoring a leading v', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1)
    expect(compareVersions('v1.0.9', '1.0.10')).toBe(-1)
    expect(compareVersions('1.0.26', 'v1.0.26')).toBe(0)
    expect(compareVersions('2.0', '1.9.9')).toBe(1)
  })
})

describe('parseLatestRelease', () => {
  it('picks the ZIP for this architecture', () => {
    expect(parseLatestRelease(release(), 'arm64')).toEqual({
      version: '1.2.0',
      notesUrl: 'https://github.com/festanqueiro/music-collection-organizer/releases/tag/v1.2.0',
      zipUrl: 'https://example.com/a.zip',
      zipSize: 20,
    })
  })

  it('ignores drafts, pre-releases, other architectures, and junk', () => {
    expect(parseLatestRelease(release({ draft: true }), 'arm64')).toBeNull()
    expect(parseLatestRelease(release({ prerelease: true }), 'arm64')).toBeNull()
    expect(parseLatestRelease(release(), 'x64')).toBeNull()
    expect(parseLatestRelease({ message: 'Not Found' }, 'arm64')).toBeNull()
    expect(parseLatestRelease(null, 'arm64')).toBeNull()
  })
})

describe('isTrustedReleaseUrl', () => {
  it('only allows this repo on github.com over https', () => {
    expect(isTrustedReleaseUrl('https://github.com/festanqueiro/music-collection-organizer/releases')).toBe(true)
    expect(isTrustedReleaseUrl('https://github.com/someone-else/repo/releases')).toBe(false)
    expect(isTrustedReleaseUrl('http://github.com/festanqueiro/music-collection-organizer/x')).toBe(false)
    expect(isTrustedReleaseUrl('https://evil.example/festanqueiro/music-collection-organizer/')).toBe(false)
    expect(isTrustedReleaseUrl('not a url')).toBe(false)
  })
})

describe('appBundlePathFromExecPath / installBlocker', () => {
  it('finds the .app bundle', () => {
    expect(appBundlePathFromExecPath('/Applications/MCO.app/Contents/MacOS/MCO')).toBe('/Applications/MCO.app')
    expect(appBundlePathFromExecPath('/usr/local/bin/electron')).toBeNull()
  })

  it('blocks translocated, DMG-mounted, and read-only installs', () => {
    const writable = () => true
    expect(installBlocker('/Applications/MCO.app', writable)).toBeNull()
    expect(installBlocker('/private/var/folders/x/AppTranslocation/y/d/MCO.app', writable)).toMatch(/Applications/)
    expect(installBlocker('/Volumes/MCO 1.0/MCO.app', writable)).toMatch(/Applications/)
    expect(installBlocker('/Applications/MCO.app', () => false)).toMatch(/permission/)
    expect(installBlocker(null, writable)).toMatch(/bundle/)
  })
})

describe('buildSwapScript', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'swap-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  // Runs the real script with a fake `open` on PATH that records what it
  // was asked to open.
  function runScript(script: string): string {
    const bin = join(dir, 'bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'open'), `#!/bin/sh\necho "$1" > "${join(dir, 'opened')}"\n`)
    chmodSync(join(bin, 'open'), 0o755)
    const scriptPath = join(dir, 'swap.sh')
    writeFileSync(scriptPath, script)
    const result = spawnSync('/bin/sh', [scriptPath], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })
    expect(result.status).toBe(0)
    return readFileSync(join(dir, 'opened'), 'utf-8').trim()
  }

  it('waits for the app to exit, swaps the bundles, and reopens the app', () => {
    // Paths with spaces and a quote, like "MCO - Music Collection Organizer.app".
    const appPath = join(dir, "MCO - It's.app")
    const newAppPath = join(dir, 'new', 'MCO.app')
    mkdirSync(appPath)
    writeFileSync(join(appPath, 'version'), 'old')
    mkdirSync(newAppPath, { recursive: true })
    writeFileSync(join(newAppPath, 'version'), 'new')

    // Stand-in for the quitting app: an orphaned `sleep` (reparented to
    // init, so it's reaped when it exits — a direct child would linger as
    // a zombie while spawnSync blocks the event loop, and `kill -0` still
    // sees zombies).
    const pid = Number(spawnSync('/bin/sh', ['-c', 'sleep 0.5 >/dev/null 2>&1 & echo $!']).stdout.toString().trim())
    const started = Date.now()
    const opened = runScript(buildSwapScript({ pid, appPath, newAppPath }))

    expect(Date.now() - started).toBeGreaterThanOrEqual(300)
    expect(readFileSync(join(appPath, 'version'), 'utf-8')).toBe('new')
    expect(existsSync(`${appPath}.mco-update-old`)).toBe(false)
    expect(opened).toBe(appPath)
  })

  it('restores the old app if the new one cannot be moved in', () => {
    const appPath = join(dir, 'MCO.app')
    mkdirSync(appPath)
    writeFileSync(join(appPath, 'version'), 'old')
    const opened = runScript(buildSwapScript({ pid: 999999, appPath, newAppPath: join(dir, 'missing.app') }))
    expect(readFileSync(join(appPath, 'version'), 'utf-8')).toBe('old')
    expect(opened).toBe(appPath)
  })
})

describe('Updater.check', () => {
  function makeUpdater(response: { status: number; json?: unknown }, overrides: Partial<ConstructorParameters<typeof Updater>[0]> = {}) {
    const states: UpdateState[] = []
    const updater = new Updater({
      currentVersion: '1.1.0',
      arch: 'arm64',
      disabledReason: null,
      appPath: '/Applications/MCO.app',
      tempDir: tmpdir(),
      fetch: async () =>
        ({
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          json: async () => response.json,
        }) as Response,
      onState: (s) => states.push(s),
      quit: () => {},
      ...overrides,
    })
    return { updater, states }
  }

  it('reports a newer release as available', async () => {
    const { updater, states } = makeUpdater({ status: 200, json: release() })
    const state = await updater.check()
    expect(states[0].status).toBe('checking')
    expect(state.status).toBe('available')
    expect(state.latestVersion).toBe('1.2.0')
    expect(updater.getReleasePageUrl()).toMatch(/v1\.2\.0$/)
  })

  it('reports up to date when the release is not newer', async () => {
    const { updater } = makeUpdater({ status: 200, json: release({ tag_name: 'v1.1.0' }) })
    expect((await updater.check()).status).toBe('up-to-date')
  })

  it('treats "no releases yet" (404) as up to date', async () => {
    const { updater } = makeUpdater({ status: 404 })
    expect((await updater.check()).status).toBe('up-to-date')
  })

  it('reports errors', async () => {
    const { updater } = makeUpdater({ status: 500 })
    const state = await updater.check()
    expect(state.status).toBe('error')
    expect(state.error).toMatch(/500/)
  })

  it('never checks when disabled', async () => {
    let called = false
    const { updater } = makeUpdater(
      { status: 200, json: release() },
      {
        disabledReason: 'BETA builds do not update themselves.',
        fetch: async () => {
          called = true
          return {} as Response
        },
      }
    )
    const state = await updater.check()
    expect(state.status).toBe('disabled')
    expect(called).toBe(false)
  })
})
