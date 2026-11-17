# Sprint pr_releases: progress

**Status**: done: all three threads merged on 2026-10-15, restacked onto `main` first (below).

## Status

| # | Thread | Model | Base | Status |
| - | ------ | ----- | ---- | ------ |
| 1 | `20261014-react_publishable` | sonnet | `origin/main` | merged [#15](https://github.com/mrflip/safebyok/pull/15) |
| 2 | `20261014-core_under_packages` | opus | thread 1's tip (#15) | merged [#16](https://github.com/mrflip/safebyok/pull/16) |
| 3 | `20261014-changeset_releases` | opus | thread 2's tip (#16) | merged [#22](https://github.com/mrflip/safebyok/pull/22) |

## What the threads have taught

*Review of thread 1:* clean at medium; no fixes. Minor notes left: peer range `^0.0.0` matches only 0.0.0
(for 0.x semver; thread 3 must check lockstep installs work for hosts: see below); root `test` now runs
package tests so the flaky core test can fail `test-build`; `pnpm pack` skips `prepublishOnly`. Not checked:
the `packages` job on GitHub, Node 22/26, demo click-through.

*Orchestrator, after thread 1 `ready`:*

* **Pretest builds, not aliases.** The binding (and the demo) run `build:deps` =
  `pnpm --filter '<pkg>^...' build` from `pretest`, `pretest:coverage`, `pretypecheck` and `prebuild`,
  because tsc and tsdown's declaration build resolve `safebyok` through `dist/` too. Filtering by name
  survives thread 2's move. Thread 2: keep the pattern for any package that depends on another.
* **Root `build` is not recursive yet**: with the core as the root package, `build:deps` selects the root
  and `pnpm -r build` loops. Thread 2 moving the core down makes root `build` = `pnpm -r build` safe; do it
  and check it does not loop.
* **Thread 2 owes**: fold the `packages` CI job (runs `pnpm --filter safebyok-react justify`) into the
  main jobs and delete it; the root `test`/`test:coverage` currently run the core's vitest first and then
  `pnpm -r` (the root is skipped by `-r`), which becomes plain `pnpm -r` after the move.
* **`safebyok-convex`** test script is now `vitest run --passWithNoTests` (thread 1's one-word touch).
* **Thread 3**: `pnpm pack` rewrites `workspace:^` -> `^0.0.0` (verified), but does not run
  `prepublishOnly`; the script must justify/build before staging tarballs.
* **Known flake, not ours**: `tests/vault.test.ts` "altered ciphertext" fails ~1/64 runs (prepends `A`).
  Mentioned in the PR; fix is its own thread.
* Passphrase-dialog click-through of the demo was not done (no browser in the sandbox): Coach to check.

*Review of thread 2:* clean at medium; no fixes. Verified: planted failures in the demo make every root
script exit 1; no prebuild needed after deleting every `dist/`; published tarball identical (21 files, same
sha256 but `package.json`). Minor, left: root scripts chain with `&&`; core rebuilt several times by pre-hooks
and serial `pnpm -r`; convex `--no-error-on-unmatched-pattern`; demo coverage has no `include`; some
comment lines >100 cols (two React eslint configs, PROCESS.md, release.yml); dependabot `directory: /`
unverified (fallback `directories: ['/', '/packages/*', '/demos/*']`). Not checked: CI, release, `pnpm bump`.

*Orchestrator, after thread 2 `ready`:*

* **Layout now**: the core is `packages/safebyok` (own scripts, eslint, vitest, tsdown, LICENSE); the root is
  private `safebyok-workspace` with a small eslint/tsconfig/vitest for `scripts/` and `tests/scripts/`
  (root tests stay at the root). Whole-repo `lint|typecheck|test|test:coverage|justify` = root's own
  `*:root` check then `pnpm -r --stream <script>`; `build` = `pnpm -r --stream build`.
* **`workspaceConcurrency: 1`** in `pnpm-workspace.yaml` (parallel `build:deps` hooks would clobber the core's
  `dist/`); scripts therefore need `--stream`. Keep this in mind for any new `pnpm -r` call (release script).
* **`pnpm bump`** is `cd packages/safebyok && bumpp ...`; thread 3 deletes it.
* `release.yml` now reads the version from, and stages in, `packages/safebyok`; thread 3 rewrites it.
* **Thread 3 also owes**: `.claude/agents/thread-worker.md` / `thread-reviewer.md` (and the sprint skill if
  it says so) still say the root justify does not cover packages: make them true. Confirm dependabot with
  `directory: /` covers workspace packages (or add entries). The demo now has `test:coverage` (so required
  CI runs its tests).
* **Flaky tests**: two, same cause (`tests/vault.test.ts` and `tests/crypto.test.ts` "altered ciphertext"
  replaces first base64 char with `A`; ~1/64). Not in this sprint; the Coach should give it its own thread.
* **Stray process**: a vite dev server from thread 1's (removed) worktree still runs on port 5199
  (pids 281403/281454); not ours to kill without the Coach's word, but harmless.

*Orchestrator, after thread 3 `ready`:* it departs from the preplan in three visible ways: changesets'
own `publish-plan` / `pack` do the discovery and packing, `scripts/release.ts` (TypeScript) only stages
tarballs; **each package gets its own tag (`safebyok@0.1.0`), not one `v<version>`** (needs the tag ruleset
widened); the workflow is four jobs (select-mode, version, pack, publish) with only `publish` able to get an
npm token. The Coach has switches to flip before the first release: allow Actions to create PRs; write the
first changeset; widen the tag ruleset; decide on a token for the Version PR so its CI runs.

*Review of thread 3 (reviewer `bailed` at its commit step):* one fix made and proven (`release.ts stage`
now turns a throw from `git ls-remote`/`tar` into a `failed` outcome and carries on to the next package,
as its doc block promises; new test; justify green with it) but **not committed**: the permission system
denied the reviewer's `git commit`. It sits uncommitted in `/workspace/byok-changeset_releases` (two files),
HEAD `ef5098a`. Everything else verified: action pins, job permissions (only `publish` has `id-token`), the
artifact hand-off, `changeset status --since` exit codes, `changeset version` under `fixed`, requirement 2,
secrets handling. Minor, left: every push to main runs `pack`/`publish` as a no-op while a version is
unreleased; a rejected or never-approved stage is never restaged (tag names an earlier commit; number counts
as burned); "already staged" is recognised only by npm's "previously published" wording (unverified); a failed
tag push or release creation is not retried by a re-run; global `npm@12.2.0` installed unpinned by hash in
`publish`. Not run: `npm stage`, the workflows, actionlint (not installed in the reviewer's sandbox).

*Orchestrator, at close (2026-10-15):* the sprint resumed in a new session and the three threads were
restacked onto `main` (after #17 to #21), then merged in order. The earlier restack went red because
`safebyok-convex`, new on `main`, lacked the `build:deps` hooks; the restack added them, gave convex the
binding's coverage and CI treatment, set `workspaceConcurrency: 1` (four commits on #15), moved main's new
`tests/vault-db-suite.ts` with the core and repointed the Convex tests at it (two commits on #16). #22 took
no code fix-ups; it gained an empty changeset (`.changeset/releases-bootstrap.md`) to pass its own
"Require a changeset" gate, which turned out unneeded once #15 and #16 were on `main`, and is harmless
(the release run on #22's merge chose "none"). Before merging, the Coach allowed Actions to create PRs
and widened the tag ruleset "versions are frozen" to `refs/tags/safebyok*@*`; an App token for the
Version PR is the Coach's next step. Left over, logged in TODO.md's *Sand in the sandals* (branch
`20261015-pr_releases_b`): `vault.test.ts`'s altered-ciphertext flake
([#25](https://github.com/mrflip/safebyok/pull/25) fixed only `crypto.test.ts`'s), dependabot's
`directory: /` after the move, and a click-through of the demo's passphrase dialog. For the first real
release: the first changeset, and the four checks only it can make (preplan).
