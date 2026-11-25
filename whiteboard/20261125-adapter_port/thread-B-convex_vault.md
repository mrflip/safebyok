# Thread B: convex_vault (2026-11-25)

Branch `20261125-convex_vault`, PR [#923](https://github.com/mrflip/safebyok/pull/923), stacked on [#916](https://github.com/mrflip/safebyok/pull/916).
Proved: `pnpm justify` green after the rework on the Coach's rulings, on `origin/20261125-big_names` (3382c8d0c):
safebyok-convex 224, safebyok 2291, safebyok-big 2951, convex-big 334, postgres 135, indexeddb 130, react 339, fastkey 43,
graphql-big 448, e2e 576, demos 99/24/26/111, scripts 331, the other -big packages green; lint, typecheck and build clean.

The catch-up rebase met one conflict, in `notes/security.md`: both sides added an entry at the top of *Of Interest*;
both kept, this thread's first.

A first worker died of a network error before committing; its uncommitted port was judged sound and kept, then
finished, tested and committed by the second.

Rework on the Coach's rulings (2026-11-25), rebased onto `origin/20261125-big_names` (3382c8d0c) without conflict:
E1, a failed Convex call refuses `storage_issue` from the core's new `storageCallRefused`, the error its cause (so big's
held-box fallback on `storage_unavailable` no longer applies); sidecar keys Convex will not store refuse `bad_record`
before the call, checked by `convexToJson` rather than a walker of our own; E5b, the count test asserts no other
document was written (convex-test's `documentsWritten` limit), two-clause titles split, sloppy-argument tests for each
component function and for `ConvexVaultDB`'s options; E7, `server.ts` exports only `safebyokRefusal` and its type, the
kind list, type and checker tied by `AssertEqual` (newly re-exported from `safebyok/storage` with `CheckerInput`).

* **Built**
  * `packages/safebyok-convex`, public, 0.5.0, peer dependencies `safebyok` and `convex`, back in the `fixed` group.
    * **Component** (`src/component/`): one table `things {userid, banklabel, labelpath, thing}`, index `by_scope` on
      the three, so `childrenIn` fetches a Thing's children as one range (`gte labelpath/`, `lt labelpath0`).
      `things.ts` serves `getThing`, `listThings`, `getWorld`, `watchThings` (queries) and `writeThing`, `birthBank`
      (mutations). Each write mutation checks the ask with the core's `checkedWriteAsk` / `checkedBirthBankAsk`, fetches
      the cited Thing with the bank and main gate, runs the core's classifier only to decide whether to write
      (`wouldWrite`), writes `ask.record`, and returns the fetched state and `written` (or null).
    * **ConvexVaultDB** (`src/convex-vault-db.ts`) extends `AdapterVaultDB`: each `do*` is one `client.query` or
      `client.mutation`. The client classifies what came back to the same outcome, and throws `unexpected_error`
      (`storedOutOfStep`) where its act and the component's `written` disagree. `doWatch` keeps `watchThings` open
      (`ConvexClient.onUpdate`, or `ConvexReactClient.watchQuery`), diffs each result against the last by labelpath and
      serialized JSON, and reports nothing for the first.
    * **Server helpers** (`src/server.ts`): `SafebyokVaultComponent(components.safebyok).api({ getUserId })` builds the
      six public functions, each refusing `identity_revoked` unless the caller is the ask's `userid`.
    * Ported from convex-big as files: refusals, phrases, component-api, `test` entry, `testing` (fakeDeployment),
      eslint config, tsdown/vitest config, `.claude/skills`, LICENSE. CHANGELOG moved from convex-big.
    * Tests: the core's VaultDB battery over a real `ConvexClient` on `fakeDeployment`, plus server, refusals, testing,
      test-entry and test-helper tests ported from convex-big.
    * README rewritten on the indexeddb README's plan; setup in three steps (install component, serve functions, hand
      `ConvexVaultDB` to the core). Root README lists the package.
  * `safebyok/storage` exports `checkedWriteAsk`, `checkedBirthBankAsk` and `birthPutsOf`, for an adapter whose server
    checks an ask itself.
  * `notes/security.md`: an entry on the identity gate, server-side checks and dropped Convex error text.

* **Decisions made**
  * **Classify on both sides.** The component classifies only to decide whether to write, treating a VaultError as "no
    write"; refusals never cross the wire, the client derives them again from the fetched state. Same design as
    convex-big; the out-of-step check catches a component on another safebyok than the client.
  * **No `crossedErr` port.** Only two kinds cross as `ConvexError` data: `identity_revoked` (from the wrapper) and
    `bad_record` with the checker's message (the component's ask check), as convex-big's own `refusals.ts` carried. So
    big's `crossedErr` / `vaultErrorOfCrossed` (in `safebyok-big/src/shapes/shapes-bank-answers.ts`) was not needed and
    not ported. Thread D (GraphQL), which carries every refusal over the wire, should port that file into the new core.
  * **Client errors** go through the core's `DB.storageFailed(oplabel, thrown)`, which names the call and the error's
    name and quotes none of Convex's message (a dev deployment may quote args). This is the existing helper the ruling
    allows; no other catch re-labels an error. A received record failing its check refuses `storage_issue` through the
    classifier, as the ruling says.
  * **The watch re-sends the whole bank** per change, as big's did: simple, one reactive query; the README states the
    16 MiB query-read ceiling on a bank's size.
  * **Function module name** `convex/safebyokVault.ts`, `api.safebyokVault` (big used `safebyokBank`).

