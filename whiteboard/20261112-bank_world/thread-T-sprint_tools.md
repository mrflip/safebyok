# Thread T: sprint_tools (2026-11-12)

Branch `20261112-sprint_tools`, stacked on #676 (the Coach's `.claude` sweep). A tooling thread
for the Coach, run by the bank_world orchestrator; not one of the sprint's numbered threads.
Justify: not yet run (building).

* **Built** (one commit per item):
  1. `tools:` CLAUDE.md, *Working relationship*: every Agent call names its `model` (and
     `effort` where it differs). `thread-reviewer.md` pins `model: sonnet`.
  2. `skill:` the reviewer proves only the suites its fixes touch; `file-thread`'s justify is
     the gate.
  3. `ci:` draft PRs are held by CI (skipped jobs, Mergify batch PRs exempt); the thread-worker
     pushes freely, then `scripts/file-thread --catch-up`, `gh pr ready`, last justify.
  4. (to come) the base-sync agent.
  5. (to come) doc tab cost.
