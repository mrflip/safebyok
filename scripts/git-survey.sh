#!/usr/bin/env bash
# Sweeps finished threads. Each local branch whose pull request merged into main, and whose every
# commit main holds (as the same change, or under the same subject line, as scripts/git-attic
# judges), gets an annotated tag closed/<branch> at its tip and is pointed at the PR's merged
# head. Each worktree holding such a branch is removed when it is clean and idle. Every other
# branch and worktree is only reported: active, a stray for scripts/git-attic, or weird. A
# worktree whose directory is missing is pruned, unless its branch has an open PR or commits not on
# origin: then no prune is run, and the report says which held it back. Reports what it would do
# unless given --apply. Never pushes, deletes a branch, or moves a closed/ tag unless --retag
# names it.
#
# The manual is notes/housekeeping.md, *Sweeping finished threads*; --help prints that section.
#
# Written for the bash macOS ships (3.2) as well as a current one: no associative arrays, no
# mapfile, and no empty arrays under `set -u`.
#
# Usage: scripts/git-survey.sh [--apply] [--against <ref>] [--retag <branch>]... [--idle <minutes>]
#                              [--no-fetch] [--prs-from <file>]
# Exits 0 when the report (or its sweeping) is done, 1 on a failure, 2 on a bad argument.
set -euo pipefail

scriptdir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
manual="${scriptdir}/../notes/housekeeping.md"
usage="Usage: scripts/git-survey.sh [--apply] [--against <ref>] [--retag <branch>]... [--idle <minutes>] [--no-fetch] [--prs-from <file>]   (--help for more)"
junk_re='(^|/)(\.DS_Store|\.eslintcache|[^/]*\.tsbuildinfo)$'

die() {
  echo "git-survey: $*" >&2
  exit 1
}

refuseArgs() {
  echo "git-survey: $*" >&2
  echo "$usage" >&2
  exit 2
}

# The manual's section on this script, from its heading to the next.
printManual() {
  if [[ ! -r "$manual" ]]; then
    echo "$usage"
    return
  fi
  awk '/^## Sweeping finished threads/ { within = 1; print; next } within && /^## / { exit } within' "$manual"
}

# A count and its noun, "1 commit" or "2 commits": counted <n> <noun> [<plural>].
counted() {
  if [[ "$1" -eq 1 ]]; then echo "1 $2"; else echo "$1 ${3:-${2}s}"; fi
}

apply=no
against=origin/main
fetches=yes
idle_mins=60
prs_from=''
retagging=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)    apply=yes ;;
    --no-fetch) fetches=no ;;
    --against | --retag | --idle | --prs-from)
      if [[ $# -lt 2 ]]; then refuseArgs "$1 needs a value"; fi
      case "$1" in
        --against)  against="$2" ;;
        --retag)    retagging="${retagging}${2}"$'\n' ;;
        --idle)     idle_mins="$2" ;;
        --prs-from) prs_from="$2" ;;
      esac
      shift
      ;;
    -h | --help) printManual; exit 0 ;;
    *) refuseArgs "no such option: $1" ;;
  esac
  shift
done

if ! [[ "$idle_mins" =~ ^[0-9]+$ ]]; then refuseArgs "--idle takes whole minutes, not ${idle_mins}"; fi
git rev-parse --git-dir > /dev/null 2>&1 || die "not inside a git repository"
if [[ "$fetches" == yes ]]; then
  git fetch --quiet --prune origin || die "could not fetch origin; --no-fetch surveys what is here"
fi
base="$(git rev-parse --verify --quiet "${against}^{commit}")" || die "no such commit: ${against}"
while IFS= read -r branch; do
  if [[ -z "$branch" ]]; then continue; fi
  git show-ref --verify --quiet "refs/heads/${branch}" || die "--retag names no local branch: ${branch}"
done <<< "$retagging"

scratch="$(mktemp -d "${TMPDIR:-/tmp}/git-survey.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT

# Each pull request as <number> TAB <state> TAB <head branch> TAB <head sha> TAB <base branch>.
if [[ -n "$prs_from" ]]; then
  [[ -r "$prs_from" ]] || die "cannot read --prs-from ${prs_from}"
  cp "$prs_from" "${scratch}/prs"
else
  gh pr list --state all --limit 1000 --json number,state,headRefName,headRefOid,baseRefName \
    --jq '.[] | [.number, .state, .headRefName, .headRefOid, .baseRefName] | @tsv' \
    > "${scratch}/prs" 2> /dev/null \
    || die "gh could not list the pull requests; --prs-from <file> supplies them"
