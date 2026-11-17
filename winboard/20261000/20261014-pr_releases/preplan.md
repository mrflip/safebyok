# 2026-10-14: PR-based releases -- preplan

Three threads, run in this order, each its own branch and PR:

1. **`20261014-react_publishable`** (Sonnet): `safebyok-react` becomes a built, checked,
   publishable package. Small, and the next thread folds its CI job in.
2. **`20261014-core_under_packages`** (Opus or opusplan): the core moves to `packages/safebyok`
   and the root becomes a private workspace.
3. **`20261014-pr_based_releases`** (Opus or opusplan): changesets, the idempotent release
   script, the rewritten `release.yml`, and the PROCESS.md and CLAUDE.md edits.

Rulings these rest on, made by the Coach in chat on 2026-10-14: adapters with a peer dependency
are separate packages, the IndexedDB adapters stay as the `safebyok/idb` subpath, public packages
version in lockstep, the bump happens in git by PR and never by CI pushing to main, main's
version between releases is the last released one, npm staging stays as the second gate, and
the `0.0.0` of `safebyok` already on npm stays (deprecate it once a real version is live).

Every thread: cut the branch from `main` in its own worktree, since other agents share the
checkout (`git worktree add /workspace/byok-<label> -b 20261014-<label> main`, then
`git branch --unset-upstream` and set the upstream per `scripts/newb`). Read PROCESS.md before
any git operation beyond a commit. Pushing needs
`git -c credential.helper= -c credential.helper='!gh auth git-credential' push`. Each ends with
one PR, plain-language title, open questions filled in, and an entry in `human/` per
`human/README.md`, linking the PR in full.

## Thread 1: safebyok-react, publishable

### Why

`packages/safebyok-react/package.json` says `private: false`, and the Coach has ruled that it
publishes in lockstep with `safebyok`. Today its `exports` points at `./src/index.ts`: published
as-is it would ship TypeScript source, no declarations, no CommonJS, and nothing checked by
publint or arethetypeswrong. It also runs in no CI job. This thread makes it a package a consumer
can install, built and checked the way the root package is. No change to its interface or
behaviour: `src/` and `tests/` are untouched except where a build error forces a fix, and that is
reported in the PR.

### Decisions already made (do not re-litigate)

* **`safebyok` becomes a peer dependency**, `"safebyok": "workspace:^"` in `peerDependencies`,
  with `"safebyok": "workspace:*"` in `devDependencies` so the tests resolve it. The host app
  installs the core itself; the binding must share the host's single instance, because `Vault`
  objects and `isVaultError` checks cross the boundary. pnpm rewrites `workspace:^` to the real
  range at publish time. React stays a peer at `^19.0.0`.
* **Same build as the root:** tsdown, ESM and CJS, declarations, source maps, `exports: true`
  so package.json's entry points are written from the build, publint at `warning`, attw `strict`
  at `error`, `failOnWarn: 'ci-only'`. Copy `tsdown.config.ts` from the root and change only what
  the binding needs: `entry: ['src/index.ts']`, `platform: 'browser'` is acceptable here since
  the binding is React-only, but say so in a comment. Peers and dependencies are external by
  tsdown's default; confirm that `react/jsx-runtime` ends up external, not bundled.
