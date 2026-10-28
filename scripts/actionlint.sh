#!/usr/bin/env bash
# Lints the GitHub workflows with actionlint, here and in CI alike: `pnpm lint:workflows`, and a
# step of `pnpm justify`.
#
# The release is recorded here by its version and, for each platform, by the sha256 its release's
# checksums file gives (actionlint_<version>_checksums.txt). The tarball is fetched once, into
# node_modules/.cache/actionlint, and checked against that hash on every run, then unpacked into a
# fresh temporary folder, so nothing runs from a tarball that is not the one recorded. To move to
# a new release, change the version and all four hashes together.
#
# Arguments are handed to actionlint (`pnpm lint:workflows -verbose`). It lints each `run:` script
# with shellcheck when one is on the PATH, as on CI's runner.
#
# Usage: scripts/actionlint.sh [actionlint flags]
# Exits as actionlint does, or 1 when the tarball cannot be fetched, fails its hash, or has no
# hash recorded for this platform. Written for the bash macOS ships (3.2) as well as a current
# one, and for BSD tar and shasum as well as GNU tar and sha256sum.
set -euo pipefail

version=1.7.12
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)                platform=linux_amd64  sha256=8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8 ;;
  Linux-aarch64 | Linux-arm64) platform=linux_arm64  sha256=325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6 ;;
  Darwin-x86_64)               platform=darwin_amd64 sha256=5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644 ;;
  Darwin-arm64)                platform=darwin_arm64 sha256=aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f ;;
  *)
    echo "actionlint: no hash is recorded for $(uname -s) $(uname -m); add its line from actionlint_${version}_checksums.txt to scripts/actionlint.sh" >&2
    exit 1
    ;;
esac

top="$(cd "$(dirname "$0")/.." && pwd)"
tarball="$top/node_modules/.cache/actionlint/actionlint_${version}_${platform}.tar.gz"

if [[ ! -f "$tarball" ]]; then
  mkdir -p "$(dirname "$tarball")"
  curl --fail --silent --show-error --location --output "$tarball.part" \
    "https://github.com/rhysd/actionlint/releases/download/v${version}/actionlint_${version}_${platform}.tar.gz" \
    || { rm -f -- "$tarball.part"; echo "actionlint: could not fetch actionlint ${version} for ${platform}" >&2; exit 1; }
  mv -- "$tarball.part" "$tarball"
fi

if command -v sha256sum > /dev/null; then
  found="$(sha256sum -- "$tarball" | cut -d ' ' -f 1)"
else
  found="$(shasum -a 256 -- "$tarball" | cut -d ' ' -f 1)"
fi
if [[ "$found" != "$sha256" ]]; then
  echo "actionlint: ${tarball} is not the tarball recorded in scripts/actionlint.sh (its sha256 is ${found}); refusing to run it. Delete it to fetch it again." >&2
  exit 1
fi

unpacked="$(mktemp -d)"
trap 'rm -rf -- "$unpacked"' EXIT
tar -xzf "$tarball" -C "$unpacked" actionlint
cd "$top"
"$unpacked/actionlint" "$@"
