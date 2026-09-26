---
status: accepted
date: 2026-09-24
---
# 0013. Ad-hoc signed releases and a custom GitHub Releases updater

## Context
MCO doesn't use the paid Apple Developer Program, so it can't be Developer ID signed or notarized.
Unsigned downloads on Apple silicon are reported as "damaged". `electron-updater`'s macOS path
(Squirrel.Mac) rejects ad-hoc signed updates.

## Decision
- Releases are **ad-hoc signed** (`identity: "-"`), built by `.github/workflows/release.yml` as an
  arm64 DMG and ZIP. Users allow the app once via **Open Anyway**. `mac.hardenedRuntime` stays false
  (hardened runtime + ad-hoc breaks Electron's library loading).
- `electron/main/updater.ts` checks GitHub Releases (about 20 s after launch and every 6 h),
  downloads `MCO-<version>-arm64.zip`, verifies it and swaps the app in place. Dev and BETA builds
  never update.
- Every push to `main` bumps the patch version and tags it ([ADR 0018](0018-ci-bump-and-deploy-on-every-merge.md)).

## Consequences
- No yearly fee; one-time "Open Anyway" per Mac.
- Every release must keep the ZIP asset. Drafts and pre-releases are ignored by the updater.
- See [releases & updates](../features/releases-and-updates.md).
