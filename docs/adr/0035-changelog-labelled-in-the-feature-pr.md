---
status: accepted
date: 2026-09-26
---
# 0035. Keep a CHANGELOG, and label its section with the version inside the feature PR

## Context
`CHANGELOG.md` was added on 2026-09-26. Every push to `main` bumps the version
([ADR 0018](0018-ci-bump-and-deploy-on-every-merge.md)), so relabelling the changelog after a merge
needs another PR (with `[skip ci]` to avoid another bump) — which happened twice (#65, #68).

## Decision
User-facing changes go into `CHANGELOG.md`'s **Unreleased** section as they're made (Added / Changed
/ Fixed). When a PR is going to be released, its changelog section is labelled with the upcoming
version (the next patch number) inside that PR, before it's merged. `docs/log/changelog.md` points to
the root file rather than duplicating it.

## Consequences
- The root `CHANGELOG.md` stays the single source (GitHub shows it; PRs edit it).
