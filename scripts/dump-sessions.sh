#!/usr/bin/env bash
# Tarballs Claude Code's session records out of the dev container, to where the host keeps them.
# Transcripts live in the container's config volume, which no other container sees and which ages
# them out (cleanupPeriodDays); task output and scratchpads live in /tmp, which a rebuild erases.
# /workspace is the host's own disk, so a dump there outlives both.
#
# Each dump is named for what it holds:
#   session-dump-<volume born>-<from>-<to>.tar.gz
# all three in UTC, as 20261101T170000Z. A run starts from the <to> of the newest dump of this
# volume, and takes each file changed after <from> and up to <to>. So the ranges meet without a gap
# or an overlap, and a file changed later (a transcript still growing) is taken whole again by the
# next dump: the newest copy of a file is its fullest. A volume keeps its own chain, since another
# container's dump says nothing of what this one holds.
#
# Change means ctime, which a copy that keeps an old mtime cannot backdate.
#
# It takes only what it names: the transcripts, file history, session records and settings under
# ~/.claude, and the scratch folder. It leaves out credentials (.credentials.json, sessions/*.key,
# shell-snapshots, backups), and .git and node_modules, which can be had again. Transcripts are not
# scrubbed, so a dump holds whatever a session read or was told: it is written readable only by
# its owner, and belongs nowhere public.
#
# The manual is notes/housekeeping.md, *Session dumps*.
#
# Usage: scripts/dump-sessions.sh [<dumps-dir> [<scratch-dir>]]
#   <dumps-dir> defaults to /workspace/.session-dumps, <scratch-dir> to /tmp/claude-<uid>.
# Prints the dump it wrote, or that nothing changed, and writes no dump then. Exits 0 when done, 1
# on a failure, 2 on arguments it does not understand.
set -euo pipefail

if [[ $# -gt 2 ]]; then
  echo "Usage: scripts/dump-sessions.sh [<dumps-dir> [<scratch-dir>]]" >&2
  exit 2
fi
dumps="${1:-/workspace/.session-dumps}"
scratch="${2:-/tmp/claude-$(id -u)}"
claude_dir="${HOME}/.claude"
if [[ "$dumps" != /* || "$scratch" != /* ]]; then
  echo "dump-sessions: <dumps-dir> and <scratch-dir> must be absolute paths" >&2
  exit 2
fi
if [[ ! -d "$claude_dir" ]]; then
  echo "dump-sessions: no ${claude_dir} to dump" >&2
  exit 1
fi

# 20261101T170000Z => 2026-11-01T17:00:00Z, as find reads a time
find_time() {
  echo "${1:0:4}-${1:4:2}-${1:6:2}T${1:9:2}:${1:11:2}:${1:13:2}Z"
}

umask 077
mkdir -p "$dumps"

volume="$(date -u -d "@$(stat -c %W "$claude_dir")" +%Y%m%dT%H%M%SZ)"
from=19700101T000000Z
for earlier in "$dumps"/session-dump-"$volume"-*.tar.gz; do
  # The glob sorts, and a chain's names sort by time, so the last match is the newest.
  if [[ "$earlier" =~ -[0-9]{8}T[0-9]{6}Z-[0-9]{8}T[0-9]{6}Z-([0-9]{8}T[0-9]{6}Z)\.tar\.gz$ ]]; then
    from="${BASH_REMATCH[1]}"
  fi
done
# Stamps are whole seconds: this puts a change made just before the run inside its range, not in
# the next.
sleep 1
to="$(date -u +%Y%m%dT%H%M%SZ)"

# Relative to /, so that a dump unpacks anywhere and never over the live files.
roots=()
for root in "$claude_dir/projects" "$claude_dir/file-history" "$claude_dir/sessions" \
  "$claude_dir/settings.json" "$scratch"; do
  if [[ -e "$root" ]]; then roots+=("${root#/}"); fi
done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
list="$work/files"
(
  cd /
  if [[ ${#roots[@]} -gt 0 ]]; then
    find -P "${roots[@]}" \( -name .git -o -name node_modules \) -prune -o \
      -type f ! -name '*.key' ! -name .credentials.json \
      -newerct "$(find_time "$from")" ! -newerct "$(find_time "$to")" -print0
  fi
) > "$list"

count="$(tr -cd '\0' < "$list" | wc -c)"
if [[ "$count" -eq 0 ]]; then
  echo "Nothing changed since ${from}: no dump written."
  exit 0
fi

dump="$dumps/session-dump-${volume}-${from}-${to}.tar.gz"
# Under a name no later run reads, so that a dump cut short never marks its range as taken. Tar's
# exit of 1 is a file changing as it was read, and the next dump takes that file again.
partial="$dumps/.partial-${volume}-${to}.tar.gz"
status=0
tar --create --gzip --file "$partial" --directory / --null --files-from "$list" \
  --ignore-failed-read --warning=no-file-changed || status=$?
if [[ "$status" -gt 1 ]]; then
  rm -f "$partial"
  echo "dump-sessions: tar failed with ${status}; no dump written" >&2
  exit 1
fi
mv "$partial" "$dump"
if [[ "$count" -eq 1 ]]; then noun=file; else noun=files; fi
echo "Wrote ${dump}: ${count} ${noun}, $(du -h "$dump" | cut -f1)."
