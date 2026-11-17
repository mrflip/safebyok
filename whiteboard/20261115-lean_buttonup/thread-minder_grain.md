# Thread minder_grain: the ThingMinder goes with TanStack's grain (2026-11-17)

Branch `20261117-minder_grain`, [PR #716](https://github.com/mrflip/safebyok/pull/716), on main. Proved: safebyok lint and typecheck clean, its tests 832 passed; `pnpm justify` after the catch-up rebase (see the PR's **Tests:** line).

The nine directives agreed with the Coach for "The ThingMinder is a joy at both ends" (`complete.md`). Every new test was red before its change, for the reason its directive gave.

* **Built**:
  1. **Structural sharing** (`betterRecordOf`, `isRevisionPair` in thing-minder.ts): revision order only when both values pass `thingCited` and share a `labelpath`; any other pair goes to `TSQ.replaceEqualDeep(prior, record)`, TanStack's default. query-core calls `structuralSharing` from `query.ts` `setData` and from `queryObserver.ts`'s select and placeholder branches; the last two used to see a selected revtok, or another box's shell, frozen at the first value. Tests: a host observer's select follows revisions; a placeholder follows `setOptions` to another box; the default called directly (`describe("ThingMinder's structural sharing")`).
  2. **Default `queryFn`** in the key defaults `hello` sets: `({ queryKey }) => this.#fetchRecord(this.#bank.makeGetAsk(this.#scopeOfKey(queryKey)))`, `track` included. `#fetchRecord` is the one body the per-get `queryFn` uses too. Test: a plain `QueryObserver` with no `queryFn` fetches through the vaultDB, the ask equal to the bank's.
  3. **gcTime docs** (`QueryCacheOpts.gcTime`, `MinderOpts.queryCacheOpts`): "once no TanStack observer uses it". `listen`'s doc says listening keeps nothing cached.
  4. **`at` and `isWholeRecordAt` validate their scope** (`#demandOwnScope`, checker `minderScope` = `obj(thingScope.shape)` in shapes-minder.ts): user, bank and the labelpath's modelkind must match `ties`, else `bad_option`. Internal callers use `#cachedAt`. Tests: a foreign kind, userid and banklabel each refuse, on both.
  5. **`listen`'s doc** names what it tells (a record lands, a get is refused, invalidated, removed) and that ageing past `staleTime` is not told. No timer.
  6. **`isVoidSentinel`** moved beside `VoidSentinel` in shapes-thing.ts, exported from `safebyok/storage` and `src/index.ts`; the minder's local copy removed; the test's `revtokAt` uses it. Test in shapes-thing.test.ts.
  7. **A listed sparse record is never told timely**: see *Decisions*. Test: "tells a listener each listed box untimely, never timely while it is sparse".
  8. **`#isReady`'s doc** made true: "records are cached, and `tryAt`, `get` and `list` answer, only then". See *Deviations* for the return value.
  9. **`#demandOwnAsk(ask: MinderGetAsk)`**: the `unknown` gone, the runtime check and name kept.

* **Decisions made**:
  - **Item 7 keeps the invalidate beside `updatedAt: 0`.** `setQueryData(key, record, { updatedAt: 0 })` alone makes the record stale only where `staleTime` is shorter than the epoch's age; `staleTime` is a `uint` and may be `MAX_SAFE_INTEGER`, under which `get` would answer the sparse record, breaking `list`'s "the next get fetches it whole". With both, the listener hears `untimely` twice (the success, then the invalidate) and never `timely`. Whether to deliver plainly or at time 0 is decided before delivery, through the minder's own sharing function on what is cached: a record the cache already holds whole is delivered as before and stays timely (the existing test "leaves a box the cache holds whole as it is, and timely").
  - **Set aside for item 7**: `updatedAt: 0` always (makes a whole cached record stale, against `list`'s doc); skipping delivery where the cache holds it whole (changes what `list` leaves timely in the working case); `updatedAt: -Infinity` or `MIN_SAFE_INTEGER` (a hack that a JSON persister breaks on); documenting the blip (not needed once the fix was clean).
  - **`minderScope` parses the scope's fields alone** (non-strict `obj`), so an ask or a record passes as its scope, as `at`'s callers hand it.
  - **`isRevisionPair` returns `boolean`**, with casts at the one call: a type predicate narrows only one parameter.

* **Deviations**:
  - **Item 8's return is moot.** `#doDeliverRecord` returns nothing: `#doDeliverSeed` now looks the cache up before delivering, to choose between plain and time-0 delivery, so it has no second lookup to spare.
  - **`refreshedAt` of a listed sparse record is 0**, where it was the list's time. Named in the changeset.
  - **`at`'s promise gains a throw** (item 4), as directed: its doc is unchanged, "The cached record for `scoped`, however old, or undefined for none".

* **Discoveries**:
  - After `goodbye`, a host observer on a minder's key gets TanStack's "Missing queryFn": `goodbye` sets empty defaults. Named in the changeset; not changed.
  - `get` turns any `CancelledError` into "not minding" (out of scope, noted only).
  - `pnpm --filter safebyok-big build` is needed in a fresh worktree before safebyok's vitest finds `safebyok-big/internals`.

* **For the Coach**:
  - Item 7: the double `untimely` a listener hears for a listed sparse record, and `refreshedAt: 0`. Fine by me; the alternative is a staleTime cap.
