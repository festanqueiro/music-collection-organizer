---
status: accepted
date: 2026-10-02
supersedes: the Pages part of 0018 and 0054 (a workflow each)
---
# 0057. Deploy the website and the Cast receiver to Pages together

## Context
The repo has one GitHub Pages site. The Cast receiver lives at `/cast-receiver/` (the URL
registered for MCO's Cast app, [ADR 0018](0018-ci-bump-and-deploy-on-every-merge.md)); the website
([ADR 0054](0054-website-captured-from-the-real-app.md)) went at the root, with its own workflow.
A Pages deploy uploads one artifact that **replaces the whole site**. On the 1.0.53 merge both
workflows ran in the same `pages` concurrency group: the website's run cancelled the receiver's,
deployed `website/` alone, and `/cast-receiver/` went 404 — casting broke for every installed
version.

## Decision
One workflow, `.github/workflows/pages.yml`, on every push to `main`: build the receiver into
`dist-pages/cast-receiver/`, copy `website/` (minus `capture/`) to `dist-pages/`, check both
`index.html`s are there, deploy `dist-pages`. `cast-receiver.yml` is gone.

## Alternatives considered
- **The website in its own repo** (`festanqueiro.github.io` or another project page): separate
  deploys, but a second repo to keep, and the captures live with the app.
- **Publishing from a `gh-pages` branch** that each workflow writes its folder into: no clobbering,
  but a branch of build output and the old Pages source.

## Consequences
- The website is redeployed on every merge (cheap) and the receiver is never left out.
- Anything else that ever goes on Pages must join this workflow.
