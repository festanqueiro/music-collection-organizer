#!/usr/bin/env bash
# Copies the just-built production .app (see `npm run dist`) into
# ~/Applications, so a local test build can be launched without manually
# dragging it out of release/. Never touches /Applications or the BETA
# app (a different name/appId — see install-beta.sh).
set -euo pipefail

APP_NAME="MCO - Music Collection Organizer.app"
SRC=$(find release -maxdepth 2 -name "$APP_NAME" -print -quit)

if [ -z "$SRC" ]; then
  echo "error: could not find '$APP_NAME' under release/ — did the electron-builder step run?" >&2
  exit 1
fi

mkdir -p "$HOME/Applications"
DEST="$HOME/Applications/$APP_NAME"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
echo "Installed: $DEST"
