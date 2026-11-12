# Thread T: sprint_tools (2026-11-12)

Branch `20261112-sprint_tools`, PR #680 (base main), stacked on #676 (the Coach's `.claude`
sweep). A tooling thread for the Coach, run by the bank_world orchestrator; not one of the
sprint's numbered threads. Justify: green (every package; root 287 tests; actionlint clean).

* **Built** (one commit per item, plus a coordinator revision of 3):
  1. `tools:` CLAUDE.md, *Working relationship*: every Agent call names its `model` (and
     `effort` where it differs). `thread-reviewer.md` pins `model: sonnet`; the sprint skill's
     `high` review for guarantees-touching threads asks for `opus` by name.
  2. `skill:` the reviewer proves only the suites its fixes touch (per package, or
     `justify:root`, `lint:workflows`, `lint`); `file-thread`'s full justify is the gate.
     DESIGN.md records it. `style-reviewer.md` step 5 aligned the same way.
  3. `ci:` CI holds a draft PR until it carries the label `ci` (created on GitHub) or leaves
     draft. `ci.yml` and `codeql.yml`: `labeled` added to the types; each job's `if` runs on push
     and schedule, and on a PR that is out of draft, labelled `ci`, or a Mergify batch; a
     `labeled` event runs only for `ci`. `scripts/file-thread --catch-up <root>` rebases and
     pushes without proving (two tests). Workers: draft from the first push, catch up, label
     `ci`, last justify while CI runs, report `ready`; never `gh pr ready`. The orchestrator takes
     a PR out of draft once it is filed and the line below it is green. PROCESS.md, notes/ci.md,
     notes/releasing.md, the reviewer's preamble and the sprint skill's §3 check
     (`ci` label and pushed head) say the same.
  4. `tools:` `.claude/agents/base-sync.md` (`opus`; Bash, Read, Grep, Glob, Write), and a
     paragraph in the sprint skill's §3 *Tend the documents*: the orchestrator runs it after
     plan commits at milestones.
  5. `skill:` the sprint doc's *Progress* tab is a lead plus a list of GitHub links (plan,
     progress, design, threads, rulings on the sprint branch; one line per thread file, added
     at cut); statuses live in the plan, so §3, the compaction note, pausing and wrapup point
     there. Turbochat: a whole-row replace is refused; insert after, then a guarded delete, in
     one `batch`.

* **base-sync, how it works**: snapshot to `<git-common-dir>/base-sync/<ts>/` (status, patches,
  file copies with mtimes, refs `refs/base-sync/<ts>/{head,stash}`; its own stash entry is
  dropped once anchored, never anyone else's). Build detached: origin/main, each stack branch
  (rebased only when not already on the one below, committer date = author date so reruns make
  the same SHAs), the sprint's directory and `human/` squashed into one commit dated at the
  sprint's tip, then the base branch's own commits picked in order. A conflicting pick is
  retried with `-X ours`: the stack's side wins, the clean hunks stay, and the conflicted files
  are kept in `dropped/<sha>/` for the report. Uncommitted changes are classified by three-way
  `git merge-file` and author times (identical, untouched, contained, merges, overlaps,
  deleted-vs-changed, binary, carried), each verdict mapped to an action by an awk table the
  agent may overrule on content; "when unsure, merge or conflict, never drop". Conflict markers
  left by a run come back as `carried` on the next and are restored untouched.

* **Decisions taken**:
  - Workers and documentarian stay unpinned: their models are the orchestrator's per-thread
    call (worker) or the Coach's (documentarian); a pin would only be overridden.
  - Mergify's batch PRs are drafts on `mergify/merge-queue/` and the queue waits on their
    checks, so they are exempt from the draft hold.
  - A label other than `ci` gets its own concurrency group (by run id), or adding it would
    cancel the PR's run in progress.
  - `--catch-up` in `file-thread` rather than rebase instructions in the worker's prose: the
    same rebase filing does, already tested.
  - base-sync's snapshot root defaults inside `.git`, which outlives a session scratchpad.
  - On a base-only commit's conflict the stack wins by default (the Coach's word), clean hunks
    kept; whole commits are left out only on a delete/modify conflict.
  - Staging comes back only for `untouched` rows; elsewhere it is lost, and reported.

* **Approaches set aside**: hand-written rebase steps in the worker (duplicates file-thread);
  `checkout --ours` on conflicted files (would drop the commit's clean hunks in them); aborting
  and leaving out a conflicting base commit whole (the first draft; superseded by the Coach's
  "stack wins" ruling); `%ct` for change times (a rebuild stamps the run time); trusting
  `git diff --diff-filter=U` alone for an empty pick (rerere stages its replay, which made a
  real commit read empty: rerere is now off for every pick and rebase).

* **Discoveries**:
  - The release workflow's Version PR opens as a draft, so CI now holds it until the Coach
    labels it `ci` or marks it ready (notes/releasing.md says so).
  - A skipped matrix job may report no `node-compat (22)` check; harmless on a draft, which
    cannot merge, but unverified on GitHub.
  - The scratch test: a `git clone --shared` world (scratchpad `sprint_tools/setup.sh`) with
    two stacked threads (the second cut from the first's older tip), a sprint branch, a base
    branch with plan-only, base-only, patch-equivalent and conflicting commits, a pre-existing
    stash and one uncommitted change of each kind. Four runs by an `opus` agent following the
    file; the last two runs gave the expected verdict on every row, identical SHAs and restored
    files (sha1 and mtime, markers included) on a second pass, and the pre-existing stash
    untouched. Each round's defects were fixed in the file.

* **For the Coach**:
  - CLAUDE.md's "`pnpm justify` green before every commit" now sits beside a worker that pushes
    before its last justify (CI runs beside it). Pushing is not committing, but say if the
    line should name the exception.
  - base-sync rewrites the base branch: once `origin/<B>` exists, pushing it takes a force-push,
    which the agent reports and leaves to you.
  - A base-only *plan* commit that conflicts with the sprint's plan loses its conflicting hunks
    to the sprint's version too (reported, kept in the snapshot). Rare if your hand edits are
    swept as plan commits; say if plan paths should conflict instead.
