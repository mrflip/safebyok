#!/bin/sh
# Run one walk script against a demo's dev server already running (ports: knockknock 5181, envman 5182, react 5183).
# Screenshots, aria snapshots and console logs land in <workdir>/shots/<app>/. Usage: run.sh <workdir> kk.mjs
set -eu
W=$(cd "$1" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
cp "$HERE"/*.mjs "$W/"
cd "$W"
PLAYWRIGHT_BROWSERS_PATH="$W/browsers" LD_LIBRARY_PATH="$W/libroot/usr/lib/aarch64-linux-gnu:$W/libroot/lib/aarch64-linux-gnu" exec node "$2"
