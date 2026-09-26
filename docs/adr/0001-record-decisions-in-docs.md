---
status: accepted
date: 2026-09-26
---
# 0001. Record decisions, features and findings in `docs/`

## Context
MCO grew fast (v1 on 2026-08-20, 42 releases by 2026-09-26), mostly in long working sessions with an
AI agent. The reasons behind choices lived in commit messages, PR descriptions and code comments, and
were hard to find again — e.g. why speakers skip MCO's Cast app, or why tag writes never re-encode.

## Decision
Keep a vault in `docs/`, laid out like [GLUE's `vault/`](https://github.com/joaopmanso/glue/tree/main/vault):
`product/` (vision, roadmap, glossary), `features/` (one file per feature, from a template), `adr/`
(numbered decisions, never renumbered; a changed decision gets a new ADR that supersedes the old),
`research/` (sourced findings) and `log/` (changelog and dated write-ups). Plain Markdown with
relative links, readable on GitHub and as an Obsidian vault.

## Alternatives considered
- Keep documenting only in commit messages and code comments: too scattered to answer "why".
- A wiki: lives outside the repo, drifts from the code, and agents working in the repo don't see it.

## Consequences
- Every change updates its feature page, the changelog, and the roadmap if a milestone moves; every
  new architectural choice gets an ADR (see [CLAUDE.md](../../CLAUDE.md)).
- The old design specs and plans moved into `log/` as dated, historical documents.