fi
# Every subject line in the history judged by, one a line, for whole-line matching.
git log --format=%s "$base" > "${scratch}/subjects"
# Each worktree but the main one, as <path> TAB <branch>, the path with its symlinks resolved.
git worktree list --porcelain | awk '
  /^worktree / { path = substr($0, 10); held = "(detached)" }
  /^branch /   { held = substr($0, 19) }
  /^$/         { if (path != "" && seen++) { print path "\t" held }; path = "" }
  END          { if (path != "" && seen++) { print path "\t" held } }
' > "${scratch}/worktrees"
# The working directory of every process we can see, or nothing and a note that we cannot.
sees_processes=yes
if [[ -d /proc/self ]]; then
  for link in /proc/[0-9]*/cwd; do readlink "$link" 2> /dev/null || true; done > "${scratch}/cwds"
elif command -v lsof > /dev/null 2>&1; then
  lsof -a -d cwd -Fn 2> /dev/null | sed -n 's/^n//p' > "${scratch}/cwds" || true
else
  sees_processes=no
  : > "${scratch}/cwds"
fi
now="$(date +%s)"

# The pull requests from a branch in one state, newest first: prsOf <branch> <STATE> [<base>].
prsOf() {
  awk -F '\t' -v branch="$1" -v state="$2" -v into="${3:-}" '
    $3 == branch && $2 == state && (into == "" || $5 == into)
  ' "${scratch}/prs" | sort -t$'\t' -k1,1nr
}

# The branch's commits off the history judged by that match nothing there, as "<hash> <subject>"
# lines: neither the same change (git cherry) nor a commit with the same subject line.
unmatchedOf() {
  local mark sha subject
  git cherry "$base" "$1" > "${scratch}/cherry"
  while read -r mark sha; do
    if [[ "$mark" == - ]]; then continue; fi
    subject="$(git log -1 --format=%s "$sha")"
    if [[ -n "$subject" ]] && grep -qxF -- "$subject" "${scratch}/subjects"; then continue; fi
    git log -1 --format='%h %s' "$sha"
  done < "${scratch}/cherry"
}

worktreeOf() {
  awk -F '\t' -v branch="$1" '$2 == branch { print $1; exit }' "${scratch}/worktrees"
}

