# Why the sprint skill is built as it is

For whoever changes `/sprint` or its agents. Nothing here is read when a sprint runs: SKILL.md,
`wrapup.md` and the two agent definitions are what runs.

**What costs context.** The orchestrator holds the longest context of any agent in a sprint, so
it is the one compaction catches mid-sprint, losing its place. Everything it reads stays and is
paid again on every turn. Each subagent pays its own definition, CLAUDE.md and its handoff on
every turn. The `description` of a skill or agent is paid by every session in the repository,
sprinting or not, which is why those are one sentence of when to use it.

* **The orchestrator is an inline skill, not a forked one.** It runs in the main conversation at
  no delegation depth, keeping live chat with the Coach, and workers delegate freely below it.
  `context: fork` would burn a layer, sever the chat, and background the orchestrator into a
  restricted toolset.
* **The sprint doc links files; it never holds copies.** Until 2026-10-17 the orchestrator
  mirrored every file in the sprint directory into a tab, whole. Each mirror put the file into
  its context twice (read, then written), and the progress document was mirrored at every
  milestone: well over 100k tokens a sprint, many times the skill itself. A link to the file on
  GitHub, pushed at milestones, costs nothing.
* **The orchestrator is the doc's only writer.** Every agent that touches a doc first loads the
  Docs guide (`topic.index` alone is 6--7k tokens), and a read comes back as XML at about four
  times the visible text. One writer pays that once and edits cell by cell; a clerk subagent per
  mirror, or workers writing their own rows, would pay it each time.
* **Reports are short; the thread file is the account.** The Coach reads the doc, the PR and the
  thread file, so a report carries only what the orchestrator acts on. A report relayed whole
  was paid twice in the orchestrator's context, once arriving and once sent on.
* **Handoffs carry only what varies.** The agent definitions are already loaded in each
  subagent; a handoff that restates them pays for the same rule twice on every turn.
* **Filing is a script.** By filing time the builder's context is at its largest, and filing (a
  rebase, a justify, a push) needs none of it. A fresh worker cost a spawn per thread;
  `scripts/file-thread` costs one background command, and a worker is spawned only when it stops.
* **Rulings live in turbochat's *Resolved* tab and the PR**, swept into the resolutions file at
  the end. They used to be written in five places as they came, with lines owed to filed threads'
  files until the restack.

**The reviewer runs isolated** (`isolation: "worktree"`). `/code-review` takes no working
directory, and the agents it starts read files from wherever their shell starts. A subagent's
shell starts in the main checkout, which holds the Coach's branch and other agents' unfinished
edits, not the thread; in another project's sprint the skill once checked out a commit there to
try code, and switched back 90 seconds later. Reviewers were fenced in with a rule passed to the
skill, a snapshot of the main checkout compared after, and a bail; that was about 40% of the
reviewer's definition. A probe on 2026-10-17 found that an agent spawned with
`isolation: "worktree"`:

* gets a fresh worktree under `.claude/worktrees/` (gitignored), cut from `origin/main`, with no
  `node_modules`, on a branch `worktree-agent-<id>`;
* has its shell return to that worktree, not the main checkout, between commands;
* starts every agent it spawns in that worktree too, so `/code-review`'s agents read the thread
  once the reviewer checks out its tip;
* is refused by the harness any git command aimed at the main checkout, even a read;
* may still run git against another worktree (reads were tried; the reviewer's fast-forward is a
  write, with the orchestrator doing it as the fallback);
* is not cleaned up once its HEAD has moved, so the orchestrator removes it.

**Workers are not isolated, yet.** An isolated worker would have the same protection from the
harness in place of `cd <root> &&` on every command. But a thread's branch is named for it,
`--no-track`, and cut from a stacked base, while isolation cuts `worktree-agent-<id>` from
`origin/main`; how the harness's cleanup reacts to a renamed branch on a moved base is untested.
Worth its own probe.
