# Thread sprint_rules: sprint rules carried onto main (2026-10-17)

Branch `20261017-sprint_rules`, PR #146, cut from `origin/main` at 365d1dcd, not stacked. Justify:
green (documents only).

* **Built**: the process rules the push_to_100_a orchestrator wrote on #125's branch, folded into
  main's post-#135 text of `.claude/agents/thread-reviewer.md`, `.claude/agents/thread-worker.md`,
  `.claude/skills/sprint/SKILL.md` and `.claude/skills/turbochat/SKILL.md`: *Open matters* at the
  end of every worker and reviewer report; a relayed ruling restated beside its question; the
  sprint's resolutions file; open matters cycled to the tab one row each, rulings carried back,
  owed lines added at the restack; `scripts/clear-ds-store.sh` before a filer's worktree remove;
  turbochat's row provenance, chip reset, and *Carrying a ruling back*. PR #146's body maps each
  rule to its section.
* **Decisions taken**: the plan gains a *Coach rulings* bullet (the diff referred to that list,
  but main's plan template had none). §3.3's "never edit a worker's thread file" now excepts the
  owed ruling lines, so the two sections agree. Turbochat's lead "keep no provenance" became "the
  tab keeps no archive", since rows now say where they were raised.
* **Deviations**: dropped the diff's "(in a sprint's *Open Matters* tab, when it keeps one)" and
  "push it with your next push" from the worker's text, as main already says the tab is the
  orchestrator's and pushes come at milestones.
