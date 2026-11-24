# Thread 16: react_switch (2026-11-24)

Branch `20261124-react_switch`, PR [#882](https://github.com/mrflip/safebyok/pull/882), cut from #880's `7048b9133` (thread 14, `core_switch`), base `main`; sibling #881 (thread 15, `review_notes`) stands on #880 too. Proved:
`safebyok` 7 failed (the seven `vault-minder` tests named in the handoff: listen 4, writes 2, staleness 1), 2161
passed; lint and typecheck clean in `safebyok`, `safebyok-react-lean`, `safebyok-idb-lean` and the three demos; by
hand, `safebyok-react-lean` 320, `safebyok-idb-lean` 115, `safebyok-postgres` 356, `demo-dojo` 111, `demo-envman` 24,
`demo-knockknock` 26, all passed. The React half of design "T3" (`redistribution-design.md`, sections 7, 9-12; it
has no section 13).

* **Built** (nothing in `safebyok-react-lean` or the demos reads `device.minder` or `device.bankMinder` now):
  * **`useBox`, `boxQuery`, `useQueryOptions`** (`boxQueryBaseOf`): until the bank is up, the static key and
    `skipToken`; then `vaultTSQ.itemQueryOptions(scope)`'s key, and its `initialData`/`initialDataUpdatedAt` where the
    Thing holds a seed. The queryFn, `staleTime` (`agekind === 'here' ? Infinity : 0`), `networkMode` and `retry` are
    the VaultTSQ's defaults under the bank's key. `recordQueryDefaults`, `newerOrSharedOf`, `isBehindAt` are gone.
    The hook passes `structuralSharing: frozenOrSharedOf` (`giver-defaults.ts`): a frozen value or a primitive as it
    is, anything else `replaceEqualDeep`. See *Decisions*.
  * **`useBoxList`, `keys.*`**: `VaultTSQ.listQueryKeyOf`/`itemQueryKeyOf`, the same key shapes. The listing's
    queryFn and `staleTime` are the VaultTSQ's; the hook adds `gcTime: Infinity`. `select` shows only `kids.items`,
    the live children.
  * **`useGate`**: snapshot `gateShownOf(device.world.gate?.pickle() ?? shell)`, cached in a WeakMap by the pickle's
    identity, so the same object until the gate's record changes. Subscribe: `world.sortedVaultDB.listen` filtered to
    events at `Labelpath.MainGate`, keyed on `[isFetchable, device]` (the SortedVaultDB exists once the stage is
    fetchable). Not the gate Thing's `subscribe`: a Gate tells its subscribers of world changes and its own writes,
    never of a record received from another device.
  * **`withLockableWhisper`**: `device.world.isUnlocked`; unlocked, `vault.withUnlockedWhisper`; locked,
    `device.vaultTSQ.getOnce(scope)` then `liveOf`.
  * **`useDraft`'s citation** over a null base: `Shell.of(scope, rootBox)` (see *Deviations*).
  * **`putBoxMutationOptions`**: `mutationKey` plus `VaultTSQ.mutationOptionsOf(mutationFn)`; the
    `#no-slop-crossings` marker on `retry: false` is kept beside it.
  * **Provider and `queryClient()`**: `device.vaultTsqClient`, which is now the device's one client (the host's
    `opts.queryClient` or the device's own). `device.tsqClient` is gone.
  * **Core**: `src/minding/masked-rows.ts` (`maskedRowsOf`, with the mask helpers and their security comment, moved
    from `minder.ts`); `VaultTSQ.maskedRows()`; `Minder.maskedRows` calls `maskedRowsOf`. `device.maskedView()`'s
    `vaultTSQ` rows are the VaultTSQ's (`[]` until it is made); `bankTSQ` stays the BankMinder's.
  * **Docs**: `docs/guide-suspense.md` (a record suspends again across a newer life), `docs/guide-react_query.md`
    (`useBoxList` lists live boxes).
* **Decisions made**:
  * **`frozenOrSharedOf`, not `structuralSharing: false`, on the hook.** The VaultTSQ's item default is `false`. A
    host option reaches the query's own options (`QueryObserver.setOptions` calls `query.setOptions`), and TanStack
    applies one `structuralSharing` both to the item and to a `select`'s result. With `false`, a `select` returning a
    new object gives a new `data` every run, where today's hook gave the same object until the content changed. The
    function keeps the item as the Thing's frozen record (frozen, so as is, and so is null) and shares the rest.
  * **`gcTime: Infinity` on `useBoxList` only.** The old minder set `gcTime: Infinity` on everything. Items now take
    TanStack's 5 minutes: a collected item is seeded again from its Thing by `initialData` on the next mount, so the
    hook answers as before with no get. A listing has nothing to seed it ("a listing ... kept in the tree and nowhere
    else"), and collecting it would break the doc promise "never on a remount". `staleTime: Infinity` left the hook:
    the VaultTSQ's listing default has it.
  * The useBox doc says a newer life shows pending "while it fetches the box again"; the useBoxList doc says it lists
    again "once a box is born or deleted, on this device or as it hears of one elsewhere".
* **Deviations**:
  * **`useDraft`'s null-base citation cites the shell, not the Thing's `citable` or held record.** The put runs inside
    `withWhisper`, which refuses `absent_box` unless the box is stored live. So a null base reaches `citedOf` only
    where a box was written since the draft pinned null; the draft's contract then says "`put` then refuses
    `stale_write`". The Thing's `citable` and its held record are that live revision, and citing either would let the
    put overwrite it. The shell cites nothing stored, so the put refuses. The old code cited the old minder's dead
    record, else the shell. Test "over a deleted box, once edited is behind the box another device puts again, its put
    refusing stale_write" passes unchanged.
  * **Core test deleted**: `device.test.ts` "makes its QueryClient with it, empty, its VaultMinder's, the same before
    and after signin". Its promise was that `vaultTsqClient` is the old minder's client; the rest of it is the test
    beside it, now on `vaultTsqClient`.
* **Test promises changed** (before, then after):
  * `react-giver` "keeps a deleted box listed" (the list array unchanged after `delBoxOnce`), then "drops a deleted box
    once it lists again" (waits for `[]`). The Coach's ruling on `useBoxList`.
  * `react-giver` "never replaces a record with an older one" (a host's `setQueryData` of an older record was refused
    by the hook's structural sharing), then "never replaces a record with an older one a get answers" (the vaultDB
    answers the older revision to `client.query(boxQuery, staleTime 0)`; the item stays the newer, one get). The
    handoff removes `newerOrSharedOf`, whose only job that was. A host's own `setQueryData` is no longer policed; the
    docs already say "set or remove nothing".
  * `react-giver` "takes only the options that shape what it shows, leaving the minder's own query as the giver sets
    it": `[gcTime, retry, structuralSharing === false]` was `[Infinity, false, false]`, now `[gcTime === 0, retry,
    structuralSharing === false]` is `[false, false, false]` (the host's are still ignored; the giver sets no gcTime).
  * `record-hooks` "observes a query that has the minder's defaults once the minder minds" (`[queryFn, Infinity,
    false]`), then "... the vault TSQ's defaults once the bank is up" (`[queryFn, retry false, networkMode 'always']`).
  * `record-hooks` "shows the refusal of a get of its item, keeping the record and fetching nothing more": drove
    `stale_read` with an older answer in the same life, which the ruling now answers with the more recent; now drives a
    `storage_unavailable` answer through `vaultTSQ.getOnce(scope, { staleTime: 0 })`, and drops `isStale`/
    `isInvalidated`, which the refusal no longer sets.
  * `record-hooks` "lists again when the minder marks its listing stale" (`minder.invalidate`), then "lists again when
    its listing is invalidated" (`queryClient().invalidateQueries({ queryKey: keys.boxList() })`).
  * Renamed only, promise unchanged: "useBox over the vault TSQ's own items", "answers on its first render a record the
    vault TSQ already has", "useBoxList over the vault TSQ's own listing", "useGate over the world's gate Thing", "keys
    the listing/record as the bank's vault TSQ keys it", "writes over the newest revision this device has heard of".
  * The tests now drive `device.vaultTSQ.getOnce`/`listOnce`, the client's `invalidateQueries`, the vaultDB (a refusing
    `tryGetThing`, `_cheat_things`), and spy `SortedVaultDB.prototype.tryGetThing` for "no get" in the useGate test.
* **Discoveries**:
  * **A persisted start shows less while starting.** The old hooks observed the old minder's client, which the boxes
    persister restored into, so a `useBox` showed a restored record even at `'starting'`. Now the restored records
    reach the Things, not the tree, and a query the hook made at `skipToken` is never seeded by `initialData` later: the
    hook shows pending, then fetches once the bank is up. Not held: it needs the writer or the restore to seed the
    tree, which the handoff leaves to the LocalBridge thread ("the seed and reset behaviour ... stays as built"). No
    test covers it.
  * The masked view's `vaultTSQ` rows are now items and listings only (no soon or dead rows); the dojo's Inspect tab
    renders them unchanged.
  * `Knock.queryClient()` is now the host's own client where the giver's config passes `queryClient`.
  * Comments in the dojo still say "minder" (`elsewhere.ts`, `NewBoxTab.tsx`, `make-fixture.ts`, `InspectTab.tsx`);
    left, as only compiling and green were in scope.
* **Scaffolding** (core, unchanged in kind, comments reworded): `Device` still makes the old `VaultMinder` and
  `BankMinder` for the persisters and the sign-in restore, and the bank's `hostVault` sweep stops the old minder;
  `maskedView().bankTSQ` reads the BankMinder. The next thread (old minders deleted) and the LocalBridge remove them.
* **For the Coach**: whether `frozenOrSharedOf` and the listing's `gcTime: Infinity` belong in the VaultTSQ's
  defaults, so a host's own `useQuery(itemQueryOptions)` gets them too (recommended, next thread).
