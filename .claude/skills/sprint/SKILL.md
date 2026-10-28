---
name: sprint
description: Orchestrate a sprint -- an ordered series of threads issued at once, each built by a thread-worker in a worktree of its own, reviewed by a thread-reviewer, and filed as its own PR. Use when the Coach invokes /sprint, issues several "Next thread:" blocks, or asks for work to be run as a sprint. A single thread is not a sprint; just do it.
---

# Sprint orchestrator

You run a **sprint**: the Coach hands you an ordered list of threads and walks away. You plan it,
cut each thread a worktree, hand it to a fresh `thread-worker`, put a `thread-reviewer` over what
it built, file it, and decide as each report comes in whether to continue, resume, or stop.
Threads whose dependencies are met run side by side. A thread's mechanics are PROCESS.md
(*Threads*, *The history we keep*). Why this skill is built as it is, for whoever changes it, is
`DESIGN.md` beside it.

You orchestrate; you do not build, and you do not review. The main checkout is shared with the
Coach and other agents: never write to it, switch its branch, or touch anything uncommitted
there. You write the sprint's documents in a worktree of the sprint's own, and you are the only
writer of the sprint doc.

## 1. Plan

Pick a short `sprint_name` from the work (the Coach's word for it, if they gave one), and cut the
sprint its worktree: `scripts/cut-thread --no-install <sprint_name>`. In it, make
`whiteboard/YYYYMMDD-<sprint_name>/`. Every path below is relative to a worktree's root; hand the
sprint directory on in full, since workers read it from theirs.

**`<sprint_name>-plan.md`**:

* A header: date, mode (normal or YOLO, §4), the default **levels** -- the review level
  (`medium`, or `none`), the worker's and the reviewer's model and effort (their agents' own),
  and the style pass's model (`style-reviewer`'s pin) -- each unless the Coach named another, how
  many threads may run at once (3 unless the Coach named another), who issued it, and a status
  line you keep current.
* *Read first*: the notes and files every worker needs beyond CLAUDE.md, by section where a
  section will do.
* *Ground rules*: only what is particular to this sprint.
* The threads, numbered, each with the Coach's text **verbatim** and then your gloss: what it
  likely touches; its **levels**, where they differ from the defaults; **what it depends on**;
  your **look-ahead**; and its **size**. Set a thread's levels as the Coach suggests or directs,
  or as you judge: `sonnet` and a `low` review for a small, mechanical thread, a `high` review
  for one that touches what `notes/guarantees.md` covers; a lower effort for a mechanical change,
  a higher one where the work turns on judgment or on finding a cause; an `opus` style pass where
  the thread is mostly naming or vocabulary. Revise a later thread's levels as the earlier ones
  teach, and say so in its gloss. Read the whole request before writing any of this, because
  later threads bend earlier ones: a capability built in thread 3 and reused in thread 5 is
  designed once, for both. A worker's context only grows, so a thread that would build two
  features, or plainly run long, is two threads.
* *For the Coach*: anything already visible that needs a human.

**Dependencies decide the base.** A thread depends on another when it builds on its code, or when
the two would rewrite the same lines; threads in different corners of the tree are independent.
A thread is cut:

* from `origin/main`, when it depends on nothing unmerged;
* from the tip of the one thread it depends on, once that thread is **filed**, and its PR says
  "Stacked on #N";
* while it would stand on two unmerged threads, from the top of the two once you have restacked
  them into a line (`wrapup.md`, *Restack*). Never merge thread branches together.

The Coach merges a sprint as **one linear line**: each PR rebased onto the one below it, every
PR's base still `main`, so merging the top merges them all. Making that line is your job (§5).

**Size budgets.** Each thread keeps `.size-limit.json` in step with its own change. When what it
built moves a line's measure far enough that the rule (PROCESS.md, *Size budgets*) gives that
line another budget, up or down, the thread runs `pnpm size:budget --write` and commits the
result with the change that moved it, its PR saying which lines moved and why. A thread that
moves no line's budget leaves the file alone. The rule's round numbers keep most stacked threads
off each other's lines; where two meet at a restack, rerun `pnpm size:budget --write` on the
rebased branch rather than merge the digits by hand. Run `pnpm size:budget` while planning, and
name in a thread's gloss any line it will likely move.

**`<sprint_name>-progress.md`** -- yours alone: a curated summary of what the threads have taught,
newer than the plan wherever they disagree, under about 3,000 words. You write each handoff from
it; workers only look things up in it. Each worker keeps its own `thread-<N>-<label>.md` in the
same directory of its own branch, so no two writers share a file.

Commit both (`plan:`), push the sprint branch, and file it at once as a **draft** PR against
`main`, with a `plan:` title: the *sprint PR*. It holds only what no thread writes -- the plan,
the progress document, the resolutions, the sprint's `human/` entry -- so it never conflicts with
a thread, and its commits never force a restack. It joins the line last, on top.

**The sprint doc** is where the Coach watches, from any device. With the Claude Docs tools in the
session, birth one doc named for the sprint, with four tabs: *Open Matters* and *Resolved*, which
`/turbochat` sets up; *Progress*: a lead linking the plan and the progress document on GitHub
(`https://github.com/mrflip/safebyok/blob/<branch>/<path>`), then one table row per thread,
`Thread | Status | PR | Thread file | Review`, the thread file linked on the thread's branch; and
*Cleanup*, second in the tray: a one-line lead, then *Your calls*, a table `Matter | My call |
Lands in`, and *Finally*, a checklist of what the sprint owes before it closes (§3).
Give the Coach its link once in chat. Load the docs skill and guides and edit it cell by cell,
as turbochat says; never copy a
file into it: link the file, and push it. No Docs tools: say so in one line, keep the status in
chat, and carry on.

Post a short plan summary in chat -- threads, which run together and which wait, look-ahead
calls -- and proceed. Wait for approval only if planning surfaced a *significant* question (one
whose answer would change what gets built); that, ask now, before spawning anything.

## 2. Run the threads

Keep a **frontier**: every thread whose base exists, not yet started. Start frontier threads,
lowest number first, while fewer than the cap are underway; refill as threads file. Each thread
runs three steps.

**Build.** `scripts/cut-thread <label> <base>` cuts its worktree from the base §1 gives it, and
records that base for its reviewer and its filing. (Run the scripts as `<sprint root>/scripts/...`
once the sprint has its worktree: the main checkout may be on a branch that lacks them.) Spawn
one `thread-worker` with `run_in_background: true`, the thread's worker model and effort where
they differ from the agent's, and a `description` naming the thread (`Thread 3: vault_record`),
never with `isolation`. The prompt is the whole handoff,
re-sent on every one of the worker's turns: it carries what this thread needs from the plan and
the progress document, and points to the rest by file and section.

```
Thread <N> of sprint <sprint_name>. Sprint directory: <sprint root>/whiteboard/<YYYYMMDD-sprint_name>/.
Your worktree: <root>, on branch <branch>, cut from <origin/main | thread M's branch, PR #M>.
Mode: <normal | YOLO>. Scratch files: <scratchpad>/<label>/.

<the thread's text, verbatim>

From the sprint: <the ground rules that bear on this thread; the decisions and discoveries of
earlier threads it builds on or beside; its size-budget step, if any>.
Look-ahead: <what later threads need from this one, if anything>.
Read: <the plan's *Read first*, and what else this thread needs, by section>.
```

Every worker and reviewer sings out what it has turned to (`scripts/ohai`), and a hook logs each
compaction with its best guess at the agent, by that `description`. To see where each agent
stands, read the tail of the log every worktree shares,
`"$(git rev-parse --git-common-dir)/ohai.log"`, rather than resume or wait on one; read it too
as each report comes in, for the thread's compactions (§4).

What a worker reports it went looking for in the plan or progress document is a gap in the
handoffs: put it in the next ones. A background worker whose tools were refused (a permission it
could not ask for) is re-run in the foreground, alone.

**Review.** When the worker reports `ready`, spawn one `thread-reviewer` in the background with
`isolation: "worktree"` and the thread's reviewer model and effort -- unless the review level
is `none` or the thread's diff holds no code, in which case say so and go straight to filing.
Isolated, the reviewer and every agent it starts work in a worktree of their own, kept by the
harness from the main checkout.

```
Review of thread <N> of sprint <sprint_name>. Thread worktree: <root>, branch <branch>, PR #<n>.
Range: <base-sha>...<tip-sha>. Review level: <level>. Style pass: <model, if not the default>.
The plan's gloss: <the thread's gloss, verbatim>.
Compactions: <none | when, and before or after the worker's first justify>.
```

The tip is `git -C <root> rev-parse HEAD`; the base is `git config branch.<branch>.sprintbase`
(for a second review, the tip the first reviewer left). The reviewer fast-forwards the thread's
branch to its fixes, or gives you the SHA to do it with (`git -C <root> merge --ff-only <sha>`).
Then remove the reviewer's worktree and branch, which its result names (`git worktree remove
<path>`, `git branch -D <branch>`), and post its PR comment (`gh pr comment <n>`).

**File.** Run `scripts/file-thread <root>` in the background: it catches the branch up, proves
it, pushes it, and removes the worktree. When it exits 3 (a conflict with main) or 4 (red), spawn
a fresh `thread-worker`:

```
File thread <N> of sprint <sprint_name>. Worktree: <root>, branch <branch>, PR #<n>.
scripts/file-thread stopped with: <its last lines>. Thread file: <sprint dir>/thread-<N>-<label>.md.
```

Rework after a `flagged` review goes to a fresh `thread-worker` too, never to the builder:

```
Rework thread <N> of sprint <sprint_name>. Worktree: <root>, branch <branch>, PR #<n>.
Thread file: <sprint dir>/thread-<N>-<label>.md. Review: the reviewer's comment on PR #<n>.
Act on: <the finding, as a directive>.
```

Resuming the builder (SendMessage) is for the answer to its blocking question, which it needs
mid-build. Once a thread files, one stacked on it may be cut. A `blocked` or `abandoned` worker
gets no review: the review follows the resume that finishes it.

## 3. As each report comes in

1. **Verify, cheaply.** For `ready`: the worker's commits are in its worktree
   (`git -C <root> log --oneline -5`), its tree is clean, and its PR is out of draft
   (`gh pr view <branch> --json isDraft`). Trust the reports for the rest.
2. **Tell the Coach.** A line in chat -- thread, verdict, PR link -- and the thread's row in
   *Progress*. Each item of the report's *Open matters*, and each YOLO decision, becomes a
   `drafting` row of its own in *Open Matters* in the same pass -- one item, one row, never
   rolled up -- tagged with where it was raised (`#N`, thread N); say in chat why you left any
   out. Start the row with **TOP** when the matter blocks other work, changes a contract or a
   lot of code, or is one the Coach would want first: with little time, they read those. The
   full account is the thread file and the PR: don't paste a report into chat or the doc.

   **What needs no decision goes to *Cleanup*, not *Open Matters*.** Unless it changes an
   outcome, a matter of scheduling -- which thread does it, now or at the restack -- needs no
   report: put it on *Finally*. So do a loosening a later thread tightens, a mostly harmless
   leftover that later work clears away, and anything else that needs no decision but would need
   attention if the sprint ended today. When the Coach answers a row "your call", or a row is one
   they plainly would, the decision is yours: make it, move the row to *Your calls* with the call
   and where it lands, and do it. Revisit what is already on *Cleanup* as rows come in, and tick
   off what has landed.
3. **Tend the documents.** Revise later threads' glosses where a thread's discoveries changed
   them. When a thread files, add a `*Review:*` line under its plan entry from the reviewer's
   report: what it fixed, and each finding it left, with its disposition. A worker may pull a
   later thread's work forward, declaring it: strike that from the later thread's text. Curate
   the progress document: condense what later threads no longer need, hoist a buried finding to
   where its reader will look, and spin an outgrown block into a file of its own, with a line on
   who should read it. Mark what you add with `*Orchestrator:*`; never edit a worker's thread
   file. Commit (`plan:`) and push to the sprint PR at milestones.
4. **Carry each ruling back** as turbochat says (*Carrying a ruling back*): the row moves to
   *Resolved*, and the ruling goes beside its question in the PR. A live worker gets a ruling it
   needs as a directive when you resume it.
5. **Decide** (§4), refill the frontier, and wait for the next report. If the Coach has
   interjected meanwhile, fold their guidance in first.

## 4. Continue, resume, or stop

Default rules, absent other guidance:

* **Continue** past a `filed` thread with a `clean` or `fixed` review. Minor questions, and
  minor findings the reviewer left, ride along in the PR and the documents.
* **A `flagged` review** -- a significant finding the reviewer may not act on -- is handled like
  a worker's blocking question. If the fix is a two-way door and you are in YOLO, hand it to a
  fresh worker with the rework handoff (§2); it builds on the branch as it now stands, and
  reports `ready` again. Then spawn a second reviewer over the new commits only
  (`<tip the first reviewer left>...<the new tip>`). Never a third: what is still open after
  that is the Coach's.
  Otherwise the finding is the Coach's: the thread waits, unfiled, in its worktree, with the
  reviewer's comment on its PR saying why.
* **Resume** a `blocked` worker when you can supply what it lacks: an answer the plan or
  progress document already holds, or -- in YOLO -- a judgment call you can make and record. A
  rebase conflict that takes judgment about which behaviour wins is the Coach's.
* **A worker that compacts** is doing what its cap asks, until compaction starts to cost more
  than it saves. The first: nothing to the worker; note it on the thread's *Progress* row and
  in its review handoff, where the reviewer looks harder at what spans it. A second: the thread
  outgrew one context, a planning lesson for the progress document; check later threads' glosses
  for the same shape, and split any that have it. A third, or a second soon after the first:
  the worker is thrashing. Resume it with a directive to commit what is sound, bring its thread
  file up to date, and report `blocked` with what remains; then a fresh worker continues from
  the thread file (the rework handoff, with *Continue* for *Act on*), or what remains becomes a
  thread of its own. A worker whose result reads *Autocompact is thrashing* was stopped by the
  harness for the same reason: its worktree stands as it left it, uncommitted work included, and
  a fresh worker continues there.
* **A trivial fix to closed work** -- a lint error, a typo -- in what another thread built, after
  its agent is done: hand it to the thread underway as a directive, to fix in its own branch,
  or, while the other thread's PR is filed but unmerged, amend it there. It needs no thread of
  its own, and no row.
* **Pause the sprint** -- start no new threads, let those underway reach their next report and
  hold them there, update the status lines and *Progress*, write
  `human/YYYYMMDD-sprint_<name>_paused.md` in the sprint worktree saying exactly where things
  stand (which threads filed, which wait in which worktree, and why), commit and push, say so in
  chat, and end your turn -- when:
  - a worker is `blocked` on a significant question you may not answer;
  - `pnpm justify` is red and the worker could not repair it;
  - a guardrail conflicts with the work (say so and propose the alternative, per CLAUDE.md);
  - a worktree or a branch is in a state neither you nor the reports explain (a `bailed`
    reviewer is this case);
  - a thread's outcome invalidates other threads' premises. A stopped thread holds back the
    threads stacked on it; independent threads may carry on.
* **Every remaining thread waits on a merge**: that is a pause too, naming the PRs the Coach
  would merge to free them.
* **Stopping is cheap** outside YOLO: every thread's work is pushed to its PR, unfiled work also
  waits in its worktree, and a paused sprint resumes where it stood. When unsure, pause.

**YOLO** (the Coach says so, usually at the invocation): be more reluctant to pause, not more
willing to gamble. Answer judgment calls a competent Coach would consider two-way doors, record
each as a row in *Open Matters* and in the sprint's `human/` entry, and keep going. Still pause
for anything destructive or hard to reverse, anything touching `main` or a release, a guardrail
break, or a one-way design call: the stored format and the public surface are contracts
(CLAUDE.md, *What the package promises*). YOLO never means merging a PR.

## 5. Wrap up

When the last thread files, or the sprint pauses for good, read `wrapup.md` beside this file and
follow it: it restacks the line, closes the sprint PR, and sweeps *Resolved* into the resolutions
file. Never merge anything.
