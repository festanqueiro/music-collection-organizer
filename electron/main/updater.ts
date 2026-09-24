import { spawn, execFile } from 'node:child_process'
import { createWriteStream, accessSync, constants, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import type { UpdateState } from '../../src/types'

const execFileAsync = promisify(execFile)

// Self-updater for the GitHub Releases builds.
//
// electron-updater isn't usable here: on macOS it hands the update to
// Squirrel.Mac, which rejects any update whose code signature doesn't
// match the running app's designated requirement — and ad-hoc signatures
// (see docs/releasing.md) have no stable identity, so every update would
// fail. Instead:
//   1. check  — ask the GitHub API for the latest release, compare versions
//   2. download — fetch the release's -<arch>.zip in the main process
//      (a file downloaded by the app itself gets no quarantine flag, so
//      the new version opens without Gatekeeper's "Open Anyway" step)
//   3. verify — unzip with ditto, check the bundle's version and that
//      its signature is intact (codesign --verify)
//   4. install — a detached shell script waits for this process to exit,
//      swaps the .app bundles (restoring the old one if the swap fails),
//      and reopens the app.

export const RELEASES_API_URL =
  'https://api.github.com/repos/festanqueiro/music-collection-organizer/releases/latest'

export interface ReleaseInfo {
  version: string
  notesUrl: string
  zipUrl: string
  zipSize: number
}

// Numeric dotted-version compare ("1.0.10" > "1.0.9"); a leading "v" and
// any pre-release/build suffix are ignored.
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .replace(/^v/i, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((n) => parseInt(n, 10) || 0)
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

// Picks out what the updater needs from GitHub's "latest release" JSON.
// Drafts and pre-releases never count, and a release without a ZIP for
// this architecture is treated as "nothing to install".
export function parseLatestRelease(json: unknown, arch: string): ReleaseInfo | null {
  if (!json || typeof json !== 'object') return null
  const release = json as {
    tag_name?: unknown
    html_url?: unknown
    draft?: unknown
    prerelease?: unknown
    assets?: unknown
  }
  if (release.draft || release.prerelease) return null
  if (typeof release.tag_name !== 'string' || typeof release.html_url !== 'string') return null
  if (!Array.isArray(release.assets)) return null
  const zip = release.assets.find(
    (a): a is { name: string; browser_download_url: string; size: number } =>
      !!a &&
      typeof a.name === 'string' &&
      a.name.endsWith(`-${arch}.zip`) &&
      typeof a.browser_download_url === 'string'
  )
  if (!zip) return null
  return {
    version: release.tag_name.replace(/^v/i, ''),
    notesUrl: release.html_url,
    zipUrl: zip.browser_download_url,
    zipSize: typeof zip.size === 'number' ? zip.size : 0,
  }
}

// Only GitHub pages for this repo are ever opened from the updater UI.
export function isTrustedReleaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'github.com' &&
      parsed.pathname.startsWith('/festanqueiro/music-collection-organizer/')
    )
  } catch {
    return false
  }
}

// ".../MCO.app/Contents/MacOS/MCO" → ".../MCO.app"
export function appBundlePathFromExecPath(execPath: string): string | null {
  const bundle = resolve(execPath, '..', '..', '..')
  return bundle.endsWith('.app') ? bundle : null
}

