# Thread 4: ci_tooling (2026-10-15)

Branch `20261015-ci_tooling`, PR #72, stacked on #66. Justify: green (root 119, core
705, convex 265, react 28, demo 61).

* **Built**:
  - **npm pin** (`release.yml`, `publish` job only: #63 edits `version`). The job fetches
    `npm-12.2.0.tgz`, checks it against the registry `dist.integrity` recorded in the workflow
    (`openssl dgst -sha512 -binary | base64`), and installs the checked file `--offline
    --ignore-scripts` (npm bundles its dependencies). Tried locally into a scratch prefix. A
    `notes/security.md` entry. Moving npm means `npm view npm@X dist.integrity` and two lines.
  - **Changeset gate**. `scripts/runtime-deps.ts` (tests in `tests/scripts/`) lists the public
    packages' `dependencies`, `peerDependencies` and `optionalDependencies` moved between two
    commits, reading each `package.json` from git. CI's "Require a changeset" asks a Dependabot PR
    for one only when that list is non-empty; the Version PR stays skipped, the comment saying why
    (it is where changesets are used up). PROCESS.md says so.
  - **Dependabot**: nothing to change. `directory: /` covers the workspace: the npm updater reads
    `pnpm-workspace.yaml` and fetches every `package.json` its globs match (dependabot-core,
    `npm_and_yarn/file_fetcher.rb`), and its run of 2026-10-14 (Actions run 38631066212) checked
    convex, jsdom, vite and @anthropic-ai/sdk, which only `packages/` and `demos/` declare. That
    run predates the core's move, but the core moved into the same `packages/*` glob. A comment in
    `dependabot.yml`; the TODO entry is gone.
  - **justify: about 35 s to 20 s warm** (55 s cold before), tsdown runs 10 to 3. Root `justify`
    installs once, then runs lint, typecheck and test across the workspace, each whatever an
    earlier found. Lint and typecheck run `--workspace-concurrency=4` (they read sources: checked
    with every `dist/` deleted). Root `build` and `test` set `SAFEBYOK_SKIP_BUILD_DEPS=1`, so each
    package's `build:deps` stands down: `build` goes in dependency order, each package once, and
    `test` builds first, then runs the packages' tests four at a time. A package run alone still
    builds its dependencies first, each once (its `build:deps` sets the variable for its own
    nested build; a package's `justify` sets it for the build after its tests). It stands down
    only on exactly `1` (from review). A planted type
    error and failing test were both reported, exit 1. The slow-justify TODO entry is gone.
  - **#36's items**: root `test:coverage` runs the root's tests with coverage over `scripts/`
    (`@vitest/coverage-v8` added at the root: a plainly boring devDependency, matching the
    packages'); the misaligned rows of `types.test.ts` (BundleCases and its siblings) and four
    rows of the Convex `validators.test.ts`, which the same `TH` rename knocked 3 columns left;
    `wakeupAtNextTick`'s `@example` (doc block only, for thread 7).
  - **Pulled in from thread 6**: "the Convex client tests need the core built first" is the same
    mechanism, now built once per root run; a package's own `pnpm test` still builds the core
    first, as its README says. Strike it from thread 6.
* **Decisions taken**:
  - An environment variable over a task runner (turbo, nx): three shell fragments in scripts we
    already have, against a new tool and its config.
  - The packages' tests keep reading their dependencies' `dist/`, as a consumer would (both
    READMEs record that choice); resolving `@safebyok/source` in vitest would drop the builds
    altogether, but reverses that decision, so it was not taken.
  - CI's `test-build` still runs `pnpm build` after `test:coverage`, which now builds too (about
    2 s twice); the build keeps a step of its own, which reports even when tests fail.
  - The changeset is empty: tooling, tests and docs. The one published line touched is
    `safebyok/testing`'s `wakeupAtNextTick` doc example.
* **Discoveries**:
  - pnpm 12 runs a package's `pnpm install` in ~60 ms when nothing changed; the old justify's
    time went to the seven redundant core builds and serial pnpm startups.
  - The root `pnpm test` now builds every package (it built the core before, via `pretest`), so
    `node-compat` runs the builds on Node 22 and 26 too.
  - `pnpm changeset status --since` sees only committed changesets.
  - pnpm still sorts a recursive run at concurrency 4: the core's tests alone, then convex and
    react together, then the demo (review; `pnpm-workspace.yaml`'s comment says so).
* **For the Coach**:
  - The Version PR's skip trusts the branch name `changeset-release/`; anyone may name a branch
    so to skip the changeset check. Pre-existing; tightening it needs the App's bot login.
  - A Dependabot PR that moves a runtime dependency now fails CI until you push a changeset to
    its branch (Dependabot then stops rebasing that PR).
