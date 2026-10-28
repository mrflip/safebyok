# Thread 23: convex-helpers 0.1.129 and the parity test's custom (2026-10-28)

Branch `20261028-helpers_bump`, PR [#318](https://github.com/mrflip/safebyok/pull/318), on main. Justify: green (core 3423 / 37 skipped,
convex 368 / 9 skipped, react 310, indexeddb 167, postgres 322, graphql 344, fastkey 49, demo 229,
e2e 107, root 266; size budgets within limits).

A follow-up to thread 18 ([#308](https://github.com/mrflip/safebyok/pull/308)), from two of the Coach's rulings.

* **Built**:
  * **convex-helpers 0.1.129, a day early** (the Coach approved it): devDependency of
    `safebyok-convex` and `e2e` pinned exactly (`0.1.129`); the peer of `safebyok-convex` is
    `^0.1.129`. `pnpm-workspace.yaml` gains `minimumReleaseAgeExclude: [convex-helpers@0.1.129]`;
    `notes/security.md` amends its `minimumReleaseAge` entry (and the 2026-10-27 peer range).
  * **The two `"erasableSyntaxOnly": false` overrides are deleted** from
    `packages/safebyok-convex/tsconfig.json` and `e2e/tsconfig.json`; `tsc --noEmit` is green in
    both without them (and `--traceResolution` shows `convex-helpers/server/zod4` resolving to
    `zod4.d.ts`).
  * **The parity test ties its custom case to the sidecar.** `zodShape` takes the field's `ckey`;
    a Zod `custom` reads as `any` only under `sidecar`, and anywhere else throws "no shape for a
    Zod custom", so a second `z.custom` in a stored record fails the test. A new test covers both
    sides.
  * Changeset `20261028-helpers_bump` (patch, safebyok-convex: the peer floor moves).
* **Decisions taken**:
  * **Exact pin on the devDependencies, a caret floor on the peer.** PROCESS.md pins a hot
    release exactly; a pinned peer would constrain every host, so the peer keeps the Coach's
    `^0.1.129`, which only floors it.
* **Discoveries**:
  * 0.1.129 still ships a top-level `src/` folder of `.ts`; the `server/*` entry points that
    safebyok-convex imports resolve to `.d.ts`, which is why the flag is no longer a problem.
* **For the Coach**:
  * **Follow-up after 2026-10-28 23:13 UTC:** delete the `minimumReleaseAgeExclude` entry and
    return the two devDependency pins to `^0.1.129` in one commit (PROCESS.md); the security note's
    amendment then says it is closed. The exclusion can go the moment the PR merges after that time.
* **After review**: safebyok-convex's README and #308's unreleased changeset
  (`.changeset/20261027-convex_helpers.md`) said "0.1.128 or later"; both now say 0.1.129.
