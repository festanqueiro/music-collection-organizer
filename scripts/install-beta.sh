#!/usr/bin/env bash
# Copies the just-built BETA .app (see `npm run dist:beta`) into
# /Applications. Only ever touches "V1 Library Organizer BETA.app" — the
# production app (a different name, different appId, different userData
# directory via electron-builder.beta.json's extraMetadata) is never
# read, written, or removed by this script.
set -euo pipefail

APP_NAME="V1 Library Organizer BETA.app"
SRC=$(find release -maxdepth 2 -name "$APP_NAME" -print -quit)

if [ -z "$SRC" ]; then
  echo "error: could not find '$APP_NAME' under release/ — did the electron-builder step run?" >&2
  exit 1
fi

DEST="/Applications/$APP_NAME"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
echo "Installed: $DEST"
