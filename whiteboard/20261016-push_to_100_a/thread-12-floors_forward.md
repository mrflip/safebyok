# Thread 12: floors_forward (2026-10-17)

Branch `20261017-floors_forward`, PR to follow in the report, stacked on #139. Justify: green (lint, typecheck, tests, build, size); one pre-existing `safebyok-react` lint warning (an unused `eslint-disable` for `unicorn/prefer-promise-with-resolvers`), not touched here.

* **Built**: `convex-test` is `^0.0.61` again in `safebyok-convex` and `e2e`; its `minimumReleaseAgeExclude` (and comment) is gone from `pnpm-workspace.yaml`; its `notes/security.md` entry is struck (by a sonnet subagent). Four direct-dependency floors raised to the newest release that has aged (checked with `npm view <pkg> time --json`, cutoff 2026-10-10T03:40Z): `@types/node` `^24.19.2`, `eslint-plugin-chai-expect` `^4.1.1`, `@types/pg` `^8.23.1`, `graphql-yoga` `^5.24.4`. All devDependencies; the changeset is empty.
* **Decisions taken**: peer ranges (`zod ^4.0.0`, `vitest ^5.0.0`, `react ^19.0.0`, `@urql/core ^6.0.0`, `graphql`) were left wide on purpose: raising a peer floor narrows what a host may install. Every runtime `dependencies` floor was already at the newest aged release. `convex` left at `^1.46.0` (the test pins it). `@zxcvbn-ts/*` untouched (thread 16).
* **Deviations**: tsdown is NOT raised (see below).
* **Discoveries**:
  * `tsdown@0.23.1` was published 2026-10-10T16:00:17Z, so it ages past seven days at **2026-10-17T16:00Z**, not on the 17th's first minute. The `@yuku-*` deprecation notes come from `rolldown-plugin-dts`: the lockfile holds `yuku-*@0.10.2`; `rolldown-plugin-dts@0.28.7` (needed by tsdown 0.23.1, `^0.28.7`; yuku `^0.18.1`) was published 2026-10-10T15:25:58Z and ages at **2026-10-17T15:25Z**. Strict pnpm refuses both until then.
  * Major releases that have aged and were not crossed: `@types/node` 26.6.5, `typescript` 7.0.2, `convex` 3.3.3.
  * `convex-test@0.0.62` (2026-10-14) has not aged; `^0.0.61` allows only 0.0.61 (caret on 0.0.x).
  * G415 baseline: `dist/` of all seven packages built before and after this thread's changes is byte-identical (`diff -rq`), with tsdown 0.23.0 both times, so this only proves the floors above did not move output.
* **Closed / not closed**:
  * G402: **closed** (commit "convex-test is a range again").
  * G403: **not closed**: needs `tsdown ^0.23.1` and a re-resolved lockfile after 2026-10-17T16:00Z (the plugin ages at 15:25Z). Then `pnpm up tsdown -r`, check the `@yuku` lines vanish.
  * G415: **not closed**: the before snapshot is the 0.23.0 build; rerun the same before/after `diff -r` of every `dist/` across the tsdown 0.23.1 move.
* **For the Coach**: the three majors above are yours to call; G403/G415 want a follow-up after 16:00Z today (a one-commit job).
