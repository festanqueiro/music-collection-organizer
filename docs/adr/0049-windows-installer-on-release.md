---
status: accepted
date: 2026-09-28
---
# 0049. Build an unsigned Windows installer with every release, without auto-update

## Context
MCO was macOS only ([ADR 0002](0002-electron-react-typescript.md)). Nearly all of it is portable:
Electron, `node:sqlite`, essentia.js (WASM), Web Audio, three.js, Cast. What wasn't: `ffmpeg-static`
downloads the ffmpeg for the OS that runs `npm install`, so a Windows build has to be made on Windows;
the renderer split paths on `/`; cloud-only detection reads `stat.blocks`; the mic permission prompt
(`systemPreferences.askForMediaAccess`) exists only on macOS; and the updater
([ADR 0013](0013-github-releases-updater-ad-hoc-signing.md)) replaces a `.app` with `ditto`, `plutil` and
`codesign`.

## Decision
- The Release workflow gets a **Windows job** (`windows-latest`) that type-checks and builds an NSIS
  installer, `MCO-<version>-win-x64-setup.exe` (`npm run dist:release:win`), and hands it to the macOS
  job, which publishes it with the DMG and ZIP. A `publish` input off builds both without releasing.
- It's **unsigned**: no code-signing certificate, so Windows SmartScreen warns once ("More info →
  Run anyway"), like the Mac's "Open Anyway".
- **No auto-update on Windows** for now: the updater stays macOS-only (it already says so on other
  platforms); Windows users install a new version over the old one.
- The code handles both path styles: `src/paths.ts` (separator-aware base name, parent, "inside this
  folder") in the renderer; `node:path` in the main process as before. A missing block count means
  "local"; the mic prompt is skipped off macOS.

## Alternatives considered
- Cross-building the Windows app on the macOS runner: it would bundle the macOS ffmpeg, and setting the
  `.exe` icon needs Wine.
- Signing (an OV/EV certificate or Azure Trusted Signing): costs money and an identity check; not worth
  it before anyone uses the Windows build.
- electron-updater's NSIS updates: works unsigned on Windows, but it's a second updater to keep next to
  the custom one; later, if Windows users want it.

## Consequences
- Releases take as long as the slower of the two jobs, and a Windows build failure blocks the release.
- The Windows build isn't tested by hand: only type-checked and built in CI. Tests run on macOS only.
- Cloud-only detection on Windows (OneDrive placeholders) depends on what Node reports as `blocks`
  there — [UNVERIFIED].
- Code that handles file paths in the renderer must use `src/paths.ts`, not `split('/')`.
