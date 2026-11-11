# Housekeeping

Occasional chores, for when the clutter starts to annoy. None of this is part of a thread's
routine, which is in `PROCESS.md`.

## Sweeping finished threads

```
scripts/git-survey.sh [--apply] [--against <ref>] [--retag <branch>]... [--idle <minutes>]
                      [--no-fetch] [--prs-from <file>]
```

A thread's branch outlives its PR. It stays at whatever tip it last had, often a rebase away
from what merged, and its worktree may stay beside it. `scripts/git-survey.sh` fetches, asks
GitHub (`gh`) for every pull request, and classifies each local branch except `main`, and each
worktree except the main checkout. `/branch-sweep` runs it and reports to the Coach. Until it is
given `--apply`, it only reports what it would do.

* `--apply` -- close what the report lists, and remove the worktrees it lists.
* `--against <ref>` -- the history to judge by, `origin/main` unless given.
* `--retag <branch>` -- let a `closed/<branch>` tag that names another commit move to the
  branch's tip. Without it, an existing `closed/` tag is never moved. Repeat it for several.
* `--idle <minutes>` -- how long a branch must sit unmoved, and a worktree untouched, before it
  counts as left alone: 60 unless given.
* `--no-fetch` -- survey the refs as they are.
* `--prs-from <file>` -- read the pull requests from a file, one a line, tab-separated: number,
  state (`OPEN`, `MERGED`, `CLOSED`), head branch, head commit, base branch.

Every local branch is one of:

* **close** -- a PR from it merged into main, that PR's head is in the history, and every commit
  on the branch is there too, as the same change or under the same subject line (the rule
  `scripts/git-attic` uses). Closing makes an annotated tag `closed/<branch>` at the branch's tip,
  unless one is there already. It then points the branch at the PR's merged head with a
  compare-and-swap, so a branch someone moved since the survey stays where it is.
* **done** -- closed already: on its merged head, with a `closed/` tag.
* **active** -- an open PR, or no PR yet: checked out in a worktree, or moved within `--idle`.
* **stray** -- no PR, and every commit in the history: `scripts/git-attic` retires it.
* **weird** -- anything else, reported with what does not fit: a PR closed unmerged or merged into
  another branch, a commit with no match, a `closed/` tag at another commit, or a finished branch
  checked out in a kept worktree (tagged, and not moved).

A worktree is removed (`git worktree remove`, never forced) only when its branch is closed or
done, and it is unlocked, has nothing uncommitted or untracked, no ignored files but build output
(`node_modules`, `dist`, `coverage`, editor and lint caches), no process running in it (read from
`/proc`, or `lsof` where there is none), and no file touched within `--idle`. Every other worktree
is kept, and the report gives the reason. Worktree entries whose directory is gone are pruned,
unless one of their branches has an open PR or commits not on origin, since its directory may only
be out of this checkout's sight. Then no entry is pruned, and the report names the worktree and
says why.

It never deletes a branch, and never touches a remote: the `closed/` tags stay local until
`git push origin 'refs/tags/closed/*'`. Last, it counts the branches on origin whose every PR is
finished. GitHub's "Automatically delete head branches" setting would delete those.

## Retiring stray branches

```
scripts/git-attic [--apply] [--against <ref>] [--retire <branch>]... [--no-prs]
```

Local branches pile up that `git branch --merged` cannot clear: a branch whose PR merged after a
rebase (its work reached `main` under other commits), a backup taken before a rebase, or a draft of
a commit that was merged reworded. `scripts/git-attic` finds them and retires each to a tag that
says what it was. Until it is given `--apply`, it only reports what it would do.

* `--apply` -- retire what the report lists.
* `--against <ref>` -- the history to judge by, `HEAD` unless given. Check out (or name) a branch
  that contains `main`.
* `--retire <branch>` -- retire a branch whose work is not merged, once you have looked and
  decided to let it go. Repeat it for several.
* `--no-prs` -- don't ask GitHub which pull request each branch was. Otherwise `gh` is asked
  once, and if it fails, the tags leave the pull request out.

Every local branch is one of:

* **In history** -- its tip is in the history it is judged by: on `HEAD`'s line, or in a pull
  request merged into it. Left alone.
* **Merged** -- off that history, but each of its commits is in it, either as the same change
  (`git cherry`) or under the same subject line. Retired.
* **Unmerged** -- a commit with no match. Reported with those commits, and left alone until you
  name it with `--retire`.

A branch checked out in any worktree is never retired, and the report says so.

**Retiring** makes an annotated tag `attic/<branch>` at the branch's tip, then deletes the
branch. The tag's message names the pull request (when `gh` knows it), the tip, and how many of
the branch's commits matched by change and how many by subject, listing those, and for a branch
let go with `--retire`, the commits that matched nothing. Read one with `git tag -n20
attic/<branch>`. If `attic/<branch>` already exists at the same commit (another checkout retired
the branch first, and its tag was fetched), the branch is just deleted. If that tag names another
commit, the new tag is `attic/<branch>-<short hash>`.

