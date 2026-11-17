# Sprint pr_releases: PR-based releases (2026-10-14)

* **Date**: 2026-10-14. **Mode**: normal. **Review level**: `medium`. **Concurrency**: 3 allowed, but
  the three threads form one stack (below), so they run one at a time.
* **Issued by**: flip (Coach), via `/sprint`.
* **Status**: done: threads 1 (#15), 2 (#16) and 3 (#22) merged on 2026-10-15.

## Read first

* `preplan.md` in this directory: the Coach's agent-written preplan, copied here from branch
  `20261014-pr_based_releases` (d403c2e / 10d2b90) so every worktree can read it. **It is input, not
  gospel**: the Coach has said it was heavy on agent input and may be too strident, and asks for
  independent thinking and flexibility. Where this plan or your own reading of the docs and the repo
  disagrees with it, follow the better argument and say so in your thread file. The *rulings* the
  preplan records at its top (Coach's words, 2026-10-14) are not up for debate; its "do not
  re-litigate" lists are the preplan author's, and may be re-opened with a reason.
* `PROCESS.md` (releases, dependencies, commit prefixes), `STYLE.md`, `VOCABULARY.md`, `CLAUDE.md`.
* `winboard/20261014-staged_publish/20261014-staged_publish-human.md` in the main checkout (why npm is pinned to 12.2.0 and staging).

## Ground rules (particular to this sprint)

* **Two requirements the Coach added to the preplan**, binding on every thread:
  1. **Tests run per package and for the whole repo.** `pnpm --filter <pkg> test` (or `pnpm test`
     inside the package directory) works on a fresh `pnpm install` with no manual prebuild step, and
     the root `pnpm test` runs every package's tests. Same for `test:coverage` where a package has
     coverage. CLAUDE.md's *Commands* says so, in one line.
  2. **A release pushes (stages) every public package, and never a demo.** "Every public package" is
     discovered from the workspace (`private: false`, outside `demos/`), not a hard-coded list that
     rots when `safebyok-convex` or an adapter goes public. Anything that must list names (changesets'
     `fixed` group) is guarded by a test that fails when the list and the workspace disagree.
* **Library first.** The preplan says to hand-roll the release script; before doing so, thread 3
  checks what `changesets/action` and `changeset tag`/`publish` already do and justifies the gap.
* **`workspace:` ranges are rewritten by pnpm, not npm.** `npm stage publish` run in a package
  directory would ship a literal `workspace:^` dependency. Whatever thread 1 and thread 3 do must go
  through `pnpm pack`/`pnpm publish`'s rewriting (e.g. `pnpm pack` then stage the tarball) and prove
  the packed `package.json` has real ranges. This is the sharpest edge in the plan; the preplan does
  not mention it.
* Agents never change a version number, never tag, never publish. A changeset is a statement of
  intent and agents may write one; but this sprint's branches hold **no changeset and no version
  change** (the Coach writes the first release's changeset).
* The stack: each thread is cut from the tip of the previous one once it is filed, and says
  "Stacked on #N". Rebase conflicts are expected in `ci.yml`, root `package.json`, `CLAUDE.md`.
* `safebyok-convex` is in flight on another branch (`20261014-convex`, worktree `/workspace/byok-convex`)
  and is private with no source yet: do not edit it beyond what keeping whole-repo scripts green
  requires, and report each such touch.

## Threads

### 1. `20261014-react_publishable` -- `safebyok-react`, publishable

**Coach's text**: The preplan's *Thread 1* (`preplan.md`, "Thread 1: safebyok-react, publishable"),
with the sprint-level additions quoted verbatim:

> In addition to the items in that plan, please also make sure tests are runnnable per-package and
> also whole-repo; and that releases push all packages (not including the demos)

**Gloss**

* *Touches*: `packages/safebyok-react/**`, root `package.json`, `ci.yml`, `CLAUDE.md`, the demo's
  `package.json`.
* *Model*: `sonnet`. *Depends on*: nothing unmerged; cut from `origin/main`.
* **Pulled in from the preplan's own branch**: on `origin/main` the demo reads `"private": false`;
  the preplan branch fixes it to `true`. Make that one-line change here (`demo:` commit): it is
  needed before anything may treat "every non-private package" as "every public package". Git merges
  the identical change cleanly if the Coach lands the preplan branch.
* **Independent thinking asked for**: the preplan says the binding's tests need the core's `dist/`
  built first and forbids pointing them at source. That fails requirement 1 on a fresh clone. Pick the
  least magical way for `pnpm --filter safebyok-react test` to work from clean (a `pretest` that
  builds the core with `pnpm --filter 'safebyok-react^...' build`, or a vitest `resolve.alias` to the
  core's source). Recommendation: the `pretest` build, because it tests against the artifact a
  consumer gets and costs seconds; but you decide, and say why. Whatever you choose must keep
  working after thread 2 moves the core (filter by name, not path).
* Step 8 of the preplan (changeset) does not apply: nothing in this sprint adds a changeset.
* **Verify `pnpm pack`** rewrites `workspace:^` in the packed `package.json` to a real range and paste
  it into the PR: thread 3 relies on it.
* *Look-ahead*: thread 2 moves the core to `packages/safebyok` and folds this thread's `packages` CI
  job into the main jobs; thread 3 puts this package in the lockstep `fixed` group.

### 2. `20261014-core_under_packages` -- the core under `packages/safebyok`

**Coach's text**: The preplan's *Thread 2* ("Thread 2: the core under packages/safebyok"), plus the
sprint-level additions quoted under thread 1.

**Gloss**

* *Touches*: nearly every config in the repo: root and package `package.json`s, tsconfigs, eslint
  configs, vitest/tsdown configs, `ci.yml`, `release.yml` (smallest edit), `README`s, `CLAUDE.md`,
  `PROCESS.md`, `STYLE.md`, lockfile.
* *Model*: `opus`. *Depends on*: thread 1 (rewrites the same lines in `ci.yml`, root
  `package.json`, `CLAUDE.md`). Cut from thread 1's tip once filed; "Stacked on #N".
* **Requirement 1 lives here in full**: root scripts `test`, `test:coverage`, `build`, `lint`,
  `typecheck`, `justify` cover every package, and each package runs on its own. Add to CLAUDE.md
  *Commands* how to run one package vs everything. Make sure whole-repo scripts do not fail on
  packages that have no tests or source yet (`safebyok-convex`, the demo): prefer a property of
  those packages' own scripts to a hard-coded exclusion in the root, and report what you did.
* Do the two-commit shape the preplan describes (pure `git mv` first, may be red; then repairs).
* *Look-ahead*: thread 3 reads "the core's version" from `packages/safebyok/package.json` and relies
  on `pnpm -r` discovering all packages, with no `"."` entry in the workspace list.

### 3. `20261014-changeset_releases` -- changesets, one release script, the rewritten workflow

**Coach's text**: The preplan's *Thread 3* ("Thread 3: PR-based releases"), plus the sprint-level
additions quoted under thread 1.

**Gloss**

* *Branch label*: the preplan names it `20261014-pr_based_releases`, but that branch already exists
  (the preplan itself lives on it); this sprint's label is `changeset_releases`.
* *Touches*: `.changeset/`, root `package.json`, `scripts/`, `release.yml`, `ci.yml`, `PROCESS.md`,
  `CLAUDE.md`, PR template, `human/`.
* *Model*: `opus`. *Depends on*: thread 2 (the core is `packages/safebyok`; preplan's conditional
  about adding `"."` to the workspace list is moot: **do not add it**). Cut from thread 2's tip.
* **Pulled in / owed**: add the `rel` row to PROCESS.md's prefix table (the preplan branch has it; it
  is not on main) and make it say what it now means (the Version PR's commit).
* **Independent thinking asked for**:
  * Requirement 2: the release script discovers public packages from the workspace; the `fixed`
    list is checked against it by a test. Decide whether a name list or a pattern in `fixed` serves
    better given that `safebyok-convex` will go public later, and what `privatePackages` should be.
  * The preplan's bash release script duplicates parts of `changeset tag`, `changeset publish` and
    the action's release creation. Read what they do (including with `fixed` groups: tag names are
    per package by default, the preplan wants one `v<version>` tag) and either use them or say why
    not. TypeScript (`node scripts/release.ts`, covered by the root lint and typecheck, testable
    in-process) may serve better than bash; the repo already has `scripts/newb-label.ts`.
  * `npm stage publish` of a tarball vs a directory (see ground rules: `workspace:` rewriting;
    note too that `prepublishOnly` does not run for a tarball, so the script must run justify/build
    itself or rely on the Version PR's CI having done so).
  * The Coach may want the Version PR to be the *only* place a number is written; keep the preplan's
    "no CI push to main" ruling.
* *What only the first real release can verify*: the preplan's list of four, carried to the PR and
  `human/`. Add: the first release needs a changeset the Coach writes; the first version will be
  whatever it implies from `0.0.0` (one `minor` gives `0.1.0`).

## For the Coach

* The preplan branch `20261014-pr_based_releases` holds the preplan plus a `rel` prefix row and TODO
  edits; this sprint copied only the preplan (into this directory) and re-does the two small
  functional pieces it needs (demo `private: true`, in thread 1; the `rel` row, in thread 3). Neither
  conflicts when you land the branch.
* The sprint branch is `20261014-pr_releases`, not the `pr_based_releases` you typed: that name is
  the preplan's branch, checked out in the main checkout, and thread 3's.