* **Tests keep running against `src/`** through vitest; the package's `justify` gains `&& pnpm
  build` at its end, and `prepublishOnly` is `pnpm justify`, as at the root.
* **The tests need the core built first**, because `safebyok` resolves through the workspace
  link to the root's `dist/`. That is already true today; make it explicit in the README and in
  the CI job below. Do not point the tests at the core's source.
* **No new runtime dependency.** Dev dependencies needed for the build (`tsdown`, `publint`,
  `@arethetypeswrong/core`) go into this package's `devDependencies` at the same versions the root
  pins, as the package already does for eslint and vitest.

### Steps

1. `package.json`:
   * `files: ["dist"]`, `sideEffects: false`, `license`, `author`, `homepage`, `bugs`,
     `keywords` (`safebyok`, `react`, `vault`, `e2ee`), and `repository` copied from the root
     with `"directory": "packages/safebyok-react"` added. `engines` as the root.
   * `description` loses "Source-exported workspace package while the interface settles; not yet
     published."
   * `main`, `module`, `types`, `exports` as tsdown writes them (run the build, keep what it
     writes, check `./package.json` is exported as at the root).
   * Scripts: add `build` and `build:watch`, extend `justify`, add `prepublishOnly`.
   * The peer and dev dependency changes above.
2. `tsdown.config.ts` as decided. `tsconfig.json` already excludes `dist`; add `*.config.ts` is
   already included. If tsdown's declaration build complains about `jsx`, the tsconfig's
   `react-jsx` is right and the config is wrong, not the other way around.
3. Copy `LICENSE` into the package directory. npm includes `LICENSE` and `README.md` from the
   package root only; nothing reaches into the repo root for them.
4. `README.md`: drop the "source-exported, not yet built or published" paragraph; add the
   install line (`pnpm add safebyok safebyok-react react`), and one line saying the tests need
   `pnpm build` at the repo root first.
5. `.github/workflows/ci.yml`: a `packages` job, required by nothing yet, that installs, runs
   `pnpm build` at the root, then `pnpm --filter safebyok-react justify`. Filter by name, not
   `./packages/*`: `safebyok-convex` has no source yet and its lint would fail on no files. Say
   so in a comment so the glob returns when it can.
6. Root `package.json`: `demo:react` becomes `pnpm build && pnpm --filter safebyok-react build &&
   pnpm --filter safebyok-demo-react dev`, since the demo now resolves the binding through
   `dist/` too. Run the demo once and click through the passphrase dialog.
7. `CLAUDE.md`, Layout: the sentence "the root justify does not cover them" stays true, but add
   that CI runs the React package's justify. One clause, no new paragraph.
8. If the `20261014-pr_based_releases` thread has landed, add a changeset for `safebyok-react`
   (patch, "built and published as a package") before opening the PR.

### Acceptance

* `pnpm justify` green at the root; `pnpm justify` green inside `packages/safebyok-react`,
  including the build with publint and attw clean.
* `pnpm pack --dry-run` inside the package lists only `package.json`, `README.md`, `LICENSE`
  and `dist/**`. Paste the list into the PR.
* `node -e "import('safebyok-react')"` from the demo directory resolves the built ESM; a
  `require('safebyok-react')` from a scratch CJS file resolves the built CJS. Paste both.
* The demo runs.
* `tests/` and `src/` show no diff, or the PR explains each line that does.
* One PR, plain-language title, open questions filled in, and an entry in
  `human/20261014-react_publishable.md` per `human/README.md`, linking the PR in full.

### Who runs this

Sonnet is enough: the root's `tsdown.config.ts` and `package.json` are the template, and every
step has a mechanical check.

## Thread 2: the core under packages/safebyok

### Why

The root `package.json` does two jobs: workspace root and the published `safebyok` package. That
is what makes `pnpm add` need `-w`, what the `files` guard protects against, and what every
release tool has to be told about specially. After this thread the root is a private workspace
and every published package, the core included, lives under `packages/` in the shape
`safebyok-react` already has: its own `package.json`, `src/`, `tests/`, `tsconfig.json`,
`vitest.config.ts`, `tsdown.config.ts`, `eslint.config.mjs`, `README.md` and `LICENSE`.

Nothing about the package a consumer installs changes: same name, same entry points, same
dependencies, same `dist/` contents. The PR proves that with a `pnpm pack --dry-run` listing
before and after.

### Decisions already made (do not re-litigate)

* **The directory is `packages/safebyok`**, named for the published package exactly as
  `packages/safebyok-react` is. Not `safebyok-core`: nothing is published under that name, and a
  directory named differently from its package makes every path a translation.
* **`git mv`, so history follows.** Two commits, as PROCESS.md allows for a mechanical change:
  the first is the pure move and may be red, and its message says so; the second repairs configs
  and docs and is green. Nothing else in the PR.
* **The heavy `eslint.config.mjs` moves with the code** to `packages/safebyok/eslint.config.mjs`,
  since it is the core's lint and needs the core's tsconfig for its type-aware pass. The root
  keeps a small config, cut from it, for `scripts/` and the root config files. CLAUDE.md's
  "final authority on formatting" then names the core's config. Extracting a shared config
  package is a later thread, not this one.
* **The root `pnpm justify` covers everything from now on.** It runs the root's own lint and
  typecheck (scripts and configs) and then `pnpm -r justify`, which pnpm orders topologically so
  the core builds before the binding's tests need its `dist/`. CLAUDE.md's "the root justify does
  not cover them" sentence goes away.
* **The README splits.** Today's `README.md` is the package's npm page and the repo's front page
  at once. The full text moves to `packages/safebyok/README.md`; the root gets a short README that
  says what the repo is and lists the packages with links. `LICENSE` is copied into
  `packages/safebyok/` (npm reads it from the package root; pnpm does not reach up).
* **Version stays `0.0.0`** in the moved `package.json`. Agents never change a version number.

### Steps

1. Move with `git mv`: `src`, `tests` (including `tests/.snapshots` if present), `fixtures` if
   present, `tsdown.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `README.md`, and
   `tsconfig.json` (the root then gets a fresh small one). Commit as the mechanical half.
2. `packages/safebyok/package.json`: everything from the root that belongs to the published
   package: `name`, `version`, `description`, `keywords`, `license`, `author`, `homepage`,
   `repository` with `"directory": "packages/safebyok"` added, `bugs`, `type`, `sideEffects`,
   `files`, `engines`, `main`/`module`/`types`/`exports`/`typesVersions`, `dependencies`,
   `peerDependencies`, and the scripts `build`, `build:watch`, `lint`, `typecheck`, `test`,
   `test:watch`, `test:coverage`, `justify`, `prepublishOnly`. Dev dependencies the core's
   configs and tests import go here: typescript, vitest and its coverage plugin, tsdown, publint,
   attw, zod, fake-indexeddb, `@types/node`, eslint and every plugin the moved config imports,
   at the versions the root pins.
3. Root `package.json` becomes `"name": "safebyok-workspace"`, `"private": true`, no `version`
   field needed, keeping `packageManager`, `engines`, the `newb` script, and only the dev
   dependencies the root's own small eslint config and `scripts/` need. Root scripts:
   `lint`/`typecheck` for the root's own files, `test` → `pnpm -r test`, `build` → `pnpm -r
   build`, `test:coverage` → `pnpm --filter safebyok test:coverage`, `justify` → root lint and
   typecheck then `pnpm -r justify`, `demo:react` → `pnpm -r build && pnpm --filter
   safebyok-demo-react dev`. Drop `main`, `module`, `types`, `exports`, `files`, `sideEffects`,
   `typesVersions`, `dependencies`, `peerDependencies`, `prepublishOnly`. `pnpm bump` stays until
   the releases thread removes it, pointed at `packages/safebyok` (`bumpp` takes a path or runs
   in that directory; check its docs).
4. `pnpm-workspace.yaml`: `packages/*` already matches the new directory. Do not add `"."`.
   Run `pnpm install`; the lockfile's importer for `.` becomes `packages/safebyok`, and the demo
   and binding still resolve `safebyok` by name. Explain the lockfile diff in the PR in one line.
5. Configs in the moved package: `tsconfig.json` is the moved one minus `scripts` in `include`;
   the root's new `tsconfig.json` covers `scripts` and `*.config.*` only. `vitest.config.ts`
   already uses `import.meta.dirname`, so it moves unchanged; check the snapshot path still lands
   in `tests/.snapshots`. `eslint.config.mjs`: remove the `packages/**` ignore (it now sits inside
   one), keep `demos/**` out of the root's config, and set `tsconfigRootDir` as the binding's does.
   `tsdown.config.ts` moves unchanged.
6. `.github/workflows/ci.yml`: the `test-build` and `node-compat` jobs' `pnpm test:coverage`,
   `pnpm build` and `pnpm test` now run through the root scripts above and cover every package;
   if `20261014-react_publishable` landed a `packages` job, fold it in and delete it. The
   `lint-typecheck` job's `pnpm lint` and `pnpm typecheck` become the root's `justify` minus
   tests and build, or add `pnpm -r lint` and `pnpm -r typecheck`; pick the one that keeps the
   job's "lint first, then typecheck" shape.
7. `.github/workflows/release.yml`: the version check reads `packages/safebyok/package.json`,
   and the stage step runs inside `packages/safebyok`. Smallest possible edit; the releases
   thread rewrites this file.
8. `.github/dependabot.yml`: a `directory` entry for `packages/safebyok` if it lists directories.
   `safebyok.code-workspace`: a folder entry if it lists folders.
9. Docs, each the smallest true edit:
   * `CLAUDE.md`, Layout: `src/` and `tests/` lines become `packages/safebyok/src/` and its
     `tests/`; the `packages/` line now lists the core first; the `tests/` mirroring rule is
     per package; the justify sentence as decided. Notable files: `eslint.config.mjs` is the
     core's. Commands: unchanged.
   * `PROCESS.md`: `pnpm bump` rewrites `version` in `packages/safebyok/package.json`.
   * `STYLE.md`: any `src/foo.ts` path example that would now mislead.
   * `.github/pull_request_template.md`: nothing, unless it names a path.
   * `whiteboard/` and `human/` history is not edited.
10. Memory for the next agent: write in the `human/` entry that adding a core dependency is now
    `pnpm --filter safebyok add <pkg>`, and that `-w` is for root tooling only.

### Acceptance

* `pnpm install --frozen-lockfile` green after the lockfile is regenerated once.
* `pnpm justify` at the root green, and it visibly ran the core's and the binding's lint,
  typecheck, tests and build (paste the per-package lines).
* `pnpm pack --dry-run` inside `packages/safebyok` lists the same files as the same command at
  the root did on `main` before the move, plus nothing. Paste both lists into the PR.
* `git log --follow packages/safebyok/src/vault.ts` shows the pre-move history.
* The demo runs.
* One PR, two commits, plain-language title, and an entry in
  `human/20261014-core_under_packages.md` per `human/README.md`, linking the PR in full.

### Sequencing

Land `20261014-react_publishable` first (small, and this thread folds its CI job in), then this
thread, then `20261014-pr_based_releases`, whose plan says what changes when this has landed. If
this thread runs in parallel with either, rebase per PROCESS.md and expect conflicts in
`ci.yml`, the root `package.json` and `CLAUDE.md`.

### Who runs this

Opus or opusplan. Every step is mechanical, but they cross-cut every config in the repo, and a
wrong root script silently stops CI covering a package.

## Thread 3: PR-based releases

### What this thread delivers

The release cycle becomes: every PR that changes a published package carries a one-sentence
changeset; every merge to main refreshes one open "Version Packages" PR; the Coach merges that PR
when they want a release; CI then tags, writes the GitHub release, and stages every public package
on npm; the Coach approves the staging with 2FA. Two human gates, and the version commit, tag,
GitHub release and CHANGELOG all exist without anyone typing a version number.

Out of scope here, each its own thread: moving the core under `packages/`
(`20261014-core_under_packages`) and building `safebyok-react` for publication
(`20261014-react_publishable`). Intended order: react, then the move, then this. This thread
must not change which packages are public: whatever `private` says when the branch is cut, stays.

### Decisions already made (do not re-litigate)

* **Tool:** `@changesets/cli` with the `changesets/action` GitHub action. Library-first: the
  Coach has said yes to these two devDependencies and to `@changesets/changelog-github`.
* **Lockstep versions:** one changesets `fixed` group holding every *public* package, listed by
  name, not by glob (a glob would catch the private `safebyok-convex` and the demo). One bump
  moves them all. A package bumped with no change of its own gets an empty CHANGELOG entry
  saying so; that is accepted.
* **Where the core package lives decides one step.** If `20261014-core_under_packages` has
  landed, the core is `packages/safebyok`, the workspace glob already covers it, and "the root
  `package.json`" below means `packages/safebyok/package.json`. If it has not, changesets sees
  only what `pnpm-workspace.yaml` lists, so `"."` goes into its `packages` list; pnpm already
  treats the root as a workspace package and the lockfile should not change. If `"."` breaks
  `pnpm install --frozen-lockfile` or the demo's `workspace:*` resolution, stop and write it up in
  `human/`: the fix is that other thread, which is the Coach's to sequence.
* **Between releases, main's version is the last released version.** No bump-release-bump, no
  `-dev` suffix on main. The Version PR writes the next number at release time, because the level
  is not knowable before then (a later minor changeset would relabel it). The commit sha
  identifies a tree between releases; the tag identifies a release.
* **The bump happens in git, by PR.** CI never pushes a version to main directly. The agent rule
  in PROCESS.md stands: agents never change a version number. A changeset is a statement of
  intent, not a bump, and agents write those.
* **Staging stays.** The workflow may only `npm stage publish`; the Coach approves. The file
  keeps its name, `.github/workflows/release.yml`, and the `npm` environment, because npm's
  trusted publisher is bound to that filename and environment and must not need reconfiguring.
* **Prereleases** keep routing to the `next` dist-tag: a version containing `-` goes to `next`,
  everything else to `latest`. Entering prerelease mode is `pnpm changeset pre enter beta`;
  document it, do not automate it.
* **`pnpm bump` and `bumpp` go away.** The Version PR replaces them.
* **Commit prefix** for this work is `tools`, per PROCESS.md. The PROCESS.md and CLAUDE.md edits
  are `docs`.

### Step 0: verify before building

Pin to current releases, not recalled numbers (PROCESS.md, *Dependencies*): check
`@changesets/cli`, `@changesets/changelog-github` and the `changesets/action` tag on npm and
GitHub, and pin the action by full commit sha with a version comment, as `ci.yml` does.

Read the changesets docs for the current major: the `fixed` config, `privatePackages`,
`changeset status --since`, `changeset tag`, snapshot and pre modes, and how the action's
`publish` input decides whether to run (it runs the publish command on any push to main that has
no pending changesets, so the publish script must be a no-op when nothing is new). Note anything
in a 3.x major that changes defaults for private packages.

Confirm from the npm docs what `npm stage list` prints, so the script can tell "already staged"
from "not yet staged". Nothing in this thread can exercise `npm stage` for real: it needs the
trusted publisher's OIDC token, which exists only in the workflow. Everything that talks to the
registry lives in one script behind a `--dry-run` flag, and the plan's last section names what
only the Coach's first real release can verify.

### Step 1: changesets in the repo

1. `pnpm add -w -D @changesets/cli @changesets/changelog-github`, then `pnpm changeset init`.
2. `.changeset/config.json`:
   * `changelog`: `["@changesets/changelog-github", { "repo": "mrflip/safebyok" }]`, so every
     CHANGELOG line links its PR in full. The Coach reads from a phone.
   * `fixed`: one group, the public packages by name. Today that is whatever is `private: false`
     and actually publishable; check, and write down in the PR which names went in and why.
   * `ignore`: the demo. `privatePackages`: whatever keeps `safebyok-convex` versioned but never
     tagged or published; read the docs for the current default.
   * `baseBranch`: `main`. `access`: `public`.
3. `pnpm-workspace.yaml`: add `"."` to `packages`. Run `pnpm install --frozen-lockfile` and
   `pnpm justify` at the root and in each workspace package; the demo must still resolve
   `safebyok` and `safebyok-react` by `workspace:*`.
4. Remove `bumpp` and the `bump` script from the root `package.json`.
5. Add root scripts: `changeset` (`changeset`), `version` is reserved by npm so name the
   versioning script `release:version` (`changeset version && pnpm install --lockfile-only`),
   and `release:publish` (`scripts/release`, below).
6. Verify locally: write a throwaway changeset, run `pnpm release:version`, confirm every package
   in the fixed group moved together and each got a CHANGELOG.md entry, then `git checkout .`
   and delete the throwaway. Do not leave a changeset or a version change in the branch.

### Step 2: the release script

`scripts/release`, bash like `scripts/newb`, run by the action's `publish` input on main. It must
be idempotent so a failed run is fixed by re-running the job from the Actions tab, and a no-op on
a push to main that is not a release merge. For each public package, with `version` read from
the root `package.json` (lockstep means one number):

1. If tag `v<version>` does not exist, create it, annotated, and push it. If it exists, go on.
2. If the GitHub release for that tag does not exist (`gh release view`), create it with
   `gh release create`, body from the root CHANGELOG.md's section for that version, marked
   prerelease when the version contains `-`. If it exists, go on.
3. For each public package: skip if `npm view <name>@<version> version` answers (already live),
   skip if `npm stage list` shows it (already staged), otherwise
   `npm stage publish --access public --tag <latest|next>` from that package's directory.
   `prepublishOnly` in each package runs its justify.
4. Print one line per package saying which of the three happened, and finish non-zero if any
   stage call failed, after attempting the rest.

A `--dry-run` flag prints every git, gh and npm command instead of running it. Test the script's
decisions (tag present or not, release present or not, published / staged / neither) with
`--dry-run` against a fake `npm` and `gh` on PATH in `tests/` or `scripts/`'s own test, following
STYLE.md; the project has no bash tests yet, so a small vitest that runs the script with
`execFile` and asserts on its output is fine. Say in the PR what the tests cover and what they
cannot.

Secret material rule applies: the script never prints a token, and never prints `npm`'s full
error output on a path that could include one.

### Step 3: the workflow

Rewrite `.github/workflows/release.yml`, keeping the filename and `environment: npm`:

* Trigger: `push` to `main`. Drop `release: published`.
* Concurrency group `release`, no cancel-in-progress: two release runs must never interleave.
* Permissions: `contents: write` (tags, releases), `pull-requests: write` (the Version PR),
  `id-token: write` (npm OIDC).
* Steps: checkout with `fetch-depth: 0`, pnpm and Node from `.tool-versions` as `ci.yml` does,
  `pnpm install --frozen-lockfile`, the pinned npm install step kept from the current file, then
  `changesets/action` with `version: pnpm release:version`, `publish: pnpm release:publish`,
  `commit` and `title` set to a `rel:` message per PROCESS.md's prefix table, and `GITHUB_TOKEN`
  plus `NODE_AUTH_TOKEN` unset (OIDC, not a token). Keep the file's head comment, rewritten, so a
  reader learns the two gates and why staging cannot approve itself.
* The Version PR's branch (`changeset-release/main`) is rebuilt from main's tip on every push, so
  it never holds a merge commit and passes `ci.yml`'s rebase check. Confirm by reading the
  action's docs, not by assumption; if it needs a `setupGitUser` or similar, set it.
* The `GITHUB_TOKEN` cannot trigger other workflows. That is why staging lives in this file, not
  behind a `release: published` trigger. Say so in the head comment.

Add to `ci.yml`, in `lint-typecheck`, on pull requests only: `pnpm changeset status
--since=origin/main`, so a PR that changes a public package without a changeset fails. Verify the
exit-code behaviour from the docs. The escape for a tooling-only or docs-only PR is
`pnpm changeset add --empty`, documented in PROCESS.md.

### Step 4: documents

* **PROCESS.md, Releases**: replace the section. The new text says: what a changeset is, when a
  PR needs one and the `--empty` escape; that the Version PR is the bot's and nobody rebases,
  edits or merges it but the Coach; that merging it is the release; what CI then does, in order;
  the two human gates; how to re-run a failed publish (re-run the job; the script skips what is
  done); that a rejected staging burns the number and the next release takes the next one, until
  the Coach has tested otherwise; prerelease mode with `changeset pre`; and that main's version
  is the last released one, by decision. Keep it as short as the current section.
* **PROCESS.md, Commit messages**: `rel` now means the Version PR's commit, made by the action.
* **CLAUDE.md, Commands**: drop `pnpm bump`, add `pnpm changeset`. One line each. Nothing else in
  CLAUDE.md should need to change; if it seems to, say so in the PR rather than growing the file.
* **`.github/pull_request_template.md`**: one line under *What changed* for the changeset: its
  sentence, or `(no changeset: tooling/docs only)`.
* **`winboard/20261014-pr_based_releases/`**: keep this plan; add a `progress.md` only if the
  thread outgrows one sitting.
* **`human/20261014-pr_based_releases.md`**: at the end, the entry for the Coach (format in
  `human/README.md`): what landed, what the first real release will prove, and the list below.

### What only the Coach's first release can verify

List these in the PR's *Open questions* and in the `human/` entry:

1. That npm's trusted publisher accepts the rewritten workflow unchanged (same filename, same
   environment, now on `push`). If it refuses, the fix is on npmjs.com, not in the repo.
2. What `npm stage list` prints, and so whether the "already staged" skip works. Until then a
   re-run after a partial failure may fail on the already-staged package; the script's per-package
   reporting makes that readable.
3. Whether a version rejected with `npm stage reject` can be staged again. The docs do not say.
   Until tested, PROCESS.md says the number is burned.
4. Whether the `npm` GitHub environment has required reviewers (a third gate the Coach may or may
   not want).

### Acceptance

* `pnpm justify` green at the root and in every workspace package.
* `pnpm install --frozen-lockfile` green with `"."` in the workspace list, lockfile unchanged or
  the diff explained in the PR.
* The release script's dry-run tests pass and cover: no-op when the tag exists and everything is
  staged; tag and release created when absent; a package skipped when live, skipped when staged,
  staged otherwise; a stage failure reported without stopping the others.
* The branch holds no changeset file and no version change.
* One PR, title in plain language, open questions filled in, linked in full in the `human/`
  entry. Report any `eslint-disable` or `@ts-expect-error` in the PR.

### Who runs this

Opus, or opusplan. The mechanical parts are small; the cost of a mistake is a burned version
number or a workflow that cannot be re-run, and those come from reading the action's and npm's
semantics carefully, not from typing.

