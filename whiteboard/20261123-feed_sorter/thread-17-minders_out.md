# Thread 17: minders_out (2026-11-24)

Branch `20261124-minders_out`, PR #883, stacked on #881 (`20261124-review_notes`). Proved: `pnpm justify` green, none failed or skipped:
safebyok 1856, safebyok-react-lean 322, safebyok-idb-lean 115, safebyok-big 2950, safebyok-react 277,
safebyok-indexeddb 215, safebyok-convex 334, safebyok-postgres 356, safebyok-graphql 448, safebyok-fastkey 43,
e2e 576, demo-dojo 111, demo-react 99, demo-knockknock 26, demo-envman 24, root scripts 331.

* **Built**:
  - **Deleted**: `src/minding/minder.ts`, `vault-minder.ts`, `bank-minder.ts`, `newer-thing.ts`, `src/shapes/shapes-minder.ts`,
    and their tests: `tests/minding/bank-minder.test.ts`, `minder-persist.test.ts`, `newer-thing.test.ts`,
    `tests/minding/vault-minder/world.ts` and its nine `vault-minder-*.test.ts` files (the seven red ones among them). Kept:
    `vault-minder-chains.test.ts`, `tsq-world.ts`, `vault-tsq.test.ts`. The unused `itemRevtokOf` test helper went too.
    `Throwers.minderNotStarted`, `staleRead` and the phrases `MinderFriendExpected`, `MinderNotStarted`, `StaleRead`,
    `FeedVersionOther`, `DeliveredOfOtherScope` went with them.
  - **Moved**: `minder-keys.ts` is `src/minding/query-keys.ts` (`MinderKeyRoot` is `QueryKeyRoot`), all of it still used.
    From `shapes-minder.ts`: the masked view's shapes to `src/shapes/shapes-masked-view.ts`; `MaxTimerHours`,
    `MaxTimerMillis`, `TsqStaleTime` and the get's options (now `GetOnceOpts`, checked by `VaultTSQChecks.getOnceOpts`) to
    `src/shapes/shapes-vault-tsq.ts`; `ScopeAt` to `src/shapes/shapes-thing.ts`.
  - **Device**: no `minder`, `bankMinder`, `MinderFriend`. Scaffolding (the LocalBridge thread removes it):
    `src/minding/persist-scaffold.ts`, a `PersistScaffold` made at `signin`, one private `QueryClient` (gcTime Infinity)
    never handed to a host. A SortedVaultDB listener keeps each root's and each box's newest whole record or tombstone
    (`liveness` full or gone; the bank, main gate and boxes only, so never a lease) under a vault TSQ's item key,
    `['sok', userid, banklabel, 'item', ...labels, '!']`, so a devtool (the dojo's TSQ panel) groups the roots' rows as
    it did the old bank minder's; a key of its own (`'roots' | 'boxes'`) broke that panel's test. `persist('roots' | 'boxes', persister)` runs query-core's
    `persistQueryClientRestore` and `persistQueryClientSubscribe`, buster `${ThingFormat}/scaffold`, maxAge Infinity,
    restored deep-frozen, each persister saving only its own records (roots or boxes, by labelpath), no mutation. Its listener's `onBadNews` is noop: the
    vault TSQ tells the device. The bank's sweep ends its listen (`hostVault`), as it ended the old minder.
    `maskedView().bankTSQ` is `scaffold.maskedRootRows()`.
  - **Sign-in order**: restore roots, restore boxes, make the SortedVaultDB, make the VaultTSQ, receive the restored
    records (roots first; the banktok from a restored live bank record), start the scaffold's listen, `world.signin`.
  - **Defaults in the VaultTSQ**: an item's `structuralSharing` is `frozenOrSharedOf` (a frozen value or primitive passes,
    else `replaceEqualDeep`), a listing's `gcTime` is Infinity. `safebyok-react-lean`'s hooks set neither, and
    `giver-defaults.ts` no longer has `frozenOrSharedOf` (it was never exported from the package).
  - **Front door**: removed `Minder`, `VaultMinder`, `BankMinder`, `newerThingOf`, `DeadAt`, `Labelpathed`, the
    `MinderEvent` family (`MinderEvent`, `MinderEventkind`, `MinderEventOf`, `MinderEventFormat`, `MinderActionOf`,
    `MinderActionTyped`, `TSQQueryAction`, `ThingEvent`, `SoonEvent`, `DeadEvent`, `ListingEvent`, `RecordEventFields`),
    `MinderChecks`, `MinderOpts`, `MinderFriend`, `MinderGetOpts`, `MinderTryAtOpts`, `MinderInvalidateOpts`,
    `DefaultQueryCacheOpts`, `FixedQueryCacheOpts`, `DeliverableThing`, `GotAnswer`, `TSQGotAnswer`, `TSQAnswer`, `ThingAt`,
    and from `safebyok/core` `QueryCacheOpts`. Added: `GetOnceOpts` (in place of `MinderGetOpts`). Kept, moved:
    `ScopeAt`, `TsqStaleTime`, `MaxTimerHours`, `MaxTimerMillis`, the masked view's shapes.
  - Tests: a device test that `onBadNews` hears a damaged child once (it was three times with the two minders
    listening); a device test that a snapshot under the old buster reads as empty; two `useBox` tests of a reloaded page
    in `record-hooks.test.tsx` (`buildProviderWorld` takes `persisters`); a VaultTSQ test of an item's sharing.
