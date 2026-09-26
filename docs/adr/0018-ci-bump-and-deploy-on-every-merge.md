---
status: accepted
date: 2026-09-26
---
# 0018. Every merge to `main` bumps the version and deploys the Cast receiver

## Context
Releases should be one click, and the TV must always run the receiver that matches `main`.

## Decision
- `.github/workflows/version-bump.yml`: every push to `main` bumps the patch version and tags it
  (commits containing `[skip ci]` don't trigger it).
- `.github/workflows/cast-receiver.yml`: every merge deploys `cast-receiver/` to GitHub Pages
  (since 2026-09-26, PR #53; before that it was manual).
- Releases are cut by hand with the Release workflow ([ADR 0013](0013-github-releases-updater-ad-hoc-signing.md)).

## Consequences
- Docs-only PRs should carry `[skip ci]` in their title to avoid a pointless version bump.
- The changelog section is labelled with the upcoming version inside the feature PR
  ([ADR 0035](0035-changelog-labelled-in-the-feature-pr.md)).
