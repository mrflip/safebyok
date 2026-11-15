#!/usr/bin/env bash
# Deletes the .DS_Store files macOS Finder writes into the folders it shows, in the worktree it is
# run in, and nowhere else. One left behind keeps a folder git is emptying (in a rebase, or a
# worktree removal) from being deleted.
#
# It takes no arguments, so it cannot be pointed anywhere: the worktree is the one with the
# current directory. It deletes only a regular file named exactly .DS_Store that belongs to that
# worktree (not to one nested inside it) and that git ignores, so what git sees never changes. It
# follows no symlink, crosses into no other filesystem, and skips .git and node_modules.
#
# The manual is notes/housekeeping.md, *Finder's .DS_Store files*.
#
# Written for the bash macOS ships (3.2) as well as a current one, and for BSD find as well as
# GNU find.
#
# Usage: scripts/clear-ds-store.sh
# Exits 0 when done, 1 on a failure, 2 when given any argument.
set -euo pipefail

if [[ $# -gt 0 ]]; then
  echo "clear-ds-store: takes no arguments; it clears the worktree it is run in" >&2
  echo "Usage: scripts/clear-ds-store.sh" >&2
  exit 2
fi

top="$(git rev-parse --show-toplevel 2> /dev/null)" || { echo "clear-ds-store: not inside a git worktree" >&2; exit 1; }
if [[ "$top" != /?* || ! -d "$top" ]]; then
  echo "clear-ds-store: git names no worktree directory here" >&2
  exit 1
fi

cleared=0
# Each file is judged from its own folder: kept unless that folder belongs to this worktree and
# git says the file is ignored there. Any other answer (another worktree's, tracked, not ignored,
# git failing) keeps it.
while IFS= read -r -d '' found; do
  folder="$(dirname "$found")"
  owner="$(git -C "$folder" rev-parse --show-toplevel 2> /dev/null || true)"
  if [[ "$owner" != "$top" ]]; then continue; fi
  if git -C "$folder" check-ignore --quiet -- .DS_Store 2> /dev/null; then
    rm -f -- "$found"
    cleared=$((cleared + 1))
  fi
done < <(
  find -P "$top" -xdev \( -name .git -o -name node_modules \) -prune \
    -o -type f -name .DS_Store -print0
)

if [[ "$cleared" -eq 1 ]]; then noun=file; else noun=files; fi
echo "Cleared ${cleared} .DS_Store ${noun} from ${top}."
