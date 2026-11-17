# Thread minder_grain: the ThingMinder goes with TanStack's grain (2026-11-17)

Branch `20261117-minder_grain`, [PR #716](https://github.com/mrflip/safebyok/pull/716), on main. Proved: safebyok lint and typecheck clean, its tests 834 passed; `pnpm justify` after the catch-up rebase (see the PR's **Tests:** line).

The nine directives agreed with the Coach for "The ThingMinder is a joy at both ends" (`complete.md`). Every new test was red before its change, for the reason its directive gave.

* **Built**:
  1. **Structural sharing** (`betterRecordOf`, `isRevisionPair` in thing-minder.ts): revision order only when both values pass `thingCited` and share a `labelpath`; any other pair goes to `TSQ.replaceEqualDeep(prior, record)`, TanStack's default. query-core calls `structuralSharing` from `query.ts` `setData` and from `queryObserver.ts`'s select and placeholder branches; the last two used to see a selected revtok, or another box's shell, frozen at the first value. Tests: a host observer's select follows revisions; a placeholder follows `setOptions` to another box; the default called directly (`describe("ThingMinder's structural sharing")`).
  2. **Default `queryFn`** in the key defaults `hello` sets: `({ queryKey }) => this.#fetchRecord(this.#bank.makeGetAsk(this.#scopeOfKey(queryKey)))`, `track` included. `#fetchRecord` is the one body the per-get `queryFn` uses too. Test: a plain `QueryObserver` with no `queryFn` fetches through the vaultDB, the ask equal to the bank's.
  3. **gcTime docs** (`QueryCacheOpts.gcTime`, `MinderOpts.queryCacheOpts`): "once no TanStack observer uses it". `listen`'s doc says listening keeps nothing cached.
  4. **`at` and `isWholeRecordAt` validate their scope** (`#demandOwnScope`, checker `minderScope` = `obj(thingScope.shape)` in shapes-minder.ts): user, bank and the labelpath's modelkind must match `ties`, else `bad_option`. Internal callers use `#cachedAt`. Tests: a foreign kind, userid and banklabel each refuse, on both.
  5. **`listen`'s doc** names what it tells (a record lands, a get is refused, invalidated, removed) and that ageing past `staleTime` is not told. No timer.
  6. **`isVoidSentinel`** moved beside `VoidSentinel` in shapes-thing.ts, exported from `safebyok/storage` and `src/index.ts`; the minder's local copy removed; the test's `revtokAt` uses it. Test in shapes-thing.test.ts.
  7. **A listed sparse record ends untimely and sparse** (deliver, then invalidate, as main did): see *Review rework*. Test: "leaves a listener's last word on a listed box untimely, its record sparse".
  8. **`#isReady`'s doc** made true: "records are cached, and `tryAt`, `get` and `list` answer, only then". See *Deviations* for the return value.
  9. **`#demandOwnAsk(ask: MinderGetAsk)`**: the `unknown` gone, the runtime check and name kept.

* **Review rework** (the reviewer's three commits, kept: `#fetchRecord` refuses after `goodbye`; the revision pair compares `userid` and `banklabel`; the changeset's `queryFn` line; then the Coach's rulings):
  - **Item 7 reverted to main's deliver-then-invalidate.** `#doDeliverSeed` delivers the record, then invalidates it with `refetchType: 'none'` unless `#isWholeRecord(#cachedAt(record))`. The first version (`updatedAt: 0` plus a prediction by `#betterRecordOf`, so no listener hears `timely`) was set aside by the Coach as more machinery than the case earns. `#doDeliverRecord` lost its `opts`. Its overclaims are gone (the comment, the changeset line, the test title).
  - **The blip is documented, not fixed**: a listed sparse record lands timely and is invalidated before `list` returns, so a listener may hear `timely`, then `untimely`. `listen`'s doc says so in one line; `notes/wontfix.md` has a row (ruled by the Coach, 2026-11-17). `refreshedAt` of a listed sparse record is the list's time again, as on main.
  - **A decorated `select`** (`(gate) => ({ ...gate, isUnlocked })`) freezes on a tie under the revision pair: not fixed, by ruling (the customer does not reach the minder, and a solution lies elsewhere). `isRevisionPair`'s doc claims no more than its check does.

* **Decisions made**:
  - **`minderScope` parses the scope's fields alone** (non-strict `obj`), so an ask or a record passes as its scope, as `at`'s callers hand it.
  - **`isRevisionPair` returns `boolean`**, with casts at the one call: a type predicate narrows only one parameter.
  - **Set aside for item 7, with the reasons the Coach heard**: `updatedAt: 0` always (makes a whole cached record stale); skipping delivery where the cache holds it whole (changes what `list` leaves timely); `updatedAt: -Infinity` (a JSON persister breaks on it); a `staleTime` cap.

* **Deviations**:
  - **`at`'s promise gains a throw** (item 4), as directed: its doc is unchanged, "The cached record for `scoped`, however old, or undefined for none".

* **Discoveries**:
  - After `goodbye`, a host observer on a minder's key gets TanStack's "Missing queryFn": `goodbye` sets empty defaults. Named in the changeset; not changed.
  - `get` turns any `CancelledError` into "not minding" (out of scope, noted only).
  - `pnpm --filter safebyok-big build` is needed in a fresh worktree before safebyok's vitest finds `safebyok-big/internals`.

* **For the Coach**: nothing open.