* **Deviations**
  * None from the thread text. The functions are six, not big's thirteen, so `SafebyokVaultComponent` replaces
    `SafebyokBankComponent`; the changeset says so.

* **Discoveries**
  * `safebyok` is private at 0.0.0, so no changeset names it for the `storage.ts` exports.
  * A write from another device landing between `watch()` and the query's first result is folded into the first result,
    which is not reported. `doWatch`'s contract says nothing about the start, and postgres's LISTEN has the like window;
    no code and no wontfix row (not a lifecycle crossing).
  * `e2e/` and the demo still build on safebyok-convex-big; left alone.

* **For the Coach**
  * Setup path in the README (three steps) is the one you asked be right and short: please read it against your app.
  * Upgrading from convex-big means emptying the old component tables before deploy (Convex refuses to drop a table
    with rows); stated in the README and changeset.

**Rework after review (2026-11-25), renames before the first release:** `demandCaller` is `checkCaller` (it awaits `getUserId`; STYLE.md's `demandFoo` is synchronous, and `checkFoo` promises nothing about sync); `safebyokErrorKindVals`/`SafebyokErrorKind` are `safebyokErrorkindVals`/`SafebyokErrorkind`; `FakeDeployment.as`/`.arrange` are `_cheat_backendAs`/`_cheat_arrange`. The security.md entry's one `demandCaller` was changed in place, since that entry is unmerged. The old safebyok-convex-big keeps the old names.

**Rework after lease_shelf's line (2026-11-25):** rebased onto #916's tip f99077407 (`sprintbase`), now on main with #905
`stats`, #911 `pg_read_tc` and #915 `one_watch`. One conflict, `packages/safebyok/src/storage.ts`'s `shapes-asks`
export: main added `type StatsAsk`, this thread `checkedWriteAsk`, `checkedBirthBankAsk` and `birthPutsOf`; both kept.
* **`doStats`**: a new component query `stats` (served by the wrapper as the seventh function, behind `checkCaller`)
  reads every Thing of the bank by `by_scope` (`bankThingsIn`, now shared with `watchThings`) beside `rootsIn`, and
  returns `vaultStatsOf`'s `box` and `gate` with the bank and `tracked`. The client adds `max: ConvexBankLimits`,
  32,000 Things and 16,777,216 bytes: Convex's documented per-query limits (documents scanned, data read), which bound
  a bank because the stats and the watch read it whole. The stats battery runs against Convex (194 tests).
* **`read_tc`: left to the fallback**, as memory and IndexedDB do. Considered minting it in the component with
  `readTcNow()` under Convex's `Date.now()`; set aside because a query's `Date.now()` is frozen at its start and Convex
  re-serves a cached query result (its best-practices page: a `Date.now()` query is still cached, only invalidated
  more often), so a later get could answer an earlier read_tc, against the battery's "a later read_tc for each later
  list"; and using `Date.now()` in a query costs Convex's cache. Answers keep the device time made before the call is
  sent; watch notices are dated on arrival.

**Rework, E3 (the Coach, 2026-11-25, "E3 remove the guards"):** the watches' `#no-slop-crossings` guards are gone, one commit per adapter. Convex drops `isWatching` from the result and failure handlers, keeping only the unsubscribe-once (Convex counts a query's watchers). Postgres drops the guards in `onNotify`, its fetch's `.then`, `onFetchFailed` and `onListenFailed` (now `onBadNews` itself), keeping `unwatch`'s unlisten-once (a fetch-ended watch is stopped again by its holder; new test "unlistens once…") and the held `listening` promise (the only way to unlisten a watch stopped before LISTEN resolves). The two-notice half of "ends a watch…" went with its guard. New `notes/wontfix.md` row: *A Convex or Postgres watch's result, notice or failure that lands after its watch is stopped*; a patch changeset for safebyok-postgres.

**Rework, CI build (2026-11-25):** `test-build` and `node-compat` failed at `safebyok-convex build`: `zod/v4/locales/az.d.cts uses CommonJS dts syntax`. The exported `safebyokRefusal` checker's declared type names zod's types (through `DB.Refusing<Zod…>`), and zod is only a devDependency here, so tsdown bundled its `.d.ts` files into `dist/node_modules/.pnpm/zod@…` (locally too, quietly; a clean install reaches the `.d.cts` locales). Fix: `deps: { neverBundle: [/^zod(\/|$)/] }` in `tsdown.config.ts`, as safebyok-react does; zod is a peer dependency of safebyok, so a host has it. `dist/refusals.d.ts` now has `import("zod")`.
Reproduced with `CI=true pnpm --filter safebyok-convex build` (`failOnWarn: 'ci-only'` makes the warnings errors; 32 matching lines without the fix, none with it). Also restored `eslint-plugin-unicorn` to `^80.0.0` in this package (a rebase over #919 had left `^79.0.0`); the lockfile follows. A zod peer dependency was set aside: this package never declared one, and `neverBundle` is what safebyok-react does for the same reason, without adding a requirement the core's own peer already meets.
