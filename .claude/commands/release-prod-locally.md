---
description: Merge the current/given PR to main, rebuild, and install the production app locally
---

Ship the current branch's PR to production on this Mac. Arguments (optional): a PR number
or branch name to merge — `$ARGUMENTS`. If omitted, use the PR associated with the current
branch.

Steps:

1. Check `git status --short` — if there are uncommitted changes, stop and tell the user
   rather than merging over them.
2. Merge the PR into `main` with `gh pr merge <number-or-branch> --squash --delete-branch`
   (use `gh pr view` first to confirm it's `MERGEABLE`/`CLEAN` if unsure which PR).
3. Make sure the local repo is on `main` and up to date (`git checkout main && git pull`,
   or rely on `gh pr merge`'s own fast-forward of the local branch if it already did that).
4. `npm install` (picks up any dependency changes from the merge).
5. Sanity-check `node_modules/electron/dist/Electron.app` exists — if not, run
   `cd node_modules/electron && node install.js` first (see CLAUDE.md's "Electron binary
   install" gotcha).
6. Quit any already-running copy of the app *before* installing over it:
   `pkill -f "MCO - Music Collection Organizer"` (this matches the BETA app's process name
   too as a substring, but `pkill -f` on the plain non-BETA string still only kills
   processes whose command line contains it — check with
   `pgrep -fl "MCO - Music Collection Organizer" | grep -v BETA` first if unsure, and only
   kill those PIDs). `install-release.sh` does a `rm -rf` + `cp -R` over the live bundle;
   if the old process is still running, replacing the files on disk doesn't affect its
   already-loaded code, and a later `open` just refocuses that stale instance instead of
   launching the new build — so the user sees none of the changes and it looks like the
   release didn't work.
7. `npm run dist:install` — builds (`electron-vite build`), packages an unsigned local
   `.app` via `electron-builder`, and copies it to `~/Applications/MCO - Music Collection
   Organizer.app` (see `scripts/install-release.sh`; never touches `/Applications` or the
   BETA app).
8. Launch it (`open "$HOME/Applications/MCO - Music Collection Organizer.app"`) and confirm
   it's actually running with a fresh PID (`pgrep -fl "MCO - Music Collection Organizer" |
   grep -v BETA`) rather than just assuming `open` succeeded.
9. Report back: which PR got merged, and confirmation the app is installed and running.

This never signs the build (`-c.mac.identity=null`) and only ever writes to
`~/Applications` — it's meant purely as a fast local "does this actually work" deploy, not
a distributable release.
