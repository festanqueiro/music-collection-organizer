---
status: accepted
date: 2026-10-08
---
# 0063. Graphify's code graph is an optional dev tool, built per machine

## Context
[Graphify](https://github.com/Graphify-Labs/graphify) (Apache-2.0) parses a repository with
tree-sitter into a graph of files, functions and their imports and calls, which an AI assistant
can query (`graphify query / path / explain`) instead of searching file by file. The user asked
for it in this project. It is a development tool: nothing of it ships in MCO.

Its installer (`graphify install --project`) does three things: it writes the `/graphify` skill
under `.claude/skills/graphify/`, adds a section to `CLAUDE.md`, and registers `PreToolUse`
hooks in `.claude/settings.json` that run `graphify hook-guard` before every search and file
read.

## Decision
- **In the repo**: the skill (`.claude/skills/graphify/`, `.claude/CLAUDE.md`), the `CLAUDE.md`
  section (worded so it only applies when `graphify-out/graph.json` exists) and a
  `.graphifyignore` (the lock file, images, website assets).
- **Not in the repo**: `graphify-out/` (git-ignored; 2.6 MB of `graph.json` that changes with
  every commit) and the hooks. Each machine installs the tool and builds its own graph.
- **Built from the code only, with no AI calls**:
  `graphify extract . --code-only --no-cluster && graphify cluster-only . --no-label`. The docs
  aren't in the graph, and its communities are numbered, not named.
- The hooks stay out of the shared `.claude/settings.json`: on a machine without `graphify` they
  would fail before every tool call. Whoever wants them runs `graphify claude install` locally.

## Alternatives considered
- **Commit `graph.json` and `GRAPH_REPORT.md`** (Graphify's team setup): useful for several
  people sharing one graph; here it would be a large generated file in every diff.
- **The full `/graphify .` pass**, docs included: it sends the docs to the assistant's model,
  against this project's rule of keeping credit usage down. Can be run by hand when wanted.
- **The always-on hooks in the shared settings**: see above.

## Consequences
- First build on 2026-10-08 (Graphify 0.9.80, commit `65c6e4c`): 269 code files, 1,866 nodes,
  5,267 edges, 91 communities, a few seconds, no tokens.
- The graph goes stale as the code changes: `graphify update .` after changes, or
  `graphify hook install` for a local git hook that does it on commit.
- Links that aren't in the code's syntax aren't in the graph: the renderer reaches the main
  process over IPC channel names, so `graphify path "ConvertDialog" "convertTracks"` finds
  nothing.
- Graphify logs each query (the question, not the answer) to `~/.cache/graphify-queries.log`;
  `GRAPHIFY_QUERY_LOG_DISABLE=1` turns that off.
