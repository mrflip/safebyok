# Thread 15: e2e_home (2026-10-16)

Branch `20261016-e2e_home`, PR [#111](https://github.com/mrflip/safebyok/pull/111), based on main (`58b132a`). Justify: green at the root (core 1295, convex 254, e2e 78, root 155, react 109, indexeddb 139, postgres 217, graphql 205, argon2-wasm 44, demo 153); `pnpm size` green.

* **Built**
  * `safebyok-convex/testing` (`packages/safebyok-convex/src/testing.ts`): the fake Convex deployment, now a built, test-only entry beside `./test`, with hand-written `exports` and a `tsdown` entry. `fakeDeployment(host)` takes the host built with `convex-test`'s `defineTestApp(...).defineModules(...)`; `deployment.client(subject)` is a `ConvexClient`; `deployment.connectWith(subject, make)` connects any other client (a `ConvexReactClient`) and closes it with the rest. Tests in `tests/testing.test.ts`. A minor changeset for `safebyok-convex`.
  * `e2e/`, the private package `safebyok-e2e` (in `pnpm-workspace.yaml`, its own lint, typecheck, test and justify scripts): `tests/convex/convex-vault-db.test.ts` runs the `VaultDB` battery, the refusals, the subscriptions, sign-out and a two-device vault over `ConvexReactClient`, through `safebyok-convex/testing`. `react` leaves `safebyok-convex`'s devDependencies; nothing in that package imports React.
  * `safebyok-convex` keeps its own `tests/convex-vault-db.test.ts` over `ConvexClient` (a one-row `ClientCases`), so its suite runs without the workspace's other packages; `convex-vault-db.ts` is covered by it at 98.21% of lines and 95.83% of statements, bar one branch (see *Review follow-up*).
  * `scripts/release.ts` refuses a public package under `e2e/` as under `demos/` (tested). Comments and configs that listed `packages/` and `demos/` (root eslint and vitest, `ci.yml`, `dependabot.yml`, `pnpm-workspace.yaml`) name `e2e/` too; CLAUDE.md, READMEs and PROCESS.md name it.
* **Decisions taken**
  * The Coach chose option (b): an adapter's tests stay in its package; `e2e/` is for the adapter-by-framework checks (and later heavyweight browser specs). The earlier build, which moved the whole file into `e2e/`, is dropped.
  * *`fakeDeployment(host)`, not `fakeDeployment(getUserId)`*: the published entry then imports `convex` alone, with no `convex-test`. The host's types are structural (`FakeHost`, `FakeBackend`). Confirmed by the Coach.
  * *The looped test bodies are duplicated* in the two `convex-vault-db.test.ts` files (battery, verbs, vault_full, subscribe, sign-out, before-sign-in): they need vitest, so no shared table was worth it. Both files say so in their first lines: a change to a looped test is made in both. Confirmed by the Coach.
  * *`./testing` versus `./test`*: TODO's CI list flags `./test` importing a devDependency (`convex-test`, type-only). `./testing` does not repeat it: its runtime imports are `convex/browser`, `convex/server` and `convex/values`; `convex` is already a peer. TODO says so.
  * `heavyBox` and `RealPassphrase` are copied into `e2e/tests/convex/test-helpers.ts` (a few lines).
  * No `.size-limit.json` line: it has no entry for any adapter.
* **Deviations**: the plan's "move the React tests to `e2e/`" became "ship the fake as an entry, and run the React half there", at the Coach's ruling. No jsdom or testing-library in `e2e/`: the Convex clients need neither (`convex/react` needs only `react`).
* **Discoveries**: the worktree's registration was swept once mid-thread; I re-added it from the branch (the work was all committed). The fake's `connectWith` is why no React import is needed in the published entry.
* **For the Coach**: `safebyok-convex/testing` is new published surface (the changeset says so). [#119](https://github.com/mrflip/safebyok/pull/119) (thread 6) also edits `packages/safebyok-convex/tests/convex-vault-db.test.ts`; whichever files second rebases, and a looped test it adds there needs its copy in `e2e/` if it applies to the React client.

## Review follow-up

The review came back fixed, with two commits and no suppressions: `connectWith`'s test builds its client from the `(address, opts)` it is handed (`2e23223`), and the Convex README's *Testing your own client code* section shows how the host is built (`b12cc2b`). I took two minors: `FakeDeployment.close()` empties its client list, so a second call closes nothing twice (a test for it), and the coverage figure above is corrected.

* **Open question**: `convex-vault-db.ts` lines 165-166, the `watchQuery` branch that only a `ConvexReactClient` takes, are now covered only by `e2e/`, which reads `dist/` and so is not in the package's own coverage report. That follows from the Coach's ruling (b); left as is.
