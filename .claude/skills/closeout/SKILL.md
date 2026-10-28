---
name: closeout
description: Close out a working session -- account for every piece of planned work and every subagent, surface the open questions, and, only when nothing is left, tidy away the stray resources this session made. `docme` also gathers its whiteboard and human/ files into a doc. Use when the Coach invokes /closeout or says they are wrapping up the session.
disable-model-invocation: true
argument-hint: "[docme] [clarifications]"
---

# Close out the session

The Coach is about to walk away from this session. Answer three questions in order, and stop
at the first one whose answer is "not yet": an unfinished session is reported, not tidied.

The Coach's words after the command: `$ARGUMENTS`

They are clarifications, and where they conflict with this file, they win: "don't wait for the
reviewer", "leave the convex worktree", "thread 3 is dropped". If they begin with `docme`, also
do step 5; the rest of the string is clarifications as usual.

This runs inline, in the conversation that did the work, because only it knows what was planned
and what it started. Never give this skill `context: fork`.

## 1. Is the planned work finished?

Gather the plan from wherever this session kept it: the chat itself, the todo list, a sprint's
`-plan.md` and `-progress.md`, a thread's `whiteboard/` directory. For each item, check the
ground rather than your recollection, and give it one status:

* **done** -- committed, `pnpm justify` green; or **filed** -- its PR is open and out of draft
  (`gh pr view <n> --json state,isDraft,headRefOid`, its head the branch tip you pushed). A PR
  this session left in draft is taken out (`gh pr ready <n>`) before you report: drafts are only
  for work underway (PROCESS.md, *Pull requests*);
* **underway** -- a subagent or background task is still on it;
* **blocked** / **not started** -- and why.

Check each changeset this session's branches add, too
(`git diff --name-only --diff-filter=A origin/main...<branch> -- .changeset/`):

* **Its name** is its thread's, `YYYYMMDD-<label>.md`, or `-2`, `-3` after it for a second or
  third. `pnpm changeset` names it so; a random name (`wacky-deserts-start.md`) means it was
  written around the script, or off the thread's branch.
* **Its contents** say what the branch does now, not what it first meant to: every public package
  it changes, a bump that fits, and a sentence that matches what landed. An empty changeset is
  only for a branch that changes no public package (tooling, tests, docs).

Mend a wrong one in the thread's worktree. The mend may amend the commit that added it rather
than stack a new one: `git commit --amend` when that is the tip; otherwise
`git commit --fixup=<sha>`, then `GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <base>`.
Push with an explicit lease (PROCESS.md, *The history we keep*). Until its changeset is right, an
item is not **done**.

Then every subagent and background task this session started: `ListAgents` and the task list
(including `Workflow` runs and `run_in_background` shells). Each one has either reported or
been stopped. One still running is **underway**: say so and wait for it, or ask the Coach
whether to stop it. Never describe a result that has not arrived.

## 2. What needs the Coach?

Collect what is undecided: questions raised in chat and not answered, a reviewer's `flagged`
findings, open questions in the PR bodies and whiteboards this session wrote, guardrails you
bent (`eslint-disable-line`, `@ts-expect-error`), `notes/security_flags.md` entries the Coach has not
seen yet. Each comes with a one-line recommendation, and with a link to where it lives.

## 3. Tidy up -- only if 1 and 2 left nothing to do

If anything is underway, blocked or not started, or a question would change what gets built,
skip this step and go to the report: those resources may still be needed.

Clean up only what you are **certain** this session made: you can point to the command in this
conversation that created it. What you merely suspect is yours -- a worktree with a familiar
label, a process you might have started -- is listed in the report, and left alone.

May go, when it is this session's:

* **A worktree** whose branch is pushed and whose PR is filed (or whose work is committed and
  the Coach said to drop it): first `git -C <root> status --porcelain` is empty and
  `git -C <root> log @{push}..` is empty, then `git worktree remove <root>`. Never `--force`:
  if git refuses, it is protecting something, and the refusal goes in the report.
* **A background shell, dev server, watcher or `Monitor`** this session started: stop it.
* **A `CronCreate` job or `ScheduleWakeup`** this session scheduled for itself: delete it, unless
  the Coach asked for it to outlive the session.
* **Throwaway files** this session wrote outside the repo (the scratchpad clears itself).

Never touch:

* **A branch**, local or remote, nor a tag (a `-prerebase` tag is a marker, too). Branches stay
  for their PRs and as the record of the work; no `git branch -d`, no `push --delete`. Merged
  threads are tidied by `/branch-sweep`, when the Coach asks for it.
* **Another worker's worktree**, or one you cannot tie to a command of this session's -- even if
  it looks stale. Nor `git worktree prune`, which reaches into everyone's.
* **The main checkout**: its branch, its uncommitted changes, its stashes. It is shared.
* **Anything the Coach or another agent wrote**: their `human/` entries, their whiteboards.

## 4. Report

In chat, short enough to read on a phone:

* a status line: `closed` (all done, tidied) | `open` (work or questions remain) | `waiting`
  (a subagent is still running);
* each piece of work with its status, every PR linked in full the first time
  (`[#12](https://github.com/mrflip/safebyok/pull/12)`);
* the questions from step 2, with recommendations;
* what you removed, and what you left that might be stale but you could not prove was yours.

If the session leaves anything open, bring its thread's or sprint's documents up to date in that
thread's worktree, committed on its branch, so the next session can pick it up from there; never
write them in the main checkout.

## 5. `docme` -- the session's documents, as a doc

Only when the arguments begin with `docme`. Load the session's docs skill (or the docs
connector's guide) before the first docs call, and follow it to make one doc titled
`YYYY-MM-DD closeout: <what the session was about>`:

* **The first tab is the report** from step 4, ending with the list of files left out (below).
* **Then one tab per markdown file** under `whiteboard/` or `human/` that this session wrote,
  edited, or worked from (a sprint's plan, a thread's notes), named for its path
  (`winboard/20261014-convex_vaultdb/convex_vaultdb-plan.md`). The content is the file's,
  as it stands at the tip of its branch: not summarized, not edited. A worktree that step 3
  removed still has its branch: read the file with `git show <branch>:<path>`.

Leave out what does not belong: `human/README.md`, other sessions' entries, anything not
markdown, and any file over about 40 KB. Name each one left out in the report's list, with
its size and a word on why, so the Coach can ask for it. Give the Coach the doc's link with the
report.