It never touches a remote: nothing is pushed, and no remote branch is deleted.

**Publishing the attic.** The tags stay local until pushed:
`git push origin 'refs/tags/attic/*'`. In another checkout, `git fetch origin --tags` brings
them. A plain fetch does not: it follows only the tags that point at commits it is already
fetching, and an attic tag points at a commit that no branch contains any more.

## Stale worktrees

`git worktree list` marks a worktree whose directory is gone as *prunable*. Its branch still
counts as checked out there, so nothing will retire or delete the branch. `git worktree prune`
clears the stale entries.

## Finder's .DS_Store files

```
scripts/clear-ds-store.sh
```

macOS Finder writes a `.DS_Store` file into each folder it shows, including folders in a
container's workspace that the Mac shares. They are gitignored, but one left in a folder that git
is emptying, during a rebase or a `git worktree remove`, keeps the folder from being deleted. Run
this script in the worktree first.

It takes no arguments. It clears the worktree that contains the current directory, and nothing
else: not the main checkout from a linked worktree, not a sibling, and not a worktree nested inside
this one. It deletes only a regular file named exactly `.DS_Store` that git ignores, so a tracked
one stays, and what git sees never changes. It follows no symlink, never crosses into another
filesystem, and skips `.git` and `node_modules`. Finder may write a new one a moment later: if git
still balks, run it once more.

`scripts/file-thread` runs it before removing a filed thread's worktree, and cleans up if Finder
writes a new one during the removal. In that case git fails with "Directory not empty": the
worktree is unregistered, but its directory is left behind. Once the push is proven, the script
deletes that directory (four tries) and prunes, but only if the worktree was clean before the
removal, git no longer lists it, origin's branch is the local tip, and the directory contains
nothing but the tip's files, `.DS_Store` files, `node_modules` and what the main checkout's
`.gitignore` covers. Otherwise it names the strays and leaves the directory. To do the same by
hand, confirm those same things, `rm -rf` the directory, and run `git worktree prune`.

## Session dumps

```
scripts/dump-sessions.sh [<dumps-dir> [<scratch-dir>]]
```

Run in the dev container, it copies Claude Code's session records to `<dumps-dir>`, by default
`/workspace/.session-dumps/`, on the host's own disk and outside every repository. Transcripts live
in the container's config volume, which survives a rebuild but which no other container sees, and
which ages them out by `cleanupPeriodDays`. Task output and scratchpads live in `/tmp`, which a
rebuild erases: run this before a rebuild.

A dump's name, `session-dump-<volume born>-<from>-<to>.tar.gz`, gives its range. Each run starts
where the newest dump of this volume ended, and takes what changed since, so a run that finds
nothing writes nothing. A transcript that is still growing is taken whole again next time, so to
read a session, take its file from the newest dump that contains it. Deleting the newest dump makes
the next run take its range again. Deleting an older one loses that range.

To find a session's files and unpack them where they cannot overwrite the live ones:

```
for d in /workspace/.session-dumps/*.tar.gz; do tar -tzf "$d" | grep -q <session id> && echo "$d"; done
mkdir /tmp/restored && tar -xzf <that dump> -C /tmp/restored
```

Transcripts are not scrubbed: a dump contains whatever a session read or was told, so keep it off
anything shared. The script's header says what it leaves out.

## Test stderr under an agent

Vitest picks a quiet reporter when it sees an agent (`CLAUDECODE` or `AI_AGENT` in the
environment), and that reporter prints nothing of a passing test, including its stderr. A run that
looks silent there is not: CI uses the default reporter and prints every `stderr |` block. To see
what CI sees, name the reporter, per package. (`pnpm test --reporter=default` reaches each
package's suite but not the root suite, since the root's `test` script does not pass it on to
`test:root`.)

```sh
CI=true pnpm -r --no-bail --stream --workspace-concurrency=1 exec vitest run --reporter=default | rg -n 'stderr \||stdout \|'
```

Quieting what it finds is the test's job. A refusal a test provokes on purpose is logged through
the bank's logger, so the test passes in `TH.spyLogger()` and asserts the levels logged. (The test
worlds' `quietLogger` lets `warn` and `error` through, so a surprise stays visible.) Catch what
React or a host function writes to the console with `vi.spyOn(console, 'error')`. Do not reach for
`quietLogger` or a console silenced for a whole file instead.

## CLAUDE.md's long-file list

CLAUDE.md's *Reading* says that a file past about 800 lines is searched, never read through. This
lists those files, leaving out `notes/security.md` (an agent never reads it), thread folders,
lockfiles and changelogs:

```sh
git ls-files ':!:whiteboard' ':!:winboard' ':!:human' ':!:**/pnpm-lock.yaml' ':!:pnpm-lock.yaml' \
  ':!:**/CHANGELOG.md' ':!:notes/security.md' | xargs wc -l | awk '$1 > 800 && $2 != "total"' | sort -n
```
