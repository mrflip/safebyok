# 2026-10-16: ci_release -- three things only your hands do, and what is unproven until merge

Thread 8 of push_to_100_a, [#130](https://github.com/mrflip/safebyok/pull/130). Nothing here blocks
the PR; each is something to do or to watch once it merges.

* **Add `node-compat (22)` to the main ruleset's required checks.** CI's node-compat job now gates
  on Node 22 (the platform floor) and only reports on the newest Node (`continue-on-error` for the
  rest of the matrix). A workflow cannot make a check required; the ruleset is yours.
* **Watch the first Dependabot runtime-dependency PR after merge.** `dependabot-changeset.yml` was
  written and its script tested here (against a scratch repository, and the CI gate's shell block
  run by hand), but it cannot run until it is on main. Unproven: that the `releasing` environment's
  `RELEASE_APP_PRIVATE_KEY` reaches a `pull_request_target` run Dependabot started (if the
  `app-token` step fails for want of a key, add the same key as a **Dependabot secret** in the
  repository's settings); that the App's push of `.changeset/dependabot-<n>.md` re-runs CI on the
  branch; and that Dependabot's later behaviour on a branch with a bot commit is as expected (it
  stops rebasing, as it did for your hand-written ones).
* **The release workflow's retry** (`publish` re-reports a tag whose GitHub release is missing)
  reads the release with `gh` using the token the changesets action gives the script. Unproven
  until a release fails between tag and release; the logic is tested with a fake `gh`. If `gh`
  cannot authenticate there, the run fails calmly (`could not tell what is left to do`) rather
  than guess.
* **CLAUDE.md's *Commands* is a line stale** (I did not edit it): `pnpm justify` now also runs the
  size budgets, and `pnpm size` now builds once; `pnpm size:check` measures what is already built.
