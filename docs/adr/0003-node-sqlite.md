---
status: accepted
date: 2026-08-20
---
# 0003. Use Node's built-in `node:sqlite` for the database

## Context
The v1 design used `better-sqlite3`. Its native binding must be rebuilt against Electron's Node ABI
on every install (`electron-rebuild`), and that build failed on the development machine's Xcode
Command Line Tools (a libc++/V8-header incompatibility unrelated to MCO). The app couldn't launch.

## Decision
Use `node:sqlite` (`DatabaseSync`), built into the Node that Electron ships — no native module, no
rebuild. Transactions go through a small `runInTransaction(db, fn)` wrapper (manual
BEGIN/COMMIT/ROLLBACK), since `node:sqlite` has no `db.transaction()` helper.

## Alternatives considered
- Keep `better-sqlite3` and fix the toolchain: fragile, and every contributor would hit it.
- A JSON store: the collection needs indexed queries and relational tags.

## Consequences
- No postinstall step; `npm install` just works.
- `node:sqlite` is still flagged experimental (console warning only) — on the roadmap's watch list.
- The DB is synchronous: long statements (e.g. `VACUUM INTO`) block the main process briefly.
