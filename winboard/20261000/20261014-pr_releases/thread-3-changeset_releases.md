# Thread 3: changesets, one release script, the rewritten workflow (2026-10-14)

Branch `20261014-changeset_releases`, [#22](https://github.com/mrflip/safebyok/pull/22), rebased
onto main after [#15](https://github.com/mrflip/safebyok/pull/15) and
[#16](https://github.com/mrflip/safebyok/pull/16) merged. Justify after the rebase: root green --
root's own 3 files / 67 tests, core 10 / 237 + build, convex 6 / 210, binding 1 / 7 + build, demo
3 / 24.

* **Built**: `.changeset/` (config, README); root devDependencies `@changesets/cli` ^3.0.3 and
  `@changesets/changelog-github` ^1.0.1 (bumpp and `pnpm bump` removed); root scripts `changeset`,
  `release:version`, `release:check`, `release:stage`; `scripts/release.ts` (`check`, `stage`)
  with `tests/scripts/release.test.ts`; `release.yml` rewritten; `ci.yml` asks PRs for a changeset;
  PROCESS.md *Releases* rewritten and the `rel` row added; CLAUDE.md, CONTRIBUTING.md, PR
  template, `.claude/agents/thread-worker.md` and `thread-reviewer.md` made true;
  `notes/security.md`; `winboard/20261014-pr_releases/20261014-changeset_releases-human.md`.

## Decisions taken

* **Changesets 3 and its action 2 do most of what the preplan's script did.** Verified current:
  `@changesets/cli` 3.0.3, `@changesets/changelog-github` 1.0.1, `changesets/action` v2.1.2 (sha
  `ae32849d…`, pinned with its sub-actions). `changeset publish-plan` finds the public packages
  npm lacks (discovering them from the workspace: requirement 2); `changeset pack` packs them with
  `pnpm pack` (real ranges for `workspace:`) in dependency order; the action pushes tags and writes
  GitHub releases from each CHANGELOG, reading tag events a custom script writes to
  `CHANGESETS_OUTPUT`. The one gap, which changesets' own docs name ("Staged Publishing does not
  work with Changesets"): it publishes with `pnpm publish`, which our trusted publisher refuses.
  So `scripts/release.ts stage` only stages the packed tarballs and reports tags.
* **TypeScript, not bash**: linted, typechecked, tested in-process with a fake runner.
* **The workflow splits into jobs**, as changesets documents for trusted publishing:
  `select-mode`, then `version`, or `pack` (release check, `pnpm justify`, `changeset pack`) and
  `publish`, the only job with `id-token: write`, which installs with `--ignore-scripts` and
  stages what `pack` built (via `actions/download-artifact` v8.0.2, pinned). No dependency
  caching, no persisted git credentials.
* **Per-package tags** (`safebyok@0.1.0`) and one GitHub release per package, changesets' monorepo
  naming, not the preplan's single `v<version>`: each release then carries its own package's
  CHANGELOG. The Coach has widened the tag ruleset from `v*` to cover `safebyok*@*` too.
* **`fixed` lists names**, `[["safebyok", "safebyok-react"]]`, with `release.ts check` and a test
  refusing a public package left out, a name that is not public, a public demo, two groups, or
  public versions that disagree. A package still at `0.0.0` may differ (it joins the group's
  version at its next bump), so making `safebyok-convex` public needs only the fixed list.
* **`privatePackages: { version: false, tag: false }`** (3.x's default, written out): private
  packages and demos are never versioned, so they need no changesets and no `ignore` entry.
* **The script never stages `0.0.0`** (the placeholder; `safebyok@0.0.0` is already on npm and
  `safebyok-react@0.0.0` would otherwise be staged on the first push after merge), and **never
  restages a version whose tag names another commit**, without asking npm. "Already staged" is
  recognized by npm's "previously published" wording, since `npm stage list` is closed to trust
  tokens (npm docs).
* **Dist-tag by version** (`-` → `next`), not changesets' pre-mode tag.
* **The changeset check skips Dependabot's PRs and the Version PR**, and uses the PR's base sha.
* **`release:version` = `changeset version && pnpm install --lockfile-only`**: the lockfile did not
  change in the trial, but the install keeps `--frozen-lockfile` honest if it ever does.
* **Dependabot unchanged**: dependabot-core's npm file fetcher reads `pnpm-workspace.yaml` and
  fetches every workspace package's `package.json` from `directory: /`.

## Deviations

* No `pnpm changeset init` (it is interactive in 3.x): config written by hand, README replaced.
* Preplan step 1.3 (`"."` in the workspace) skipped, as the plan said.
* Commits: `deps`, `tools` (twice), `docs`, `plan`.

## Discoveries

* **Throwaway trial** (in a scratch copy, not this branch): a `patch` changeset on the core moved
  both packages `0.0.0 → 0.0.1`; a `minor` then gave `0.1.0`; the binding's CHANGELOG reads
  "Updated dependencies" or "No changes in this release"; empty changesets are consumed; the
  lockfile did not change. `changeset publish-plan` and `changeset pack` on the result produced
  both tarballs, and `release.ts stage` against a fake `npm` staged both and wrote both tag events.
* **Peer range**: at 0.1.1 the binding packs `"safebyok": "^0.1.1"`; installing both lockstep
  tarballs into a scratch host with npm 11.19 and pnpm resolves cleanly. Lockstep keeps the 0.x
  caret right: a new minor of the binding needs the new minor of the core.
* `pnpm pack` of the binding is now a root test (`packedManifest`): it asserts no `workspace:`
  range survives.
* **This PR's own changeset check failed until #15 and #16 merged**: their package changes counted
  against main. Rebased onto them, the branch changes no public package; it carries an empty
  changeset (`.changeset/releases-bootstrap.md`) all the same, which bumps nothing.
* GitHub: Actions may now create PRs on this repo (the Coach turned it on); the `npm` environment
  has no reviewers and no branch limit; required checks include CodeQL, so the Version PR needs a
  human reopen.
* Not run: `npm stage` in any form (no dry run either: local npm is 11.19, and nothing here
  should talk to the registry as a publisher). actionlint 1.7.12 passes both workflows.

## For the Coach

See `winboard/20261014-pr_releases/20261014-changeset_releases-human.md`: what is left (the first changeset; reopen the Version
PR to run CI; optionally limit the `npm` environment to main), and what the first release proves.
Done by the Coach: Actions may open PRs, and the tag ruleset covers `safebyok*@*`.
Open question: a GitHub App token, so CI runs on the Version PR without the reopen.
