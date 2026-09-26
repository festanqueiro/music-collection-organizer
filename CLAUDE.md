# CLAUDE.md

Project instructions for Claude Code working in this repo (MCO — Music Collection Organizer).

## Stack

Electron + `electron-vite` + React + TypeScript. `node:sqlite` (Node's built-in
synchronous SQLite, no native module to compile) for the DB, `electron-store`
for app config, `zustand` for renderer state, Vitest for tests, `ffmpeg-static`
for audio decode/transcode, `essentia.js` (WASM) for BPM/key analysis,
`three` for the full-screen visualizer, whose themes and engine come from the
[`threejs-visualisers`](https://github.com/festanqueiro/threejs-visualisers)
package (a GitHub dependency pinned to a tag — change themes there, tag a
release, then bump the tag in `package.json`).
macOS only for now.

## Working preferences

- **Plugins**: `superpowers` and `code-review` are disabled in
  `.claude/settings.json` to keep credit usage down — implement features
  directly (read the relevant files, make the change, verify with `tsc`/tests
  yourself) rather than dispatching subagent-driven-development loops or
  multi-agent review passes for routine work. Re-enable in that file if a
  task genuinely calls for it.
- Prefer small, focused commits with clear messages; open one PR per logical
  batch of work rather than one PR per tiny change.
- Always verify with `npx tsc -b --noEmit` (see gotcha below) and `npm test`
  before considering a change done.
- **Document as you go, in the vault (`docs/`, see `docs/README.md`)**:
  - every user-facing change → `CHANGELOG.md`'s **Unreleased** section (Added /
    Changed / Fixed), in plain words; label it with the upcoming version inside
    the PR that will be released, before it's merged (ADR 0035);
  - the feature's page in `docs/features/` (behaviour, how it works, tests,
    limits; bump `updated:`);
  - every architectural choice → a new ADR in `docs/adr/` (never renumber; a
    changed decision gets a new ADR that supersedes the old one), and add it to
    the ADR index in `docs/README.md`;
  - measurements and probes → `docs/research/`; a session with notable
    findings or bugs → a dated write-up in `docs/log/`; milestones →
    `docs/product/roadmap.md`.
  - Docs-only PRs get `[skip ci]` in the title (no version bump).
- After finishing a change (feature, fix, tweak — whatever the user asked
  for), run `npm run dist:beta` so the BETA app on disk is rebuilt and
  reinstalled with the change, ready for the user to test immediately
  without asking.

## Key gotchas

- **Don't run `prettier --write` on whole files** — the repo isn't
  prettier-formatted, so it rewrites hundreds of unrelated lines.

- **Type-check command**: use `npx tsc -b --noEmit`, not plain `tsc --noEmit`
  — this repo's solution-style `tsconfig.json` uses project references, and
  plain `tsc --noEmit` is a silent no-op against it.
- **Electron binary install**: a fresh `npm install` sometimes leaves
  `node_modules/electron` without an extracted `dist/Electron.app`. Fix with
  `cd node_modules/electron && node install.js`.
- **ffmpeg-static inside a packaged app**: its resolved binary path points at
  the *packed* virtual path inside `app.asar`, which `child_process.spawn()`
  can't execute (only `fs.*` calls get Electron's automatic asar-unpack path
  redirection). Always resolve the path via `electron/main/ffmpegPath.ts`'s
  `resolveFfmpegPath()`, never import `ffmpeg-static`'s default export
  directly and spawn it.
- **AIFF playback**: Chromium's `<audio>` element can't decode AIFF. Files
  are transcoded to FLAC on demand and cached (`electron/main/audioTranscode.ts`)
  before being served over the `media://` protocol.

## Conventions

- IPC handlers that mutate tag state return the post-write state (e.g.
  `TrackTagIds`) so the renderer store patches locally instead of reloading
  everything — see `src/state/store.ts`'s `setTrackTags` helper.
- Batch/import tag writes are additive-only (`INSERT OR IGNORE`, never
  DELETE+INSERT) — see `electron/main/tags.ts`.
- Player-related global state (volume, effects settings, MIDI mappings,
  which track is loaded) lives in the zustand store, not component-local
  state, since the player is independent of row selection/details.

## Packaging

- `npm run dist` — builds and packages the production app (unsigned,
  local-only).
- `npm run dist:beta` — builds, packages, and installs a separate
  "MCO - Music Collection Organizer BETA.app" alongside production, with
  its own bundle id and its own `userData` directory (separate DB/config/
  backups) via `-c.extraMetadata.name`. Never touches the production app.
- `npm run dist:release` — ad-hoc signed (free, no Apple Developer ID,
  not notarized) arm64 DMG/ZIP; normally run by the manual
  `.github/workflows/release.yml`, which publishes a GitHub release.
  Users see macOS's "could not verify" warning once and use "Open
  Anyway". Keep `mac.hardenedRuntime` false while ad-hoc signing (hardened
  runtime + ad-hoc breaks Electron's library loading). See
  `docs/features/releases-and-updates.md`.
- **Auto-updater** (`electron/main/updater.ts`): a custom GitHub Releases
  updater, not `electron-updater` (Squirrel.Mac rejects ad-hoc signed
  updates). It installs the release's `MCO-<version>-arm64.zip`, so
  releases must keep that asset. Dev and BETA builds never update.
- `.github/workflows/version-bump.yml` bumps `package.json`'s patch version
  and tags it on every push to `main`.
