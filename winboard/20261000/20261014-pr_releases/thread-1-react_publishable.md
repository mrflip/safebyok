# Thread 1: safebyok-react, publishable (2026-10-14)

Branch `20261014-react_publishable`, PR [#15](https://github.com/mrflip/safebyok/pull/15), based on origin/main (no stack). Justify: root green (12 core files / 174 tests, 7 binding tests, 24 demo tests, build); `packages/safebyok-react` justify green with publint and attw clean.

* **Built**: `safebyok-react` builds with tsdown (ESM + CJS, declarations, source maps, `exports: true`, publint warning / attw strict) from `packages/safebyok-react/tsdown.config.ts` (`platform: 'browser'`, commented). `package.json` has `files`, `sideEffects`, license, author, homepage, bugs, repository with `directory`, keywords, and the entry points tsdown wrote. `safebyok` is a peer (`workspace:^`) plus a dev dependency (`workspace:*`); `react` stays a peer. LICENSE copied in; README has the install line and a Development section. `react` and `react/jsx-runtime` and `safebyok` stay external in `dist/`. Coverage added to its vitest (`@vitest/coverage-v8`). `pnpm pack` lists only `dist/**` (6 files), `LICENSE`, `package.json`, `README.md`; the packed `package.json` has no `workspace:` left (peer `^0.0.0`, dev `0.0.0`).
* **Tests from a clean install**: `pretest`, `pretest:coverage`, `pretypecheck` and `prebuild` run `build:deps` = `pnpm --filter 'safebyok-react^...' build` (every dependency of the package, by name, so it survives the core moving to `packages/safebyok`). The demo has the same hooks. About 1.5 s per run. `pnpm --filter <pkg> test`, `typecheck`, `build`, `justify` all work after `rm -rf dist`.
* **Whole-repo**: root `test` = `vitest run && pnpm -r test`; root `test:coverage` = `vitest run --coverage && pnpm -r --if-present test:coverage`. CI `packages` job runs `pnpm --filter safebyok-react justify` (filtered by name, comment says why). Demo `private: true`. CLAUDE.md Commands and Layout updated.

## Decisions taken

* **`pretest` build, not a vitest alias to source.** The alias would leave `tsc --noEmit` and tsdown's declaration build (both resolve `safebyok` through `dist/` types) still needing a build, so the "build first" problem would remain in two places and the tests would stop exercising the artifact a consumer installs. Hooks on all four scripts fix them together. Cost: the core builds up to three times inside a `justify`. Accepted for legibility; revisit if it grows.
* **Root `build` is NOT recursive.** While the core is the root package, `pnpm build:deps` selects the root, so a root `build` of `tsdown && pnpm -r build` forks forever (react `prebuild` -> root build -> react build ...). I hit this and killed the loop by PID. Thread 2 makes `pnpm -r build` safe by moving the core down; until then the whole-repo build is `pnpm build` (core) and each package's own build.
* `test:coverage` added to the binding so the root coverage run, and CI's `test-build`, cover it too.

## Deviations

* **`packages/safebyok-convex/package.json`**: its `test` is now `vitest run --passWithNoTests`, because `pnpm -r test` otherwise exits 1 on a package with no tests yet. Thread 2 is asked to prefer package-own properties over exclusions; this is that, in one word. The in-flight convex branch may touch the same line.
* The demo's package.json got `build:deps`, `pretest`, `pretypecheck`: its tests and typecheck already needed the core's `dist/` on a clean clone (they failed before this thread), which the "per package" requirement covers.
* The preplan's "root build first in CI job" is not needed: the package's scripts build the core themselves.
* Lockfile also re-sorted the demo's dependency keys (pnpm normalization, harmless).
* Demo "click through the passphrase dialog" was not done: no browser here. I ran `vite build` (bundles `safebyok-react` from `dist`) and the dev server, which served and transformed `main.tsx`.

## Discoveries

* **Flaky core test**: `tests/vault.test.ts` "a lockbox with altered ciphertext refuses to open" prefixes `A` to the ciphertext; when the random ciphertext already starts with `A` (about 1 in 64) nothing is altered and the test fails. It failed once in my runs. Out of scope here; worth its own fix.
* `pnpm pack` does not run `prepublishOnly` (thread 3: a staged tarball is not justified or rebuilt unless the script does it). The packed `package.json` keeps the dev scripts (`pretest` etc.) but drops `prepublishOnly`.
* `pnpm peers check` warns that eslint 10 is unmet by `eslint-plugin-jsx-a11y` and `eslint-plugin-react`; pre-existing.
* `pnpm -r` skips the root package (include-workspace-root is false); that is why the root `test` runs its own vitest first.

* **For thread 3, the peer range**: with the core at `0.0.0`, pnpm packs `workspace:^` as `^0.0.0`, which for 0.x semver means exactly `0.0.0` (caret on `0.0.x` pins the patch). Once lockstep versions move (say to `0.1.0`) pnpm rewrites it to `^0.1.0`, and a binding at `0.1.1` still needs core `0.1.x` only. Check that the range it writes at release time lets the host install matching lockstep versions, and decide whether the peer should be loosened (e.g. `workspace:>=0.0.0`-style or a hand-written range).
* **CI caveats moved here from ci.yml**: the `packages` job is required by nothing yet (the ruleset names `lint-typecheck` and `test-build`); the `./packages/*` filter glob returns once `safebyok-convex` has source and passes its own lint.

## For the Coach

* Say whether the `packages` CI job should become required once it has run green (the ruleset names `lint-typecheck` and `test-build` only).
