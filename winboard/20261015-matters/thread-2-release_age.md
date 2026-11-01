# Thread 2: release_age (2026-10-15)

Branch `20261015-release_age`, PR [#96](https://github.com/mrflip/safebyok/pull/96), cut from main
(`c4c070f`), not stacked. Justify: green (lint, typecheck, tests: root 123, safebyok 956, indexeddb
104, postgres 156, react 71, convex 276, demo 124, graphql 153, argon2-wasm 44; `pnpm size` green).

* **Built**: `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (minutes, seven days) and
  `minimumReleaseAgeStrict: true`. PROCESS.md *Dependencies* carries the policy (below).
  `notes/security.md` has the rule's entry and the exception's. `.github/dependabot.yml` gains
  `cooldown: default-days: 7`. An empty changeset (no published package's runtime changed).
* **Checked against pnpm 12.4.2** (the repo's `packageManager`): pnpm.io's dependency-resolution
  settings page, and the CHANGELOG shipped in the pnpm 12.4.2 install. `minimumReleaseAge` is in
  minutes (default 1440 since v11); `minimumReleaseAgeStrict` defaults to true once the age is
  set explicitly (set anyway, so the file says it); `minimumReleaseAgeExclude` takes names,
  globs, `pkg@1.2.3` and `pkg@1.2.3 || 1.2.4`. A frozen install verifies the lockfile against
  the policy ("Lockfile passes supply-chain policies"), so CI's `pnpm install --frozen-lockfile`
  (four places in ci.yml and release.yml) enforces it with no workflow change.
* **What the rule refused** (the old lockfile: 51 entries under seven days; direct dependencies
  whose range floor was itself under seven days, so no fresh resolution could succeed):
  `@anthropic-ai/sdk` 0.133.0 (demo), `@types/node` 24.19.2, `@vitest/coverage-v8` and `vitest`
  5.0.4, `eslint-plugin-chai-expect` 4.1.1, `eslint-plugin-unicorn` 78.0.0 (no 78 had aged; went
  to ^77.0.0), `typescript-eslint` 8.71.2 (and its `@typescript-eslint/*` family), `tsdown`
  0.23.1 (with `rolldown-plugin-dts` 0.28.7, `yuku-*` 0.18.1, `tinybench` 6.2.2), `zod` 4.6.7,
  `convex-test` 0.0.61, and transitively `@graphql-tools/{executor,merge,schema,utils}`,
  `@asamuzakjp/css-color`, `@fastify/busboy`. Floors were lowered to the newest release that has
  aged (`^24.19.1`, `^5.0.3`, `^4.1.0`, `^77.0.0`, `^8.71.1`, `^0.23.0`, `^4.6.5`, `^0.132.1`).
  The lockfile was deleted and re-resolved (pnpm's own advice: `pnpm clean --lockfile`; an
  in-place `--fix-lockfile` refuses): 639 entries now, almost all unchanged or downgraded.
* **The one exclusion**: `convex-test@0.0.61`, pinned exactly in `safebyok-convex` (0.0.60 lacks
  `defineTestApp`, which the Convex tests use). It ages past seven days at **2026-10-16T23:01Z**:
  if the PR files after that, delete the `minimumReleaseAgeExclude` entry, make the pin `^0.0.61`,
  `pnpm install`, and strike the security.md line. If it files first, the follow-up is on the
  Coach's list.
* **The hot-release policy** (the orchestrator's answer to the Coach's question, in PROCESS.md):
  more specifically pinned, not less -- exact version, excluded by name and exact version, recorded
  in security.md the same day, removed once past seven days, never for convenience.

## Decisions taken

* Lowered floors rather than excluding the young versions: every refused direct dependency had an
  older release inside its range, and an exclusion would have defeated the rule on day one.
* The hand pins of big_feats' YOLO decision 5 (`graphql-yoga` 5.24.1, `@graphql-tools/schema`
  10.1.3) are retired to `^5.24.1` and `^10.1.3`: the rule does what they did. Both resolve to
  releases older than seven days.
* `convex-test` is the only exclusion; it is pinned exactly (it is also what `^0.0.61` means).
* Dependabot `cooldown` added (not asked for): otherwise its PRs would propose versions the
  install refuses. Security updates ignore the cooldown by Dependabot's design.

## Deviations

* Two test lines reworded, because `eslint-plugin-unicorn` 77 (the mature release) flags them as
  `prefer-default-parameters` where 78 did not: `packages/safebyok/tests/vault.test.ts` (the
  two-stores test) and `packages/safebyok-convex/tests/convex-vault-db.test.ts` (`userId === ''
  ? null : userId`). No lint suppressions anywhere.
* The lockfile is wholly re-resolved: a large `pnpm-lock.yaml` diff, to be reviewed as such.

## Discoveries

* Under the rule, a range's floor must be a release that has aged; a worker who bumps `^x.y.z` to
  a fresh release the day it appears fails the frozen install. Bump floors to the newest mature
  release.
* After the rule, `pnpm install` warns of 24 deprecated `@yuku-*` 0.10.2 subdependencies (via
  `tsdown` 0.23.0, `rolldown-plugin-dts` 0.28.6, `yuku-parser` 0.10.2); the old lockfile used
  0.18.1, which has not aged. Dev-only; they go when `tsdown` 0.23.1 has aged (2026-10-17).
* The gripes line (not yet on this base) edits `package.json`s and the lockfile too: the lockfile
  will conflict. Resolve by taking this thread's lockfile, running `pnpm install`, and checking
  that the gripes line's added dependencies (if any) are seven days old.

## For the Coach

* `convex-test@0.0.61` exclusion expires 2026-10-16T23:01Z (see above).