# Where a branch stands, as one line: <verdict> TAB <branch> TAB <tip> TAB <target> TAB <pr> TAB <note>.
# The target is the commit a closed branch is pointed at; the pr, "#73" or "-".
judge() {
  local branch="$1" tip held tagged opened merged other pr target unmatched moved
  tip="$(git rev-parse "refs/heads/${branch}")"
  held="$(worktreeOf "$branch")"
  tagged="$(git rev-parse --verify --quiet "refs/tags/closed/${branch}^{commit}" || true)"
  opened="$(prsOf "$branch" OPEN | head -1)"
  merged="$(prsOf "$branch" MERGED main | head -1)"
  other="$(awk -F '\t' -v branch="$branch" '$3 == branch && ($2 == "CLOSED" || ($2 == "MERGED" && $5 != "main")) {
    printf "%s#%s %s into %s", (n++ ? ", " : ""), $1, tolower($2), $5 }' "${scratch}/prs")"

  if [[ -n "$opened" ]]; then
    pr="#$(cut -f1 <<< "$opened")"
    if [[ "$(cut -f4 <<< "$opened")" != "$tip" ]]; then
      printf 'active\t%s\t%s\t-\t%s\t%s\n' "$branch" "$tip" "$pr" "open; the PR's head is $(cut -c1-7 <<< "$(cut -f4 <<< "$opened")")"
    else
      printf 'active\t%s\t%s\t-\t%s\t%s\n' "$branch" "$tip" "$pr" "open"
    fi
    return
  fi

  if [[ -z "$merged" ]]; then
    moved="$(git log --walk-reflogs -1 --format=%ct "refs/heads/${branch}" 2> /dev/null || true)"
    if [[ -z "$moved" ]]; then moved="$(git log -1 --format=%ct "$tip")"; fi
    if [[ -n "$other" ]]; then
      printf 'weird\t%s\t%s\t-\t-\t%s\n' "$branch" "$tip" "no PR merged into main: ${other}"
    elif [[ -n "$held" || $((now - moved)) -lt $((idle_mins * 60)) ]]; then
      printf 'active\t%s\t%s\t-\t-\t%s\n' "$branch" "$tip" "no PR yet"
    elif [[ -z "$(unmatchedOf "$branch")" ]]; then
      printf 'stray\t%s\t%s\t-\t-\t%s\n' "$branch" "$tip" "no PR; every commit is on main, so scripts/git-attic would retire it"
    else
      printf 'weird\t%s\t%s\t-\t-\t%s\n' "$branch" "$tip" "no PR, and $(counted "$(unmatchedOf "$branch" | grep -c .)" commit) with no match on main"
    fi
    return
  fi

  pr="#$(cut -f1 <<< "$merged")"
  target="$(cut -f4 <<< "$merged")"
  if ! git merge-base --is-ancestor "$target" "$base" 2> /dev/null; then
    printf 'weird\t%s\t%s\t-\t%s\t%s\n' "$branch" "$tip" "$pr" "its merged head ${target:0:7} is not in ${against}"
    return
  fi
  unmatched="$(unmatchedOf "$branch" | head -3 | paste -sd ';' -)"
  if [[ -n "$unmatched" ]]; then
    printf 'weird\t%s\t%s\t%s\t%s\t%s\n' "$branch" "$tip" "$target" "$pr" "commits with no match on main: ${unmatched}"
    return
  fi
  if [[ -n "$tagged" && "$tip" == "$target" ]]; then
    printf 'done\t%s\t%s\t%s\t%s\t%s\n' "$branch" "$tip" "$target" "$pr" "closed already"
    return
  fi
  if [[ -n "$tagged" && "$tagged" != "$tip" ]] && ! grep -qxF -- "$branch" <<< "$retagging"; then
    printf 'weird\t%s\t%s\t%s\t%s\t%s\n' "$branch" "$tip" "$target" "$pr" \
      "closed/${branch} already names ${tagged:0:7}, and the branch has moved off its merged head; --retag ${branch} moves the tag"
    return
  fi
  printf 'close\t%s\t%s\t%s\t%s\t%s\n' "$branch" "$tip" "$target" "$pr" "$(closingNote "$tip" "$target")"
}

closingNote() {
  local tip="$1" target="$2" past behind
  past="$(git rev-list --count "${target}..${tip}")"
  behind="$(git rev-list --count "${tip}..${target}")"
  if [[ "$tip" == "$target" ]]; then
    echo "on its merged head"
  elif [[ "$past" -eq 0 ]]; then
    echo "$(counted "$behind" commit) behind its merged head"
  elif git merge-base --is-ancestor "$tip" "$base"; then
    echo "on main, $(counted "$past" commit) past its merged head"
  else
    echo "rewritten: $(counted "$past" commit) past its merged head, each matching one on main"
  fi
}

# What a branch holds that only this checkout has, in words, or nothing: an open PR, or commits not
# on origin (a branch origin lacks counts its commits not on the history judged by).
holdsOnlyHere() {
  local branch="$1" opened unpushed
  if [[ "$branch" == "(detached)" ]]; then return; fi
  opened="$(prsOf "$branch" OPEN | head -1)"
  if [[ -n "$opened" ]]; then
    echo "an open PR (#$(cut -f1 <<< "$opened"))"
    return
  fi
  if git show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
    unpushed="$(git rev-list --count "refs/remotes/origin/${branch}..refs/heads/${branch}" 2> /dev/null || echo 0)"
  else
    unpushed="$(git rev-list --count "${base}..refs/heads/${branch}" 2> /dev/null || echo 0)"
  fi
  if [[ "$unpushed" -gt 0 ]]; then echo "$(counted "$unpushed" commit) not on origin"; fi
}

