# 20261014-pr_releases: resolution

Sprint `pr_releases` made releases PR-based, in three threads plus a plan PR: [#15](https://github.com/mrflip/safebyok/pull/15) (`safebyok-react` publishable), [#16](https://github.com/mrflip/safebyok/pull/16) (the core moves to `packages/safebyok`), [#22](https://github.com/mrflip/safebyok/pull/22) (changesets releases) and [#23](https://github.com/mrflip/safebyok/pull/23) (the sprint's plan and progress). Gripes from its whiteboard files, its -human reports and its PRs, as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

30 gripes: 8 unresolved, 22 resolved.

## Unresolved

- G356 Click through the demo's passphrase dialog in a real browser (set, enter, mistype, dismiss); no one has since safebyok-react became a built package — todo_gripes, old_gripes, humans_gripes, whiteboard_gripes
- G410 Resolve `pnpm peers check` warnings (eslint 10 unmet by jsx-a11y and react plugins) and `settings.react.version` pinned to '19.3' because 'detect' crashes — old_gripes, whiteboard_gripes
- G416 Run actionlint on the workflows — old_gripes, whiteboard_gripes
- G439 Deprecate `safebyok@0.0.0` (npm shows it not deprecated) — todo_gripes, old_gripes, whiteboard_gripes
- G440 Verify "already staged" detection, which rests on npm's "previously published" wording only — old_gripes, humans_gripes, whiteboard_gripes
- G441 Find out whether a staged version keeps its `--tag` on approval (a non-`latest` tag never tried) — todo_gripes, old_gripes, humans_gripes
- G442 Retry a failed GitHub release creation on a re-run (the tag case is tested, the release case is not) — old_gripes, whiteboard_gripes
- G503 Hold comments to 100 columns (#81): redo the reflow from its recipe, decide trailing comments, `@ts-expect-error` lines, Markdown tables, STYLE's "two more spaces" — Coach: leave until 1.0.0-pre — gripes_1_doc, old_gripes, prs_open, prs_60_80, humans_gripes, whiteboard_gripes *(deferred)*

## Resolved

- G218 Put `safebyok-convex` in CI and give it its own configs, so its `justify` stops failing on an empty source → done (PR#16, PR#36)
- G361 Fix the flaky "altered ciphertext" tests in crypto.test.ts and vault.test.ts (overwriting with `A`, ~1 in 64) → flip a byte; `TH.tweakB64` (PR#25, PR#36)
- G383 Root scripts chained with `&&` hide package failures; a stale root `dist/` fails lint; root build races → `--no-bail` both-runs, `**/dist/**` ignored, `--stream` (PR#16, PR#36)
- G385 `justify` takes ~35-40 s with 13 tsdown runs → ~20 s, each package built once per run (PR#72)
- G386 Check Dependabot `directory: /` covers `packages/*` and `demos/*` → sufficient, comment added (PR#72)
- G419 Build releases: changesets, Version PR, per-package tags, lockstep group, staged npm publish → done (PR#11, PR#15, PR#16, PR#22)
- G420 `npm stage` would ship `workspace:` ranges; `pnpm pack` skips `prepublishOnly`; a hand-run publish could ship `@safebyok/source` → refused, rewritten, justified before pack, `require-pnpm` (PR#15, PR#22, PR#36)
- G421 Write the first changeset and run the first release → `safebyok@0.1.0`, `safebyok-convex@0.1.0` published with provenance (PR#28, PR#39)
- G422 A Version PR opened by the workflow token runs no checks; use a GitHub App token → done (PR#27)
- G423 Flip the Coach's switches: Actions may create PRs, tag ruleset widened to `safebyok*@*` → done by the Coach (human/20261014-changeset_releases)
- G424 Verify the trusted publisher accepts the rewritten workflow and provenance survives staging and approval → 0.1.0 published with SLSA provenance (old_gripes, Addressed)
- G425 `safebyok-react@0.1.0` had a tag and release but was 404 on npm → Coach fixed; now on npm (npm view safebyok-react)
- G426 Every push to main ran pack/publish as no-ops; a failed tag push was not retried → select-mode job, tag case tested (old_gripes, Addressed)
- G427 Pin npm@12.2.0 by hash in the publish job → tarball checked against `dist.integrity`, installed offline (PR#72)
- G428 The changeset check skips Dependabot PRs and the Version PR → Dependabot PRs moving runtime deps need a changeset; the Version PR's skip stays by construction (PR#72)
- G430 Limit the `npm` environment to main, add required reviewers; can a rejected stage be restaged? → Coach NOTED: "still a one-person project" (Coach ruling, old_gripes Addressed)
- G432 Document prerelease mode rather than automate it → PROCESS.md, `distTag` by version (PR#22)
- G434 Give `safebyok-react` a publishable build like the core; peer range `^0.0.0` → tsdown build, lockstep `workspace:^` rewritten at pack (PR#15)
- G461 Make the agent definitions true about root justify covering packages; update the pnpm `-w` memory note → done (pr_releases thread 3; auto-memory)
- G463 Find and close finished threads' branches and idle worktrees → `scripts/git-survey.sh` and `/branch-sweep` (PR#112); `.DS_Store` cleanup script (PR#116)
- G484 Should the packages job and the demo be required checks? → ruleset requires test-build, lint-typecheck and CodeQL; `node-compat` optional on purpose (old_gripes, Addressed)
- G486 Commit the reviewer's uncommitted release-script fix; reconcile design drift from the preplan → landed (PR#22); drift recorded (old_gripes, Addressed)
