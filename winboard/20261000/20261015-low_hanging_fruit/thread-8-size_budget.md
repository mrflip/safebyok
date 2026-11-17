# Thread 8: size_budget (2026-10-15)

Branch `20261015-size_budget`, PR [#42](https://github.com/mrflip/safebyok/pull/42), stacked on [#40](https://github.com/mrflip/safebyok/pull/40) (itself on [#34](https://github.com/mrflip/safebyok/pull/34)). Justify: green (root 72 tests; core 283, convex 217, react 8, demo 24; `pnpm size` passes).

* **Built**: `.size-limit.json` at the root and `pnpm size` (builds the core, then `size-limit`). Six entries over the built `packages/safebyok/dist/`: `everything`, `openVault`, `stableJsonify`, `argon2idWebV1Deriver` (all from `index.js`), `idbDeviceDB` (`idb.js`), `browserOpts` (`browser.js`). CI's `test-build` job runs `pnpm size` after the build. A `CLAUDE.md` Commands line. Dev dependencies `size-limit` and `@size-limit/preset-small-lib` (both 14.2.0, current on 2026-10-15), at the root; empty changeset `.changeset/20261015-size_budget.md`.
* **Measured and set** (rolldown via the preset, minified, **brotlied**, zod included; limit is about 7-8% above):

  | entry | brotli now | limit | raw minified now |
  | ----- | ---------- | ----- | ---------------- |
  | everything | 35.55 kB | 38 kB | 135.9 kB |
  | openVault | 29.26 kB | 31.5 kB | 114.8 kB |
  | stableJsonify | 25.12 kB | 27 kB | 101.3 kB |
  | argon2idWebV1Deriver | 5.01 kB | 5.5 kB | 14.3 kB |
  | idbDeviceDB | 25.72 kB | 27.5 kB | 103.0 kB |
  | browserOpts | 30.54 kB | 33 kB | 117.7 kB |

  The plan's raw figures (136 / 132 / 106 / 108) were before thread 2; `openVault` fell by about 17 kB raw with noble gone, as predicted. A lowered limit fails (`size-limit` exits 1, "exceeded by 9.26 kB", tried by hand).
* **Decisions taken**:
  - **Config at the root, not in the core.** `size-limit` always excludes the package's `peerDependencies` (`get-config.js`), and zod is the core's peer and most of its bundle; a core-level config measures 7 kB for `openVault` and would never see the zod-mini thread's gain. The root has no peers, so zod is bundled as an app without it would ship it. The cost: the budget includes zod's tree-shaking, which is what we want to lower.
  - **Brotli** (size-limit's default) rather than raw minified: it is what crosses the wire. Raw figures above for comparison with the plan.
  - **Not in `pnpm justify`.** Thread 10 rewrites the justify line; a new `size` script merges cleanly, an edit would not. The root `size` script builds the core first so a stale `dist/` never passes. Folding `pnpm size` into justify afterwards is one `&& pnpm size`; cost is about two seconds.
  - **Keep `tests/index.test.ts` (the `argon2` grep) beside the budget.** The grep reads `src/` with a positive control and says exactly "noble must not be in a bare `openVault`"; the budget reads `dist/` and says "too big". Noble is about 5 kB brotlied and the `openVault` limit has 2.2 kB slack, so the budget would also catch a noble regression, more loosely.
  - Added an `argon2idWebV1Deriver` entry (not asked for): it pins the deriver's own cost, so a growth in noble shows apart from zod's.
* **Discoveries**: a bare `stableJsonify` still costs 25 kB: zod's schemas at module level in the shared chunk are not shaken out. That is the zod-mini thread's target; lower the limits there. size-limit's `--why` needs `@size-limit/rolldown-why`, not installed.
* **For the Coach**: a yes to the two dev dependencies (boring, widely used; installed per PROCESS.md and reported). After [#37](https://github.com/mrflip/safebyok/pull/37) merges, add a `mask` entry: `{ "name": "mask", "path": "packages/safebyok/dist/utils.js", "import": "{ mask }", "limit": ... }` (about 4.1 kB built; measure the brotli). The Sprint doc mirror was skipped: the Docs tools are disconnected.
