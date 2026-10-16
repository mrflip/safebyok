# Thread 8: ci_release (2026-10-16)

Branch `20261016-ci_release`, PR [#130](https://github.com/mrflip/safebyok/pull/130), cut from main
(`f63bd915`). Justify: green on this branch against main's size budgets, none over: root 211 tests;
safebyok 1610, indexeddb 144, postgres 225, react 111, fastkey 44, convex 278, graphql 212, demo
162, e2e 85; the new `idbVaultDB`, `VaultProvider` and `reactEverything` entries pass.

* **Built**: `.github/workflows/dependabot-changeset.yml` and `scripts/dependabot.ts` (the Dependabot
  changeset, G447/G448); `runtime-deps.ts` reads `peerDependenciesMeta`, `bundledDependencies` and a
  package removed, added or made private (G449); `release.ts` re-reports a tag whose GitHub release
  is missing (G442); `ci.yml` (actionlint by sha256, node-compat 22 as the floor, the bot-login
  changeset skip, one build, size via `size:check`); `release.yml` (`pr-draft: create`);
  `package.json` (`size` builds once, `size:check`, `justify` runs it); `scripts/changeset.ts`
  (`--package`, `--bump`, `--message`, no terminal); `scripts/git-survey.sh` (no prune while a
  missing-directory worktree's branch has an open PR or commits not on origin); eslint configs
  (two rules off); `tsdown.config.ts` (flat `dist/`); `safebyok/testing` (camelCase handles, one
  `MakeDevices`, deadlines); `notes/release-checklist.md`; the platform floor in every README;
  PROCESS.md; notes/security.md; STYLE.md; `human/20261016-ci_release.md`.
* **Decisions taken**:
  * Size entries sit at PROCESS.md's rule on their own measure, peers left out with `ignore`
    (`idbVaultDB` 1.5 kB -> 2.6; `VaultProvider` 3.07 -> 4.7; `reactEverything` 3.48 -> 5.3). The
    file's one existing line changed is the last line's trailing comma.
  * The changeset skip names `safebyok[bot]` (read off #56's author via the API).
  * A commit is Dependabot's by author email `49699333+dependabot[bot]@users.noreply.github.com`
    (the id is in this repo's own history).
  * `unicorn/prefer-promise-with-resolvers` is off beside `prefer-iterator-to-array` (same ES target),
    which removed the three suppressions instead of only noting them.
  * `pnpm changeset --package` refuses off a thread branch, rather than invent a name.
  * The Dependabot gate diffs from the merge base, so a PR behind main does not read main's newer
    changes as its own.
* **Deviations**: the plan says node-compat "gating on 22": a workflow cannot make a check required,
  so the job fails on 22 and reports on the rest, and the ruleset line is the Coach's
  (`human/20261016-ci_release.md`). G517 is closed in part (below). CLAUDE.md's Commands is a line
  stale (not edited).
* **Discoveries**: tsdown ignores `root` for an object `entry`; the array form honours it. shellcheck
  found an existing finding in `ci.yml` (unquoted `$merges`), now fixed; actionlint without
  shellcheck passes what it does not. `gh` shows the Version PR's author as `app/safebyok`, the REST
  API as `safebyok[bot]`. A fork is needed for CI's diff: HEAD in a PR run is the merge commit.
* **For the Coach**: see `human/20261016-ci_release.md` (the required check; the first Dependabot
  PR; the retry's `gh`). Thread 7 grows the React package: the `VaultProvider` and `reactEverything`
  budgets were measured on main, so if 7 lands first, re-measure them at the restack (thread 9
  re-derives them anyway).

## Closes

Closed in code or config: G436 (`release.yml`), G435 and G437 (PROCESS.md *Releases*), G401
(PROCESS.md *Size budgets*), G442 (`release.ts` and its tests), G446 and G447 (`ci.yml`,
`scripts/dependabot.ts`), G448 (`dependabot-changeset.yml`; unproven until merge), G449
(`runtime-deps.ts`), G404 (`package.json`), G405 and G414 (`size` builds once; CI's second build
gone; PROCESS.md says ESM-only and size-limit's Node range, the other two caveats), G406 (`ci.yml`),
G269 (`.size-limit.json`), G416 (`ci.yml`), G399 and G521 (the configs), G408 (flat dist, helpers on
src's rules, the disable gone; source maps were done), G412 (`scripts/changeset.ts`), G512
(`git-survey.sh`, `notes/housekeeping.md`), G510 (`test-helpers.ts`), G381 (convex test), G373
(`notes/release-checklist.md`), G417 (READMEs, `ci.yml`; `engines` already stood at `>=22`).

* G410: **closed with a dated note**: no release of eslint-plugin-react or -jsx-a11y declares
  eslint 10 (checked 2026-10-16); the comment is in `packages/safebyok-react/eslint.config.mjs` and
  the demo's.
* G517: **closed in part, row stays if you want the rest**: fixed the missing deadlines (a hung
  move now fails naming its schedule) and the two device-factory shapes (`MakeDevices`). The other
  three are limits of what a test can see, now stated in `vaultDBTimingChecks`' doc block: a second
  round trip around the turnstile (only the adapter knows its count), `pushFromTheStart` when the
  watch start is not a round trip (Convex's `watchQuery`), and `expectHeard` crediting by timing.
* Closed by a note: G440, G443, G445, G444, G465, G376, G293, G400, G235 are no-code rows already
  swept at the sprint's start (G444: the changesets action v2.1.2 resets the branch, checked then;
  G445: granted and unused, nothing needs it). G178: the rule is in STYLE.md (underbar_case on any
  stored-record facade; `keyDeriverLabel` is the concept). G464: VOCABULARY keeps the one
  camel/underbar row, as the page does for every pair; no edit.