# Whether a worktree may go, as one line: <verdict> TAB <path> TAB <branch> TAB <note>.
judgeTree() {
  local where="$1" branch="$2" verdict real why dirty precious busy recent held
  verdict="$(awk -F '\t' -v branch="$branch" '$2 == branch { print $1; exit }' "${scratch}/verdicts")"
  if [[ ! -d "$where" ]]; then
    held="$(holdsOnlyHere "$branch")"
    if [[ -n "$held" ]]; then
      : > "${scratch}/hold-prune"
      printf 'keep\t%s\t%s\t%s\n' "$where" "$branch" "its directory is missing, but its branch has ${held}: no worktree is pruned while it stands"
    else
      printf 'keep\t%s\t%s\t%s\n' "$where" "$branch" "its directory is gone: git worktree prune clears it"
    fi
    return
  fi
  if [[ "$verdict" != close && "$verdict" != done ]]; then
    printf 'keep\t%s\t%s\t%s\n' "$where" "$branch" "its branch is ${verdict:-not a local branch}"
    return
  fi
  real="$(cd "$where" && pwd -P)"
  why=''
  if git worktree list --porcelain | awk -v p="$where" '$0 == "worktree " p { hit = 1; next } /^worktree / { hit = 0 } hit && /^locked/ { found = 1 } END { exit ! found }'; then
    why="${why}; locked"
  fi
  dirty="$(git -C "$where" status --porcelain | grep -c . || true)"
  if [[ "$dirty" -gt 0 ]]; then why="${why}; $(counted "$dirty" "uncommitted or untracked path")"; fi
  precious="$(git -C "$where" ls-files --others --ignored --exclude-standard \
    ':(exclude,glob)**/node_modules/**' ':(exclude,glob)**/dist/**' ':(exclude,glob)**/coverage/**' \
    | grep -cvE "$junk_re" || true)"
  if [[ "$precious" -gt 0 ]]; then why="${why}; $(counted "$precious" "ignored file") besides build output"; fi
  if [[ "$sees_processes" == no ]]; then
    why="${why}; cannot see which processes run there"
  else
    busy="$(grep -cE "^${real}(/|$)" "${scratch}/cwds" || true)"
    if [[ "$busy" -gt 0 ]]; then why="${why}; $(counted "$busy" process processes) running in it"; fi
  fi
  recent="$(find "$where" \( -name node_modules -o -name .git -o -name dist \) -prune -o \
    -type f -mmin "-${idle_mins}" -print 2> /dev/null | head -1)"
  if [[ -n "$recent" ]]; then why="${why}; files touched in the last $(counted "$idle_mins" minute)"; fi
  if [[ -n "$why" ]]; then
    printf 'keep\t%s\t%s\t%s\n' "$where" "$branch" "its branch is finished, but: ${why#; }"
  else
    printf 'remove\t%s\t%s\t%s\n' "$where" "$branch" "its branch is finished; clean and idle"
  fi
}

# The annotated tag's message for a closed branch.
closingMessage() {
  local branch="$1" tip="$2" target="$3" pr="$4"
  echo "Branch ${branch}, closed $(date +%F) by scripts/git-survey.sh."
  echo "Pull request: ${pr}, merged."
  echo "Tip: $(git log -1 --format='%h %cs %s' "$tip")"
  echo "Pointed at the PR's merged head: $(git log -1 --format='%h %s' "$target")"
}

git for-each-ref --format='%(refname:short)' refs/heads/ | grep -vxF main > "${scratch}/branches" || true
: > "${scratch}/verdicts"
while IFS= read -r branch; do
  judge "$branch" >> "${scratch}/verdicts"
done < "${scratch}/branches"
: > "${scratch}/trees"
while IFS=$'\t' read -r where branch; do
  judgeTree "$where" "$branch" >> "${scratch}/trees"
done < "${scratch}/worktrees"

# Worktrees first: a branch a worktree holds cannot be moved under it.
removed=0
kept=0
while IFS=$'\t' read -r verdict where branch note; do
  if [[ "$verdict" == remove && "$apply" == yes ]]; then
    if [[ -n "$(git -C "$where" status --porcelain)" ]]; then
      verdict=keep
      note="changed since the survey; left in place"
    elif ! complaint="$(git worktree remove "$where" 2>&1)"; then
      verdict=keep
      note="git worktree remove refused: ${complaint}"
    else
      verdict=removed
    fi
  fi
  if [[ "$verdict" == keep ]]; then kept=$((kept + 1)); else removed=$((removed + 1)); fi
  printf '%s\t%s\t%s\t%s\n' "$verdict" "$where" "$branch" "$note"
done < "${scratch}/trees" > "${scratch}/swept-trees"
if [[ -e "${scratch}/hold-prune" ]]; then
  # git worktree prune takes every registration whose directory is missing, a branch with work
  # in it as readily as any (a directory that merely cannot be seen from here looks the same).
  printf 'held\tgit worktree prune\t-\t%s\n' "not run: a worktree whose directory is missing holds a branch that is not finished (above)" >> "${scratch}/swept-trees"