* **Decisions made**:
  - The scaffold is a small class of its own rather than lines in `device.ts`: the device keeps its sign-in readable, and
    the LocalBridge thread deletes one file.
  - It persists records, not listings: a listing lives in the tree alone (the Coach's ruling in the design, section 12).
  - Restored roots are received one by one, like the boxes, each damaged one told as news; the old code took the roots
    only when all three were cached.
  - `MinderGetOpts` renamed `GetOnceOpts`: it is the VaultTSQ's and the vault's parameter, and its old checker,
    `MinderChecks`, leaves the front door by ruling.
  - Two refusal messages rewritten because they named deleted classes: `NotMinded` ("A vault TSQ keeps an item only for
    a box under the root box: ...") and `WorldNotHeard` (`Bank.rootBox`'s). Kinds unchanged.
* **Deviations**:
  - Item 3's cause was not the order. Query-core 5.107's `Query.setOptions` applies `initialData` to a query that has no
    data, so at the base a `useBox` mounted at `'starting'` did show the restored record once the stage reached `'locked'`
    from the restored roots, before the vaultDB answered (thread 16's discovery said otherwise; it was a reading, never a
    test). What the old minders showed and the base did not: a restored box while the stage is still `'starting'`, which
    happens where no roots were kept (or they fail to restore). The order fix is built as asked and closes that; the second
    reload test fails at the base order and passes now. The first passes either way, and stays as the one test of a
    cached start through the hooks.
  - Wontfix rows deleted outright, their case gone: "A minder's answer that crosses a `goodbye` and a fresh `hello`" and
    "A sparse record from a newer life leaves the old life's record in the item" (now: reset, no data, by ruling).
  - VOCABULARY rows deleted: dead record, minded, givable.
* **Discoveries**:
  - A restored box record is fresh in the tree (its Thing is `here`, so `staleTime` Infinity) and is never got again
    until a notice tells of a change: as at the base for a hook mounted after the bank is up, but the old minders' 1-hour
    `staleTime` re-got it in the background. Open matter.
  - Each mounted `useGate` listens to the SortedVaultDB with `onBadNews` to the device (`listenToGate` in
    `react-giver.tsx`), so with a gate hook mounted, trouble reaches the device once more per hook.
  - `TODO.md` still has a dozen entries naming the minder's API (`at`, `soonAt`, `listingAt`, the bridge); not in scope.
  - The roots persister saves at every change to a box too (one client, two subscriptions), with the same snapshot.
* **For the Coach**: the open matters in the PR body; the VOCABULARY and wontfix lines old and new are in the report.
