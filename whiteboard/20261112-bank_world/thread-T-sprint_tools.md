# Thread T: sprint_tools (2026-11-12)

Branch `20261112-sprint_tools`, PR #680 (base main), stacked on #676 (the Coach's `.claude`
sweep). A tooling thread for the Coach, run by the bank_world orchestrator; not one of the
sprint's numbered threads. Proved: every package at the build; `justify:root` (287) and
`lint:workflows` after each rework.

* **Built** (one commit per item, plus a coordinator revision of 3):
  1. `tools:` CLAUDE.md, *Working relationship*: every Agent call names its `model` (and
     `effort` where it differs). `thread-reviewer.md` pins `model: sonnet`; the sprint skill's
     `high` review for guarantees-touching threads asks for `opus` by name.
  2. `skill:` the reviewer proves only the suites its fixes touch (per package, or
     `justify:root`, `lint:workflows`, `lint`); `file-thread`'s full justify is the gate.
     DESIGN.md records it. `style-reviewer.md` step 5 aligned the same way.
  3. `ci:` CI holds a draft PR until it carries the label `ci` (created on GitHub) or leaves
     draft. `ci.yml` and `codeql.yml`: each job's `if` runs on push and schedule, and on a PR
     that is out of draft, labelled `ci`, or a Mergify batch. There is no `labeled` trigger (the
     review rework, below): the label is read at a push, `opened`, `reopened` or
     `ready_for_review`. `scripts/file-thread --catch-up <root>` rebases and pushes without
     proving (two tests). Workers: draft from the first push; at ready, label `ci`, then catch up
     (whose push, carrying the unpushed `plan:` commit, starts CI), last justify while CI runs,
     report `ready`; never `gh pr ready`. The orchestrator takes
     a PR out of draft once it is filed and the line below it is green. PROCESS.md, notes/ci.md,
     notes/releasing.md, the reviewer's preamble and the sprint skill's §3 check
     (`ci` label, pushed head, and `gh pr checks` showing a run that did not skip) say the same.
  4. `tools:` `.claude/agents/base-sync.md` (`opus`; Bash, Read, Grep, Glob, Write), and a
     paragraph in the sprint skill's §3 *Tend the documents*: the orchestrator runs it after
     plan commits at milestones.
  6. `tools:` (second rework, the Coach's ruling) a worker tests as it judges while building,
     and is **ready** when lint, typecheck and test are green for the packages it changed and
     their dependents, plus `justify:root` / `lint:workflows` for root files or a workflow; the
     full justify is for confidence, and filing's is the gate. The threshold is stated once, in
     the worker bodies' *Ready* step and a CLAUDE.md *Commands* line (the orchestrator's word:
     timings are being measured, so no figures in files); PROCESS.md *Proving* has the commands.
     The second review's minors: `ci.yml`'s header states only the present rule; `codeql.yml`'s
     note and the worker's catch-up step in plain sentences.
  5. `skill:` the sprint doc's *Progress* tab is a lead plus a list of GitHub links (plan,
     progress, design, threads, rulings on the sprint branch; one line per thread file, added
     at cut); statuses live in the plan, so §3, the compaction note, pausing and wrapup point
     there. Turbochat: a whole-row replace is refused; insert after, then a guarded delete, in
     one `batch`.

* **base-sync, how it works**, with its decisions, approaches set aside and scratch test:
  `thread-T-base-sync.md`, beside this file; for whoever changes `.claude/agents/base-sync.md`.

* **Decisions taken**:
  - Workers and documentarian stay unpinned: their models are the orchestrator's per-thread
    call (worker) or the Coach's (documentarian); a pin would only be overridden.
  - Mergify's batch PRs are drafts on `mergify/merge-queue/` and the queue waits on their
    checks, so they are exempt from the draft hold.
  - Review rework: the `labeled` trigger is gone. Any other label (`queue`, Dependabot's,
    triage) fired a run whose jobs all skipped on the PR's head, and a skipped check reads as
    passed, so it could mask a red or running real run in the required-check rollup. With the
    label read only at a push, a skip lands only on a commit with no real run yet (a later
    `ready_for_review` run supersedes it), unless someone removes `ci` and reopens or pushes back
    to an earlier commit: the docs say the label stays on.
  - `--catch-up` in `file-thread` rather than rebase instructions in the worker's prose: the
    same rebase filing does, already tested.

* **Approaches set aside**: a dispatching workflow that starts CI on the `ci` label alone
  (machinery the orchestrator ruled out); a gating job the others `needs:` instead of the
  copied `if:` (its dependents skip all the same, and GitHub has no workflow-level `if`);
  the `labeled` trigger with a concurrency group per non-`ci` label (the first build: it
  cancelled nothing, but still made the skipped runs); hand-written rebase steps in the worker
  (duplicates file-thread). base-sync's own: `thread-T-base-sync.md`.

* **Discoveries**:
  - `pnpm --filter "...[<ref>]"` selects the workspace root when a root file changed, and the
    root's `lint`/`typecheck`/`test` run every package: hence `--filter '!{.}'` beside it (an
    empty selection exits 0). Each selected package's `test` builds its own dependencies, one at
    a time (the core twice for react plus the demo; correct). Probed with a stray
    line in react's `index.ts`: react and the demo selected, all three tasks green.
  - The root's `[ref]` blind spot: `tsconfig.base.json`, the lockfile and `pnpm-workspace.yaml`
    belong to the root but bind every package, so a change to them takes the full justify.
  - The `mainly main` ruleset requires `lint-typecheck`, `test-build`, `node-compat (22)`,
    `node-compat (26)`, `postgres` and CodeQL. ci.yml's comments and notes/ci.md said only the
    first two (and that `postgres` was not yet required); both now name all of them.
  - A held draft whose head is already on origin gets no run from adding the label: it runs at
    its next push (the reviewer's fix, filing's rebase) or when taken out of draft.
  - The release workflow's Version PR opens as a draft, so CI now holds it until the Coach
    labels it `ci` or marks it ready (notes/releasing.md says so).
  - A skipped matrix job reports a bare `node-compat`, not `node-compat (22)` (seen on #680's
    held run); harmless on a draft, which cannot merge. The `ci` label's run started at once.

* **For the Coach**:
  - The ruleset requires `node-compat (26)`, but ci.yml means the newest Node only to report
    (`continue-on-error`). If a failing (26) leg blocks merge, drop it from the ruleset.
  - base-sync rewrites the base branch: once `origin/<B>` exists, pushing it takes a force-push,
    which the agent reports and leaves to you.
  - A base-only *plan* commit that conflicts with the sprint's plan loses its conflicting hunks
    to the sprint's version too (reported, kept in the snapshot). Rare if your hand edits are
    swept as plan commits; say if plan paths should conflict instead.
  - A root script (`pnpm justify:since <base>`, say) could run the three filtered readiness
    tasks as one command. Worth adding?