elif [[ "$apply" == yes ]]; then
  git worktree prune --verbose 2>&1 | sed 's/^/pruned\t/' >> "${scratch}/swept-trees" || true
else
  git worktree prune --dry-run --verbose 2>&1 | sed 's/^/prune\t/' >> "${scratch}/swept-trees" || true
fi

while IFS=$'\t' read -r verdict branch tip target pr note; do
  if [[ "$verdict" == close ]]; then
    holder="$(awk -F '\t' -v branch="$branch" '$3 == branch && $1 != "removed" && $1 != "remove" { print $2 "\t" $4; exit }' "${scratch}/swept-trees")"
    if [[ -n "$holder" ]]; then
      verdict=weird
      note="finished, but $(cut -f1 <<< "$holder") holds it ($(cut -f2 <<< "$holder")); would be tagged closed/${branch}, and is not moved"
      if [[ "$apply" == yes ]]; then note="${note/would be tagged/tagged}"; fi
    fi
    action="tag closed/${branch} at ${tip:0:7}"
    if git show-ref --verify --quiet "refs/tags/closed/${branch}"; then
      if [[ "$(git rev-parse "refs/tags/closed/${branch}^{commit}")" == "$tip" ]]; then
        action="closed/${branch} is already at ${tip:0:7}"
      else
        action="move closed/${branch} to ${tip:0:7}"
      fi
    fi
    if [[ "$tip" != "$target" && "$verdict" == close ]]; then action="${action}, move the branch to ${target:0:7}"; fi
    if [[ "$apply" == yes ]]; then
      if [[ "$verdict" == close && "$tip" != "$target" ]] \
          && ! complaint="$(git update-ref -m "git-survey: closed, at its merged head" "refs/heads/${branch}" "$target" "$tip" 2>&1)"; then
        verdict=weird
        note="moved since the survey; left where it is: ${complaint}"
      else
        closingMessage "$branch" "$tip" "$target" "$pr" > "${scratch}/message"
        case "$action" in
          "closed/${branch} is already at"*) ;;
          "move closed/"*) git tag --force --annotate --file "${scratch}/message" "closed/${branch}" "$tip" > /dev/null ;;
          *) git tag --annotate --file "${scratch}/message" "closed/${branch}" "$tip" ;;
        esac
      fi
      if [[ "$verdict" == close ]]; then verdict=closed; fi
    fi
    if [[ "$verdict" == close || "$verdict" == closed ]]; then note="${action}; ${note}"; fi
  fi
  printf '%s\t%s\t%s\t%s\n' "$verdict" "$branch" "$pr" "$note"
done < "${scratch}/verdicts" > "${scratch}/swept-branches"

sort -t$'\t' -k1,1 -s "${scratch}/swept-branches"
cat "${scratch}/swept-trees"
if git remote get-url origin > /dev/null 2>&1; then
  git for-each-ref --format='%(refname:lstrip=3)' refs/remotes/origin/ | grep -vxE 'HEAD|main' > "${scratch}/remotes" || true
  finished="$(awk -F '\t' 'NR == FNR { state[$3] = state[$3] " " $2; next }
    ($0 in state) && state[$0] !~ /OPEN/ { n++ } END { print n + 0 }' "${scratch}/prs" "${scratch}/remotes")"
  printf 'remote\t%s\n' "$(counted "$finished" "branch on origin whose every PR is merged or closed" "branches on origin whose every PR is merged or closed")"
fi

echo
tally() { grep -c "^$1"$'\t' "${scratch}/swept-branches" || true; }
if [[ "$apply" == yes ]]; then
  echo "$(tally closed) closed, $(tally done) closed already, $(tally active) active, $(tally stray) stray, $(tally weird) weird;" \
    "$(counted "$(grep -c '^removed'$'\t' "${scratch}/swept-trees" || true)" worktree) removed, ${kept} kept."
  if [[ "$(tally closed)" -gt 0 ]]; then
    echo "The tags are local: git push origin 'refs/tags/closed/*' publishes them."
  fi
else
  echo "$(tally close) to close, $(tally done) closed already, $(tally active) active, $(tally stray) stray, $(tally weird) weird;" \
    "$(counted "$removed" worktree) to remove, ${kept} kept."
  if [[ "$(tally close)" -gt 0 || "$removed" -gt 0 ]]; then
    echo "Nothing was changed: --apply sweeps them."
  fi
fi
