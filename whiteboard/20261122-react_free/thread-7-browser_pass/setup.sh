#!/bin/sh
# Install Playwright, its headless Chromium, and the system libraries Chromium lacks here, all under $1.
# No root: the bookworm arm64 .debs are fetched from deb.debian.org, checked against the Packages index's SHA256
# (itself checked against Release), and unpacked with dpkg -x. Usage: setup.sh <workdir>
set -eu
W=$(mkdir -p "$1" && cd "$1" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$W"
[ -f package.json ] || npm init -y >/dev/null
npm i playwright@1.65.1
PLAYWRIGHT_BROWSERS_PATH="$W/browsers" npx playwright install chromium-headless-shell
mkdir -p debs libroot && cd debs
curl -sSfO https://deb.debian.org/debian/dists/bookworm/Release
curl -sSfO https://deb.debian.org/debian/dists/bookworm/main/binary-arm64/Packages.xz
want=$(grep -E ' main/binary-arm64/Packages.xz$' Release | awk 'length($1) == 64 { print $1 }')
[ "$(sha256sum Packages.xz | cut -d' ' -f1)" = "$want" ] || { echo 'Packages.xz does not match Release' >&2; exit 1; }
xz -dkf Packages.xz
python3 -I "$HERE/fetch-debs.py" libnspr4 libnss3 libatk1.0-0 libdbus-1-3 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libxkbcommon0 libasound2 libatspi2.0-0 libdrm2 libwayland-server0 libxi6
