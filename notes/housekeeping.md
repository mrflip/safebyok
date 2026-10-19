# Housekeeping

Occasional chores, for when the clutter starts to annoy. None of this is part of a thread's
routine: that is `PROCESS.md`.

## Sweeping finished threads

```
scripts/git-survey.sh [--apply] [--against <ref>] [--retag <branch>]... [--idle <minutes>]
                      [--no-fetch] [--prs-from <file>]
```

A thread's branch outlives its PR: it stays at whatever tip it last had, often one rebased away
from what merged, and its worktree may stay beside it. `scripts/git-survey.sh` fetches, asks
GitHub (`gh`) for every pull request, and sorts each local branch but `main`, and each worktree
but the main checkout. `/branch-sweep` runs it and reports to the Coach. It only reports what it
would do until it is given `--apply`.

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
  unless one is there already, then points the branch at the PR's merged head with a
  compare-and-swap, so a branch someone moved since the survey is left where it is.
* **done** -- closed already: on its merged head, with a `closed/` tag.
* **active** -- an open PR, or no PR yet: checked out in a worktree, or moved within `--idle`.
* **stray** -- no PR, and every commit in the history: `scripts/git-attic` retires it.
* **weird** -- anything else, with what does not fit: a PR closed unmerged or merged into another
  branch, a commit with no match, a `closed/` tag at another commit, or a finished branch a kept
  worktree holds (tagged, and not moved).

A worktree is removed (`git worktree remove`, never forced) only when its branch is closed or
done, and it is unlocked, has nothing uncommitted or untracked, no ignored files but build output
(`node_modules`, `dist`, `coverage`, editor and lint caches), no process running in it (read from
`/proc`, or `lsof` where there is none), and no file touched within `--idle`. Every other worktree
is kept, with the reason. Worktree entries whose directory is gone are pruned, unless the branch
of one has an open PR or commits not on origin (its directory may only be out of this checkout's
sight): then no entry is pruned, and the report names the worktree and says why.

It never deletes a branch, and never touches a remote: the `closed/` tags stay local until
`git push origin 'refs/tags/closed/*'`. Last, it counts the branches on origin whose every PR is
finished, which GitHub's "Automatically delete head branches" setting would clear.

## Retiring stray branches

```
scripts/git-attic [--apply] [--against <ref>] [--retire <branch>]... [--no-prs]
```

Local branches pile up that `git branch --merged` cannot clear: a branch whose PR merged after a
rebase (its work reached `main` under other commits), a backup taken before a rebase, a draft of
a commit that landed reworded. `scripts/git-attic` finds them and retires each to a tag that says
what it was. It only reports what it would do until it is given `--apply`.

* `--apply` -- retire what the report lists.
* `--against <ref>` -- the history to judge by, `HEAD` unless given. Stand on (or name) a branch
  that holds `main`.
* `--retire <branch>` -- retire a branch whose work is not merged, once you have looked and
  decided to let it go. Repeat it for several.
* `--no-prs` -- don't ask GitHub which pull request each branch was. Otherwise `gh` is asked
  once, and its answer left out of the tags if it cannot be had.

Every local branch is one of:

* **In history** -- its tip is in the history it is judged by: on the line `HEAD` stands on, or
  in a pull request merged into it. Left alone.
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
the branch first, and its tag was fetched), the branch is just deleted; if that tag names another
commit, the new one is `attic/<branch>-<short hash>`.

It never touches a remote: nothing is pushed, and no remote branch is deleted.

**Publishing the attic.** The tags stay local until pushed:
`git push origin 'refs/tags/attic/*'`. In another checkout, `git fetch origin --tags` brings
them. A plain fetch does not: it follows only the tags that point at commits it is already
fetching, and an attic tag points at a commit no branch holds any more.

## Stale worktrees

`git worktree list` marks a worktree whose directory is gone as *prunable*, and its branch stays
checked out there, so nothing will retire or delete it. `git worktree prune` clears the stale
entries.

## Finder's .DS_Store files

```
scripts/clear-ds-store.sh
```

macOS Finder writes a `.DS_Store` file into each folder it shows, including folders in a
container's workspace that the Mac shares. They are gitignored, but one left in a folder that git
is emptying, in a rebase or a `git worktree remove`, keeps the folder from being deleted. Run
this in the worktree first.

It takes no arguments: it clears the worktree holding the current directory, and nothing else --
not the main checkout from a linked worktree, not a sibling, not a worktree nested inside this
one. It deletes only a regular file named exactly `.DS_Store` that git ignores, so a tracked one
stays, and what git sees never changes. It follows no symlink, crosses into no other filesystem,
and skips `.git` and `node_modules`. Finder may write a new one a moment later; if git still
balks, run it once more.

`scripts/file-thread` runs it before removing a filed thread's worktree, and finishes the job if
Finder writes a new one mid-removal. Git then fails with "Directory not empty", unregistered, its
directory left behind. Once the push is proven, the script deletes that directory (four tries) and
prunes, but only if the worktree was clean before the removal, git no longer lists it, origin's
branch is the local tip, and the directory holds nothing but the tip's files, `.DS_Store` files,
`node_modules` and what the main checkout's `.gitignore` covers. Otherwise it names the strays and leaves the directory.
By hand: confirm those same things, `rm -rf` it, `git worktree prune`.

## CLAUDE.md's long-file list

CLAUDE.md's *Reading* names the files long enough that an agent should search them rather than
read them whole: those past about 700 lines, leaving out `notes/security.md` (an agent never
reads it), thread folders, lockfiles and changelogs. When a file is split or grows, bring the
list in line with:

```sh
git ls-files ':!:whiteboard' ':!:winboard' ':!:human' ':!:**/pnpm-lock.yaml' ':!:pnpm-lock.yaml' \
  ':!:**/CHANGELOG.md' ':!:notes/security.md' | xargs wc -l | awk '$1 > 700 && $2 != "total"' | sort -n
```
