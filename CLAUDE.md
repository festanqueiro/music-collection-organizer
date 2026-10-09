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
macOS first; releases also ship an untested, unsigned Windows installer
(ADR 0049) — in the renderer, handle file paths with `src/paths.ts`, never
`split('/')`.

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
  before considering a change done. `tsc` also fails on unused imports,
  variables and parameters (`noUnusedLocals`, `noUnusedParameters`).
- For anything a unit test can't see — menus, popovers, the player — run
  `npm run test:app`: the built app driven with Playwright on the demo
  collection (`tests/app/smoke.mjs`; needs `npm i -g playwright`; a window
  opens; not in CI). Add a check there with the feature.
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
  - Docs-only PRs get `[skip ci]` in the title (no version bump) — and in
    the commit message too: a one-commit PR's squash merge takes the
    commit's message, not the PR title (1.0.50 was bumped that way). Never put
    `[skip ci]` in a commit on a feature branch: the squash-merge message
    includes it and skips every workflow on main (version bump, receiver
    deploy).
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

## Website

- `website/` is the GitHub Pages marketing page. `.github/workflows/pages.yml`
  deploys it from `main` **together with the Cast receiver** (at
  `/cast-receiver/`): a Pages deploy replaces the whole site, so never give
  either its own Pages workflow (ADR 0057). Its screenshots and clips come
  from the real app: `npm run site:capture` (Linux or macOS; see
  `website/capture/README.md`).
  After a visible UI change, re-run it and commit `website/assets/`.

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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

Setup, once per machine ([ADR 0063](docs/adr/0063-graphify-as-an-optional-dev-tool.md)): install the
`graphifyy` package (PyPI, double y) so `graphify` is on the PATH, then build the graph from the
code only, with no AI calls:
`graphify extract . --code-only --no-cluster && graphify cluster-only . --no-label`.
`graphify-out/` is git-ignored. Without it, or without the tool, ignore the rules above and read
the code as usual. Graphify's always-on hooks (`graphify claude install`) are not in the shared
`.claude/settings.json` on purpose: they'd fail on a machine without the tool.

Keeping it current:
- `graphify hook install` (once per clone) rebuilds the graph after every commit and branch
  switch, in the background. It also writes a `.gitattributes` for a `graph.json` merge driver:
  delete it, the graph isn't tracked.
- A `git pull` doesn't fire the hook. **When preparing a release**, after the PR is merged and
  `main` is pulled, run `graphify update .` so the graph matches what was released.
- The skill in `.claude/skills/graphify/` is a copy from Graphify 0.9.80
  (`.graphify_version`). To update it: upgrade the `graphifyy` package, run
  `graphify install --project --platform claude`, discard what it writes to
  `.claude/settings.json` (its hooks, see above) and delete `.gitattributes`, then commit the
  skill's files.
