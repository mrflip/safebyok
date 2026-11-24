# Thread 12: vault_tsq (2026-11-24)

Branch `20261124-vault_tsq`, PR #878, stacked on #877 (base `main`). "T2" in `redistribution-design.md`.
Proved: see the PR's **Tests:** line. Red by the seven old-`Minder` tests alone (`vault-minder-listen` 4,
`vault-minder-writes` 2, `vault-minder-staleness` 1), untouched; the chain table is green, all 185 cases.

* **Built**:
  - `src/minding/vault-tsq.ts`, `VaultTSQ`, beside the old minders, exported from `safebyok`. One per bank; works on
    the QueryClient it is handed. `make({ vaultMinder, queryClient, scope })` listens to the `SortedVaultDB` and sets
    defaults under the bank's key only: `networkMode: 'always'`, `retry: false` (queries and mutations); items add the
    queryFn, `structuralSharing: false` and `staleTime: here ? Infinity : 0`; listings the queryFn and
    `staleTime: Infinity`. Static `itemQueryKeyOf`, `listQueryKeyOf`, `bankQueryKeyOf` (the old minder's shapes, tested
    equal). `itemQueryOptions(scope)`, `getOnce(scope, { staleTime }?)`, `listOnce(labelpath)`, static
    `mutationOptionsOf(mutationFn)`, `sweep()` (ends the listener). The writer is `#hear`, the table of the handoff.
  - `tests/minding/vault-tsq.test.ts` (30), on query-core alone, `QueryObserver` where an observer's view is the subject.
  - `tests/minding/vault-minder/tsq-world.ts`: the ported table's world (the old `world.ts` stays for the seven).
  - The chain table ported (`vault-minder-chains.test.ts`): drives a `SortedVaultDB` over a `MemoryVaultDB` and a
    `VaultTSQ` on a fresh `QueryClient`; reads the box's Thing and its item; at every end with data, asserts the item
    is the Thing's own record and that an observer finds it stale exactly while the Thing is not here.
  - The generator: `gen.py` lost its `today` machinery; `cycle.sh`, `dumptail.ts.txt` and `.gitignore` (which ignored
    only `dump.json`) are deleted; `splice.py` stays. Rerun: `python3 gen.py > table.ts && python3 splice.py <test> table.ts`.
    The 77 rows' `initial`, `chain` and `wanted` come out byte for byte as they were (each row's three cells found
    verbatim in the old file; evaluated, the rows are equal as JSON, blurbs too). Rows that wrapped for their `today`
    now fit one line.
  - `notes/wontfix.md`: the old get promise rewritten to the Thing rule; a new entry for the `getOnce` the library
    cancels.
* **Decisions made**:
  - The queryFn returns `itemValOf(thing)` after `vaultMinder.getOnce`: the live record, null for a tombstone or the
    shell, and throws `Throwers.boxSoonestBare` where the Thing is bare.
  - The writer's `item` full sets the Thing's `pickle()`, not the event's `val`: a revision seen again in a later span
    keeps its object, the promise of item 10.
  - `listOnce` always asks (`staleTime: 0`), as the old minder's `list` did: under the listing's `Infinity` a second
    `listOnce` would never reach the vaultDB, and the chain table's soon-by-fetch route depends on it.
  - `getOnce` and `listOnce` refuse a scope with no item or listing (`notMinded`, a new `ListOfBoxes` phrase): only
    boxes under the root box get items, only boxes listings.
  - `getOnce`'s opts reuse `MinderChecks.minderGetOpts` and `MinderGetOpts` (`shapes-minder.ts`); T4 must keep or move them.
  - `onBadNews: noop`: bad news reaches every listener of the SortedVaultDB, and the VaultTSQ holds no friend to tell.
  - `itemQueryOptions` leaves `initialData` and `initialDataUpdatedAt` out, rather than undefined, where there is no
    seed: `exactOptionalPropertyTypes` hosts can pass it to `useQuery` as it is.
  - Calls use `queryClient.query()`: `fetchQuery` is deprecated in 5.107.1 (lint refuses it); same staleness check.
  - The QueryClient is checked by duck type (the six members it calls), not `instanceof`: a host's query-core copy may differ.
* **Deviations**:
  - The keys are `itemQueryKeyOf`/`listQueryKeyOf`/`bankQueryKeyOf`, not `itemKeyOf`/`listKeyOf`/`bankKeyOf`: `bankKey`
    is VOCABULARY's cryptographic key, and the lint refuses `bankKey` as a name; these are the old minder's names.
  - Item `staleTime` is `agekind === 'here' ? Infinity : 0`, where the handoff said `cold ? 0 : Infinity`. They differ
    only for a bare Thing whose item has data, which arises from one library behaviour (Discoveries): there, stale
    is right, and it is what the chain table asserts (`isStale === (agekind !== 'here')`).
  - The chain table asserts staleness through an observer (`isObservedStale`, an unsubscribed `QueryObserver`), not
    `query.isStale()`: with no observer, `Query.isStale()` is `data === undefined || isInvalidated` and ignores
    `staleTime` (query-core `src/query.ts`), so a cold item a get answered reads fresh there.
  - `ReceivingThing` now picks `read_at` too, for the seed's time.
  - `labelsOf` is exported from `minder-keys.ts`; `minder.ts` keeps its private copy, untouched by instruction, until T4.
* **Discoveries**:
  - **`resetQueries` restores the seed.** `Query.reset()` sets the state the query was built with, `initialData`
    included (`getDefaultState`, computed once in the constructor). An item built by a host's query from
    `itemQueryOptions` while live, then reset by `aged` bare, shows that old record again (with its old time) until
    the reset's refetch answers, or, unobserved, until the next mount. The `here ? Infinity : 0` staleTime makes
    that mount fetch. Not tested: the tests reset items built without a seed.
  - A Thing's first record is a parsed copy (`PlainThing.make` parses before `super`), not the answer's object: the
    item is the Thing's object, deep-equal to what `putOnce` resolved but not the same.
  - The chain table went green at first run; three mutations of the writer (no reset, staleTime 0, the event's `val`)
    each fail 52 to 66 of its cases.
* **For the Coach**: see the PR's *Open questions*.

Library behaviours relied on, each read in query-core 5.107.1's `src/`:
`queryClient.ts` (`getQueryDefaults` merges every prefix match in order, a query's options over them; `setQueryData`
skips undefined, sets `updatedAt`; `invalidateQueries` refetches active queries only, `cancelRefetch` passed through;
`resetQueries` resets then refetches active ones; `query()` fetches only when stale by the resolved staleTime);
`query.ts` (`setData` with `structuralSharing: false` keeps the object; a manual success leaves a running fetch alone;
a success clears `isInvalidated`, an error sets it; `reset` cancels silently and restores the built state;
`isStale()` without observers; a silently cancelled fetch answers the new fetch where one started, else rejects
`CancelledError`); `queryObserver.ts` (an unsubscribed observer fetches nothing); `utils.ts` (`replaceData`).
