# CI and automation

What runs on a pull request and around it, for whoever works on the workflows or wants to know why
a check failed. A thread needs none of it: what a PR must carry is PROCESS.md, *Pull requests*.

## On every pull request

CI runs on every PR, over the root and every workspace package: `lint-typecheck` (lint, typecheck,
a changeset, and `actionlint` over the workflows, by `scripts/actionlint.sh`,
which `pnpm justify` runs too, as `pnpm lint:workflows`) and `test-build` (tests with
coverage, which builds every package with its package checks) must pass;
`node-compat` runs the tests on Node 22, the platform floor, which must pass too, and on the
newest Node, which reports. CodeQL scans the code and the workflows, and a finding shows on the
PR.

Both run again on each push to main, one push at a time: a run in progress finishes, and one
still waiting is replaced by a newer push, so a run of merges holds no more runners than one run.

## What passes locally and fails in CI

* **Build warnings.** Each package's `tsdown.config.ts` sets `failOnWarn: 'ci-only'`, so a build warning
  (rolldown-plugin-dts, publint, attw) passes `pnpm justify` and fails `test-build` and `node-compat`. After changing what a
  package exports, or moving a checker or type between modules, run `CI=true pnpm --filter <pkg> build`. When CI fails and
  justify did not, suspect a warning first.
* **Slow tests.** CI runs `test:coverage` on shared runners; `pnpm justify` runs plain `vitest run`. A CPU-bound test that
  took 0.7 s locally took 2.2 s under coverage, and on the runner ran past vitest's 5 s timeout (#623). Keep a single CPU-bound
  test under about 300 ms locally, and time a heavy one with `pnpm exec vitest run --coverage --reporter=verbose <file>`.
  Shrink the enumeration before reaching for a timeout argument.

## Dependabot

Dependabot opens grouped `deps:` PRs weekly; they get the same review as any other. One
whose every commit is Dependabot's is asked for a changeset only when it moves a public package's
runtime dependencies, as `scripts/runtime-deps.ts` reads them (`dependencies`, `peerDependencies`,
`optionalDependencies`, `peerDependenciesMeta`, `bundledDependencies`, a package added, removed
or made private): `.github/workflows/dependabot-changeset.yml` writes it, a `patch`
named `.changeset/dependabot-<n>.md`, and pushes it with the release App's token, so CI runs
again on it. A devDependency or lockfile bump needs none. A Dependabot branch with a commit of
anyone else's on it is a PR like any other, and carries a changeset like one.