// Why this install can't replace itself, or null if it can. A copy still
// running from the DMG or from a quarantined download location runs
// "translocated" (from a read-only random path), and a copy installed by
// another user may not be writable — both get the "download it yourself"
// fallback instead.
export function installBlocker(appPath: string | null, canWrite: (path: string) => boolean): string | null {
  if (!appPath) return 'MCO is not running from an app bundle.'
  if (appPath.includes('/AppTranslocation/') || appPath.startsWith('/Volumes/')) {
    return 'Move MCO to your Applications folder to enable automatic updates.'
  }
  if (!canWrite(dirname(appPath)) || !canWrite(appPath)) {
    return "MCO can't replace itself where it's installed (no write permission)."
  }
  return null
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

// Waits (up to ~30 s) for the running app to exit, swaps the bundles, and
// reopens whichever version ended up in place — the new one, or the old
// one restored if moving the new one in failed.
export function buildSwapScript(opts: { pid: number; appPath: string; newAppPath: string }): string {
  const app = shellQuote(opts.appPath)
  const next = shellQuote(opts.newAppPath)
  const old = shellQuote(`${opts.appPath}.mco-update-old`)
  return `#!/bin/sh
i=0
while kill -0 ${opts.pid} 2>/dev/null; do
  sleep 0.2
  i=$((i + 1))
  if [ "$i" -gt 150 ]; then exit 1; fi
done
rm -rf ${old}
if mv ${app} ${old}; then
  if mv ${next} ${app}; then
    rm -rf ${old}
  else
    mv ${old} ${app}
  fi
fi
open ${app}
`
}

type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>

export interface UpdaterDeps {
  currentVersion: string
  arch: string
  // null when updates are switched off for this build entirely (dev,
  // BETA); the string is shown to the user.
  disabledReason: string | null
  appPath: string | null
  tempDir: string
  fetch: FetchLike
  onState: (state: UpdateState) => void
  quit: () => void
}

export class Updater {
  private state: UpdateState
  private release: ReleaseInfo | null = null
  private busy = false

  constructor(private readonly deps: UpdaterDeps) {
    this.state = { status: deps.disabledReason ? 'disabled' : 'idle', currentVersion: deps.currentVersion }
    if (deps.disabledReason) this.state.error = deps.disabledReason
  }

  getState(): UpdateState {
    return this.state
  }

  getReleasePageUrl(): string | null {
    return this.release?.notesUrl ?? null
  }

  private setState(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.deps.onState(this.state)
  }

  async check(): Promise<UpdateState> {
    if (this.state.status === 'disabled' || this.busy) return this.state
    this.busy = true
    this.setState({ status: 'checking', error: undefined })
    try {
      const response = await this.deps.fetch(RELEASES_API_URL, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MCO-updater' },
      })
      if (response.status === 404) {
        // No published release yet.
        this.setState({ status: 'up-to-date', checkedAt: new Date().toISOString() })
        return this.state
      }
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`)
      const release = parseLatestRelease(await response.json(), this.deps.arch)
      const checkedAt = new Date().toISOString()
      if (!release || compareVersions(release.version, this.deps.currentVersion) <= 0) {
        this.setState({ status: 'up-to-date', checkedAt, latestVersion: release?.version })
        return this.state
      }
      this.release = release
      const blocker = installBlocker(this.deps.appPath, canWrite)
      this.setState({
        status: 'available',
        checkedAt,
        latestVersion: release.version,
        canInstall: blocker === null,
        installBlocker: blocker ?? undefined,
      })
    } catch (err) {
      this.setState({ status: 'error', error: `Couldn't check for updates: ${messageOf(err)}` })
    } finally {
      this.busy = false
    }
    return this.state
  }

  async install(): Promise<void> {
    const release = this.release
    const appPath = this.deps.appPath
    if (!release || !appPath || this.busy || this.state.status !== 'available' || !this.state.canInstall) return
    this.busy = true
    const workDir = join(this.deps.tempDir, `mco-update-${release.version}`)
    try {
      rmSync(workDir, { recursive: true, force: true })
      mkdirSync(workDir, { recursive: true })

      this.setState({ status: 'downloading', progress: 0, error: undefined })
      const zipPath = join(workDir, 'update.zip')
      await this.download(release, zipPath)

      this.setState({ status: 'installing', progress: undefined })
      const extractDir = join(workDir, 'extracted')
      await execFileAsync('/usr/bin/ditto', ['-x', '-k', zipPath, extractDir])
      const bundleName = readdirSync(extractDir).find((name) => name.endsWith('.app'))
      if (!bundleName) throw new Error('the download contains no app')
      const newAppPath = join(extractDir, bundleName)

      const { stdout } = await execFileAsync('/usr/bin/plutil', [
        '-extract',
        'CFBundleShortVersionString',
        'raw',
        join(newAppPath, 'Contents', 'Info.plist'),
      ])
      if (stdout.trim() !== release.version) {
        throw new Error(`the download is version ${stdout.trim()}, expected ${release.version}`)
      }
      await execFileAsync('/usr/bin/codesign', ['--verify', '--deep', '--strict', newAppPath])
      // Belt and braces: nothing we downloaded should be quarantined, but
      // if it somehow is, the relaunch would hit Gatekeeper's prompt.
      await execFileAsync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', newAppPath]).catch(() => {})

      const scriptPath = join(workDir, 'swap.sh')
      writeFileSync(scriptPath, buildSwapScript({ pid: process.pid, appPath, newAppPath }), { mode: 0o755 })
      const child = spawn('/bin/sh', [scriptPath], { detached: true, stdio: 'ignore' })
      child.unref()
      this.deps.quit()
    } catch (err) {
      rmSync(workDir, { recursive: true, force: true })
      this.setState({ status: 'error', error: `Update failed: ${messageOf(err)}`, progress: undefined })
    } finally {
      this.busy = false
    }
  }

  private async download(release: ReleaseInfo, zipPath: string): Promise<void> {
    const response = await this.deps.fetch(release.zipUrl, { headers: { 'User-Agent': 'MCO-updater' } })
    if (!response.ok || !response.body) throw new Error(`download failed (${response.status})`)
    const total = Number(response.headers.get('content-length')) || release.zipSize
    let received = 0
    let lastReported = 0
    const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
    body.on('data', (chunk: Buffer) => {
      received += chunk.length
      const progress = total ? Math.min(1, received / total) : 0
      if (progress - lastReported >= 0.01) {
        lastReported = progress
        this.setState({ progress })
      }
    })
    await pipeline(body, createWriteStream(zipPath))
    if (total && received < total) throw new Error('download was incomplete')
  }
}

function canWrite(path: string): boolean {
  try {
    accessSync(path, constants.W_OK)
    return true
  } catch {
    return false
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
