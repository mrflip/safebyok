# Thread 2: the core under packages/safebyok (2026-10-14)

Branch `20261014-core_under_packages`, PR [#16](https://github.com/mrflip/safebyok/pull/16), stacked on
[#15](https://github.com/mrflip/safebyok/pull/15). Justify: root green -- root's own 2 files / 31
tests (scripts/), then `pnpm -r justify`: core 10 files / 143 tests + build (publint, attw clean),
convex (no source, passes), binding 1 / 7 + build, demo 3 / 24. `pnpm install --frozen-lockfile`
green.

* **Built**: the core lives in `packages/safebyok` (commit 1, pure `git mv`, red on purpose; `git log
  --follow` on `src/vault.ts` and `package.json` shows the old history). Its `package.json` keeps
  everything published, plus `repository.directory`; its own scripts; LICENSE copied in. The root is
  `safebyok-workspace`, private, with its own small `eslint.config.mjs`, `tsconfig.json`,
  `vitest.config.ts` (for `scripts/` and `tests/scripts/`) and a short repo README listing the
  packages. `pnpm pack` in `packages/safebyok` lists the same 21 files as at the root before, and
  every `dist/` file has the same sha256.
* **Root scripts**: `lint`, `typecheck`, `test` = the root's own (`lint:root`, `typecheck:root`,
  `test:root`) then `pnpm -r --stream <script>`; `test:coverage` = `test:root` then
  `pnpm -r --stream test:coverage`; `build` = `pnpm -r --stream build` (terminates: no loop now the
  core is not the root); `justify` = root lint, typecheck, tests, then `pnpm -r --stream justify`.
  Each package runs alone with `pnpm --filter <name> <script>` or in its directory, from clean.
* **CI**: the `packages` job is gone; `lint-typecheck` and `test-build` run the root scripts, which
  reach every package. `release.yml`: reads the version from `packages/safebyok/package.json` and
  stages with `working-directory: packages/safebyok` (it still stages the core only; requirement 2
  is thread 3's).
* **Docs**: CLAUDE.md (Commands: every-package forms, one package by `--filter`, `pnpm --filter
  safebyok add` vs `-w`; Layout; the core's eslint config as the authority), PROCESS.md (release
  paths, `pnpm bump`, CI covers every package), STYLE.md (the core's eslint config; tests per
  package), CONTRIBUTING.md (`test:watch` per package).

## Decisions taken

* **`tests/scripts/` stays at the root**, with `scripts/` it tests (the preplan said move `tests`
  whole). So the root has tests of its own, and root `test` is `test:root && pnpm -r test`, not bare
  `pnpm -r test`: `-r` never runs the root, and `--include-workspace-root` would recurse into itself.
* **`workspaceConcurrency: 1`** in `pnpm-workspace.yaml`. `pnpm -r` ran the binding and convex side
  by side; once two packages each run `build:deps`, two tsdown runs would empty and rewrite the
  core's `dist/` under each other. Serial measured no slower (about 25 s for the whole justify).
  With concurrency 1 pnpm drops the per-package prefix, so the scripts pass `--stream` to keep it.
* **Root eslint config, cut from the core's**: js, typescript-eslint strict and stylistic
  (type-aware), unicorn, sonarjs, the stylistic house rules, forbidden names, vitest plus
  chai-friendly for tests. Left out: import-x (and its native resolver), chai-expect, the
  `src/`-only secret-keeping block. The core's config is named the authority, in its header,
  CLAUDE.md and STYLE.md.
* **safebyok-convex**: `lint` gains `--no-error-on-unmatched-pattern` (with no source, ESLint finds
  only the root config, which ignores `packages/**`, and refuses). Its `typecheck` already passes:
  with no tsconfig of its own, `tsc` walks up to the root's. Both end when it has its own configs.
* **`bump`** is `cd packages/safebyok && bumpp ...`, since bumpp reads a release type only as its
  first argument (`pnpm bump minor` appends it); checked on a scratch copy, not on the repo.
* **`demo:react`** keeps thread 1's `pnpm --filter 'safebyok-demo-react^...' build` (the preplan's
  `pnpm -r build` builds more than the demo needs). Root `test:watch` dropped: watch one package.
* **lint-typecheck** keeps its shape: `pnpm lint`, then `pnpm typecheck`, each now every package.

## Deviations

* **A third commit** (`demo:`): the demo gets `test:coverage` (and `@vitest/coverage-v8`, already in
  the lockfile at the same version), so CI's required `test-build` runs its tests; without it the
  demo's tests ran only in `node-compat`. The preplan asked for two commits and nothing else.
* No `human/` entry: the agent definition keeps `human/` for long-term items; the `--filter add`
  memory went into CLAUDE.md's Commands instead, where every session reads it.
* CLAUDE.md Commands changed (the preplan said unchanged; the sprint plan asks for the
  one-vs-all line).
* The binding's and demo's eslint headers now compare themselves to the core's config, not "the
  root's"; the demo README's "repo root `src/`" now names `packages/safebyok/src/`.

## Discoveries

* **A second flaky test, same cause**: `tests/crypto.test.ts` "refuses altered ciphertext and the
  wrong key alike" replaces the first base64 character with `A`, a no-op when it already is one
  (about 1 in 64). It failed once here; a rerun passed. Not fixed (out of scope); the fix thread
  should take both.
* `pnpm -r run <script>` skips packages without the script; `--if-present` is not needed.
* Lockfile: importer `.` loses the core's dependencies, a new `packages/safebyok` importer holds
  them, `link:../..` becomes `link:../../packages/safebyok`; no resolved version changed.
* Dependabot's `directory: /` left as is: as I understand it, it updates a pnpm workspace from the
  root lockfile. Unverified; worth a glance at its next run.
* For thread 3: the core's version is `packages/safebyok/package.json`; the root is private and
  outside `packages:`; `pnpm -r` (4 of 5 projects: root excluded) lists every package.

## For the Coach

* `.claude/agents/thread-worker.md` and `thread-reviewer.md` still say the root justify does not
  cover packages; now it does. Harmless (they run each package's too), but stale. Not edited here.
* Your auto-memory note on `pnpm -w` should now say: `pnpm --filter safebyok add` for the core,
  `-w` for root tooling only.
* A vite dev server from thread 1's worktree (`/workspace/byok-react_publishable`, port 5199, pids
  281403/281454) is still running; not mine to stop.

## Open items

* **Dependabot**: if its next run skips `packages/*` or `demos/*`, the fallback is
  `directories: ['/', '/packages/*', '/demos/*']` in place of `directory: /` in
  `.github/dependabot.yml`.
* **Stale agent lines**: the `.claude/agents/` sentences above, for whoever next edits those
  definitions.
* **Flaky tests**: `tests/crypto.test.ts` and `tests/vault.test.ts` each alter ciphertext by
  writing an `A` that may already be there; one thread of their own should fix both.
* **Review**: clean at `medium`, no commits added. The reviewer's two minor points were not passed
  on to this thread, so they are not recorded here; the orchestrator holds them.
