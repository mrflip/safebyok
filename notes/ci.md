# CI and automation

This note covers what runs on a pull request and around it. It is for whoever works on the workflows,
or wants to know why a check failed. A thread needs none of it: what a PR must carry is in PROCESS.md,
*Pull requests*.

## On every pull request

CI runs on every PR, over the root and every workspace package. Two jobs must pass:

* `lint-typecheck` runs lint and typecheck, requires a changeset, checks that the Postgres image
  digest in `ci.yml` matches `e2e/compose.yaml`, and runs `actionlint` over the workflows through
  `scripts/actionlint.sh`. `pnpm justify` runs `actionlint` too, as `pnpm lint:workflows`.
* `test-build` runs the tests with coverage, which first builds every package and runs its package
  checks.

`node-compat` runs the tests on Node 22, the platform floor, and on the newest Node. The Node 22 run
must pass too; the newest-Node run only reports. The `postgres` job runs the VaultDB battery over a
real Postgres, and the ruleset does not require it yet. CodeQL scans the code and the workflows, and
shows a finding on the PR.

CI and CodeQL both run again on each push to main, one push at a time. A run in progress finishes,
and a run still waiting is replaced by a newer push, so a series of merges never uses more runners
than one run does.

## What passes locally and fails in CI

* **Build warnings.** Each package's `tsdown.config.ts` sets `failOnWarn: 'ci-only'`. A build warning
  (from rolldown-plugin-dts, publint or attw) therefore passes `pnpm justify` but fails `test-build`
  and `node-compat`. After changing what a package exports, or moving a checker or type between
  modules, run `CI=true pnpm --filter <pkg> build`. When CI fails and justify did not, suspect a
  warning first.
* **Slow tests.** CI runs `test:coverage` on shared runners, while `pnpm justify` runs plain
  `vitest run`. A CPU-bound test that took 0.7 s locally took 2.2 s under coverage, and on the runner
  ran past vitest's 5 s timeout (#623). Keep a single CPU-bound test under about 300 ms locally, and
  time a heavy one with `pnpm exec vitest run --coverage --reporter=verbose <file>`. Shrink the
  enumeration before reaching for a timeout argument.

## Dependabot

Dependabot opens grouped `deps:` PRs weekly. They get the same review as any other PR.

A PR whose every commit is Dependabot's needs a changeset only when it moves a public package's
runtime dependencies, as `scripts/runtime-deps.ts` reads them: `dependencies`, `peerDependencies`,
`optionalDependencies`, `peerDependenciesMeta`, `bundledDependencies`, or a package added, removed or
made private. In that case `.github/workflows/dependabot-changeset.yml` writes the changeset, a
`patch` named `.changeset/dependabot-<n>.md`, and pushes it with the release App's token, so CI runs
again on it. A devDependency or lockfile bump needs no changeset. A Dependabot branch that has a
commit by anyone else is an ordinary PR, and carries a changeset like one.
