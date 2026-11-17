# Thread 10: sandals (2026-10-15)

Branch `20261015-sandals`, PR [#36](https://github.com/mrflip/safebyok/pull/36), rebased onto `origin/main` after #29, cut from `origin/main` (b329343). Justify: green --
root 3 files / 72 tests; core 11 / 249; convex 6 / 213; react 1 / 7; demo 3 / 24. About 45 s.

* **Built**: TODO.md's *Sand in the sandals*, one commit per item (the changeset is its own, empty).
  - `tests:` `vault.test.ts` "a lockbox with altered ciphertext refuses to open" bends the text
    with `tweakB64` instead of overwriting the first character with `A` (the one-in-sixty-four flake).
  - `tests:` `packages/safebyok/tests/helpers.ts` is now `test-helpers.ts` (and its test,
    `test-helpers.test.ts`), star-imported as `TH` by every core test. New `TH.wakeupAtNextTick()`
    replaces the hand-written zero-delay `setTimeout` promise in `vault.test.ts` (the only one);
    it has its own test.
  - `deps:` `safebyok` moves from `dependencies` to `peerDependencies` (`workspace:^`) of
    `safebyok-convex`, and stays a `devDependency` (`workspace:*`), exactly as `safebyok-react`
    has it; so the workspace still resolves it for tests, typecheck and `build:deps`. Lockfile
    and the package README's one sentence follow.
  - `tools:` the root `lint`, `typecheck`, `test`, `test:coverage` and `justify` run the root
    check, then `pnpm -r --no-bail`, and exit nonzero if either failed
    (`exit $(( root || $? ))`). `justify:root` is new: lint, typecheck and test of the root, still
    fail-fast among themselves. Proved with a deliberately failing root test: the packages all
    ran, exit 1.
  - `tools:` the demo's vitest config gains a `coverage` block (`provider: 'v8'`,
    `include: ['src/**/*.{ts,tsx}']`, the same reporters as the others). Honest numbers: the demo's
    tests cover `src/lib`, not its components (22% overall).
  - `tools:` the root `eslint.config.mjs` ignores `**/dist/**`.
  - `tools:` the two React eslint configs' header comments wrap at 100 columns. (Dropped at the
    rebase: #29 rewrote both headers and they already wrap.)

* **Decisions taken**:
  - File name `test-helpers.ts`, not `TestHelpers.ts`: the lint rule `unicorn/filename-case` is
    kebab-case, and the star import `TH` is independent of it.
  - Only the core's helpers are renamed. `safebyok-convex/tests/helpers.ts` is a different
    module (its own `boxOf`/`bundleOf` with overrides, `componentTest`, `hostWith`), so it is
    left alone but its two imports of the core's `testDeriver` follow the rename. Two
    `expectRefusal` copies (vault.test.ts, vault-db-suite.ts) have different contracts (class vs.
    `kind`) and the first is the most edited line range in the chain: left.
  - The `&&` fix is a shell one-liner in `package.json` (`;` and `$?`), not a helper script or
    `npm-run-all`: no dependency, and pnpm runs scripts through `sh`. The root's own checks
    stay `&&` chained among themselves.
  - Demo coverage `include` is `src/**/*.{ts,tsx}`, so the untested components show as 0%.

* **Deviations**: none from the thread text. Two items were already fixed on main:
  - Convex's `--no-error-on-unmatched-pattern`: already gone from `packages/safebyok-convex`
    (only a whiteboard note mentions it).
  - Comment lines over 100 columns in `release.yml`: none left (#27). In `PROCESS.md` the only
    lines over 100 are the commit-prefix table's rows (150 columns); a table cannot wrap, so
    left.

* **Discoveries**:
  - Over 100 columns remain in ~25 code files (doc blocks in `vault.ts`, `types.ts`, `idb.ts`,
    `convex-vault-db.ts`, `scripts/release.ts`, ...). No rule enforces a width (STYLE.md has none,
    ESLint has no `max-len`); the thread named four files, so only those moved.
  - **The slow justify.** 37 s here, of which 13 are `tsdown` runs: the core builds once for its
    own `justify`, and then each dependent re-runs `build:deps` as a `pre` script before its
    `typecheck`, `test` and `build` (convex 2, react 3, demo 5, counting the react build the demo
    needs). Not fixed. What a fix would take, cheapest first: (1) `pnpm justify` builds
    everything once up front (`pnpm -r build`) and the package `pre*` scripts skip when told to
    (an env var such as `SAFEBYOK_DEPS_BUILT=1`, set by the root); then `workspaceConcurrency`
    can rise, since nothing wipes `dist/` mid-run any more (about half the time). (2) Resolve
    workspace dependencies from source in tests and typecheck (a `development` export condition
    plus `customConditions` in tsconfig and a vitest `resolve.conditions`): no builds before
    tests at all, at the price of the tests no longer exercising the built artifact (the build
    step and attw/publint still do). (3) A task runner with caching (turborepo): a new dev
    dependency, needs a Coach's yes. I would do (1) when the next thread touches the scripts.

* **For the Coach**:
  - **Fixed at the Coach's word, after the first filing.** The review found that the root scripts
    ended in `exit $(( root || $? ))`, which lost extra arguments (`pnpm lint --fix`) under dash and
    exited 1 with `exit: too many arguments` under bash-as-`sh`. The worker did not apply the
    reviewer's refused edit; the Coach then approved it, and the last commit on the branch rewrites
    `lint`, `typecheck`, `test`, `test:coverage` and `justify` as
    `both() { pnpm lint:root; root=$?; pnpm -r --no-bail --stream lint "$@"; exit $(( root || $? )); }; both`.
    Proved: arguments appended as pnpm does reach `pnpm -r` (dash and bash `--posix`, with a stub
    `pnpm`); exit 0 when all pass, 1 when the root fails (a `var` in `scripts/`), 1 when a package
    fails (a failing core test); `pnpm justify` green. The root step itself still gets no
    arguments.
  - Overlap with `/workspace/byok-strict_configs`, which rewrites the same eslint configs and root
    scripts: expect conflicts in `package.json` (the five script lines), the two React
    `eslint.config.mjs` header comments, and the root `eslint.config.mjs` ignore list. Whichever
    lands second rebases; each side is a one-line choice.
  - The `TH` rewrite touches nearly every core test file's import line and every use of a helper.
    A thread of the vault.ts chain (1, 2, 6, 7) that adds an unprefixed `testDeriver`,
    `scopeOf` and so on to a test meets a typecheck error after rebasing: write `TH.testDeriver`.
  - Not this thread, as told: dependabot after its next weekly run (fallback
    `directories: ['/', '/packages/*', '/demos/*']`) and the demo's passphrase-dialog
    click-through.
