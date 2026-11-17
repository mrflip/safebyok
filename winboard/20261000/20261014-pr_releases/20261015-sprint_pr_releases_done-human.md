# 2026-10-15: Sprint pr_releases done -- all three threads merged; the first release is yours

The sprint made releases PR-based. `safebyok-react` is built and checked like the core, the core
lives in `packages/safebyok` beside the other packages, and tests run per package and whole-repo.
Releases go through changesets: a changeset merged to `main` opens a Version PR, and merging that
stages every public package on npm for your approval. The threads stalled after a red restack; this
session restacked them onto `main` (after the convex sprint's #17 to #21) and you merged them.

**PRs, in the order they filed and merged**

1. [#15](https://github.com/mrflip/safebyok/pull/15): `safebyok-react` publishable. Review clean.
   The restack added four commits giving `safebyok-convex` the same `build:deps` hooks, coverage
   and CI, and `workspaceConcurrency: 1`.
2. [#16](https://github.com/mrflip/safebyok/pull/16), stacked on #15: the core under
   `packages/safebyok`. Review clean. The restack added two commits: the Convex tests import
   `tests/vault-db-suite.ts` from its new home, and convex's lint script.
3. [#22](https://github.com/mrflip/safebyok/pull/22), stacked on #16: changesets releases. The
   review's one fix (the stage script reports a failed lookup and goes on) is in it. It carries an
   empty changeset, which releases nothing; the release run on its merge chose "none".

**Done since the pause, by you:** Actions may create PRs; the "versions are frozen" ruleset now
covers `refs/tags/safebyok*@*` as well as `v*`.

**Open, for you**

* The App token for the Version PR, so its required checks start (you are on it). Without it, close
  and reopen the Version PR before merging (PROCESS.md, *Releases*).
* The first changeset: `pnpm changeset`, pick `safebyok` (the `fixed` group brings
  `safebyok-react`), `minor`, a one-line summary. Both go 0.0.0 -> 0.1.0.
* `safebyok-react` has never been on npm. A trusted publisher may need the package to exist first;
  if its first staging fails on OIDC, publish a placeholder by hand and configure it, as
  `safebyok@0.0.0` was.
* Optionally restrict the `npm` environment to `main` and add required reviewers.
* The four checks only the first release can make (preplan): the trusted publisher, `npm stage
  list`'s output, restaging after a reject, required reviewers on the npm environment.
* The reviewer's minor findings on #22 (progress file, *Review of thread 3*): no-op `pack`/`publish`
  runs while a version is unreleased, a rejected stage is never restaged, "already staged" known
  only by npm's wording, a failed tag push not retried.
* Logged in TODO.md (branch `20261015-pr_releases_b`, not yet pushed): `vault.test.ts`'s
  altered-ciphertext flake, dependabot's `directory: /` after the move, and a click-through of the
  demo's passphrase dialog.
* This PR also changes the `/sprint` skill: the sprint doc mirrors every whiteboard file in full,
  one tab per thread, written by the orchestrator alone.
