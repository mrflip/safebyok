---
name: branch-sweep
description: Sweep finished threads out of the local repository with scripts/git-survey.sh -- each branch whose PR merged is tagged closed/<branch> and pointed at its merged head on main, each finished thread's clean, idle worktree is removed -- then look into what looks weird and report what was swept, what is in progress, and what needs the Coach. Use only when the Coach invokes /branch-sweep.
disable-model-invocation: true
context: fork
agent: general-purpose
model: sonnet
argument-hint: "[clarifications, e.g. \"dry run\", \"retag 20261015-foo\", \"attic\"]"
---

# Sweep finished branches and worktrees

The Coach's words after the command: `$ARGUMENTS`

They are clarifications, and where they conflict with this file, they win. Three are expected:

* `dry run` -- survey and report what would happen; run nothing with `--apply`.
* `retag <branch>` -- the Coach lets that branch's existing `closed/` tag move. Without those
  words, never pass `--retag`: an existing `closed/` tag is never moved.
* `attic` -- also retire the strays with `scripts/git-attic` (step 3).

**This skill is the exception to two standing rules**, by the Coach's decision: PROCESS.md and
`/closeout` say never to move a branch that isn't your thread's, and never to remove another
worker's worktree. Here the script may do both, to what it judges finished, in the ways
`notes/housekeeping.md` (*Sweeping finished threads*) documents. You make no other git write by
hand: no push, no branch deleted, no tag made, moved or deleted, no `--force`, and the main
checkout (`/workspace/byok`) is never touched.

**We keep branches; deleting one is never a habit**, local or remote: a branch stays as the
record of its work. This skill settles where each local branch finally stands, tagged and pointed
at its merged head. It never changes a remote branch, and its report never recommends deleting
one. The one deletion it makes is `attic`'s, when the Coach asks for it, behind an `attic/` tag.

## 1. Survey

```sh
"${CLAUDE_PROJECT_DIR}/scripts/git-survey.sh"
```

It fetches, reads every local branch, its PRs (`gh`) and its worktree, and writes nothing. Each
output line is tab-separated: a verdict (`close`, `done`, `active`, `stray`, `weird` for
branches; `remove`, `keep`, `prune` for worktrees), the branch or path, then its PR or branch,
and a note. Its `--help` prints the manual.

The script's verdicts are the line. You may treat a `close` or `remove` as weird when something
you see makes you less than certain, and say why. You never promote a row to `close` or
`remove`.

## 2. Sweep

Unless the Coach said `dry run`, if the survey lists anything to close or remove, and if you held
nothing back in step 1:

```sh
"${CLAUDE_PROJECT_DIR}/scripts/git-survey.sh" --apply [--retag <branch>]...
```

It surveys afresh and writes as it goes: worktrees first, then branches, each with a check that
nothing changed since its own survey. What it could not do comes back as `keep` or `weird` with
the reason. Do not re-run it to retry.

`--apply` cannot skip a row, so if you held one back, run nothing: report it, and leave the sweep
to the Coach.

## 3. Strays, with `attic`

Only when the Coach said `attic`, and the survey listed a `stray`:

```sh
"${CLAUDE_PROJECT_DIR}/scripts/git-attic" --against origin/main
```

That is a dry run. If every branch it would retire is a `stray` in the survey, and no other,
run it again with `--apply`. If it would retire anything else, run nothing and report the
difference. Without `attic`, list the strays and say `/branch-sweep attic` would retire them.

## 4. Look at the weird ones -- do not fix them

For each `weird` row, spend a few read-only commands finding out what it is, enough for a
one-line read and a recommendation: a PR closed because its work landed another way, commits
reworded on main, a restack's leftover, a worktree whose directory label does not match its
branch.

## 5. Report

Your final message goes to the Coach, who may be reading on a phone. Link each PR in full the
first time it appears (`[#12](https://github.com/mrflip/safebyok/pull/12)`). Three lists, in this
order, each line one branch or worktree:

* **Swept** -- each removed worktree (path and branch); each closed branch with its PR, and
  `moved <tip7> → <target7>` or `tag only`, with the script's note when it says more than "on its
  merged head". Many tag-only branches may share one line. Retired strays, if step 3 ran.
* **Likely in progress** -- each `active` branch: its PR or "no PR yet", its worktree, and the
  script's note when the local tip differs from the PR's head.
* **Weird** -- each `weird` row, any row you held back, and any `keep` whose branch was finished:
  what it is, what you found, and what you recommend. These are the questions for the Coach.

Close with one line each for: the count closed already, worktree entries pruned, strays left
for `attic`, and the script's `remote` count (finished branches still on origin, which stay).
Then end.
