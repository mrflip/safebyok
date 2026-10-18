# CI and automation

What runs on a pull request and around it, for whoever works on the workflows or wants to know why
a check failed. A thread needs none of it: what a PR must carry is PROCESS.md, *Pull requests*.

## On every pull request

CI runs on every PR, over the root and every workspace package: `lint-typecheck` (lint, typecheck,
no merge commits, a changeset, and `actionlint` over the workflows) and `test-build` (tests with
coverage, which builds every package with its package checks, then the size budgets) must pass;
`node-compat` runs the tests on Node 22, the platform floor, which must pass too, and on the
newest Node, which reports. CodeQL scans the code and the workflows, and a finding shows on the
PR.

## Dependabot

Dependabot opens grouped `deps:` PRs weekly; they get the same review as any other. One
whose every commit is Dependabot's is asked for a changeset only when it moves a public package's
runtime dependencies, as `scripts/runtime-deps.ts` reads them (`dependencies`, `peerDependencies`,
`optionalDependencies`, `peerDependenciesMeta`, `bundledDependencies`, a package added, removed
or made private): `.github/workflows/dependabot-changeset.yml` writes it, a `patch`
named `.changeset/dependabot-<n>.md`, and pushes it with the release App's token, so CI runs
again on it. A devDependency or lockfile bump needs none. A Dependabot branch with a commit of
anyone else's on it is a PR like any other, and carries a changeset like one.

## Size checks

`pnpm size` and `pnpm size:check` hold each bundle to its budget in `.size-limit.json`; how a
budget is set is PROCESS.md, *Size budgets*.

Only the ESM build is measured: it is what a bundler reads and tree-shakes, and the CommonJS
build is for Node hosts, where bytes shipped to a browser are not the concern. A package's
peers (`safebyok`, `zod`, `react`) are left out of its own entry's measure with `ignore`: the
host has them already, and the budget is for what the package adds. `pnpm size` builds the
measured packages once and measures them; `pnpm size:check` measures what is already built,
which is what `pnpm justify` does after its tests have built everything. size-limit itself runs
on Node `^22.19`, `^24.5` or `>=26`, narrower than our `engines`; CI runs it on the pinned Node.
