# Thread 10: minder_house (2026-11-22)

Branch `20261122-minder_house`, PR #827, stacked on #821. Proved: `pnpm --filter safebyok lint typecheck test` green (1401 tests, 30 files); safebyok-react-lean lint, typecheck and 271 tests green; `pnpm justify` at the tip after the catch-up (see the PR's **Tests:** line).

So the TanStack cache is the only home of the minder's records: a fetch handles only its return value, other records land at the feed first, and one function settles the consequences.

* **Built**:
  * **Our subtree** (`thing-minder.ts`, `#makeTSQ`). No client-wide defaults: `setQueryDefaults` per entry kind under `[...bankKeyHeadOf(scope), kind]` (item: `#fetchRecord`; soon: `skipToken`; listing: `#fetchListing`), each over `FixedQueryCacheOpts` and the minder's `staleTime`. The cache-level `onSuccess` stays, and acts only on this bank's item keys (`#landedByFetch`, by `partialMatchKey`). `goodbye` is `removeQueries({ queryKey: bankHead })`, not `clear()`.
  * **Pins** (`shapes-minder.ts`, `FixedQueryCacheOpts`), each with its `//` reason: `networkMode: 'always'`, `retry: false`, `gcTime: Infinity` (as before), and new `queryKeyHashFn: hashKey`, `persister` (a pass-through to the queryFn), `initialData: () => undefined`, `select: identity`. Observer-only options (`refetchInterval`, `refetchOn*`, `enabled`, `retryOnMount`) are left out, as are `behavior` (internal), `maxPages` (infinite only), `retryDelay` (moot under `retry: false`), `queryHash` (a constant would merge every query), `initialDataUpdatedAt` (read only with `initialData`).
  * **A listing is a real query.** `#fetchListing` asks `tryListThings`, throws the refusal's `err`, tells `damaged_rows` to `tellBadNews`, and returns frozen labelpaths only. Its `structuralSharing` is `landedListingOf`: the labelpaths the listing had joined with those answered (`listingOf`), structurally shared. `list` is `tsq.query({ queryKey, staleTime: 0 })`, so it always asks and shares a list under way; `tryList` is `outcomeOf(list)`, answering `Outcome<Labelpath[]>`.
  * **The feed** (`adapter-vault-db.ts`). `tryListThings` calls `notifyListed`: each Thing of a good answer is queued, sparse and in labelpath order, to every watch of the bank, after the tracked records, before the list resumes. The feed gained `notify(val)`, unchecked, beside `tell(raw)`. `ThingNotice.val` widens to `ThingRecord | Sparse<ThingRecord>`; the watch notes in `vault-db.ts` say so.
  * **One settler.** `#settleLanded(record)`: `#markBehinds`, then `#addToParentListing` (the item's `invalidate` must follow the soon's `success` at once). Called by `#landedByFetch` and at the tail of `#sendToTSQ`. Gone: `#landedByGet`, `#sendListingToTSQ`, `stableListingOf`.
  * **Tests**: a list's notices in `adapter-vault-db.test.ts` and the watch battery; a refused list's `error` event in `thing-minder-listen.test.ts`; `tryList`'s good outcome in `thing-minder-reads.test.ts`.
* **Decisions made**:
  * **`refetchType: 'none'` stays** on `invalidate`. Without it TanStack refetches each listing an observer keeps active, and the header says `invalidate` asks the vaultDB nothing.
  * **`list` asks every time through a per-call `staleTime: 0`.** Set aside: `getQueryCache().build(...).fetch()`, which bypasses `query()`'s staleness check but reaches into TanStack's lower layer; and `fetchQuery`, which is `query()` under another name. The per-call option persists on the listing query's options until the next call, so it touches "nothing about staleTime changes"; flagged in Open questions.
  * **`isWatching: false` in the react-lean provider world** now stubs only the store's own watch (`UnwatchedVaultDB` overrides `doWatch`), not `watch` whole. A list's Things now arrive through the adapter's feed, which a device keeps even with no store watch; stubbing `watch` whole had stood for a device that cannot hear its own lists. The four bridge tests are unchanged.
* **Changed expectations** (each now what a listener observes):
  * A listing's first list tells `added`, `fetch`, then a `success` per newly listed Thing joining it, then the list's own `success` (was one `success`).
  * A listed box's soon lands, then the listing joins it, then the item falls behind, then the list lands (was the listing first, then the soons).
  * A list waiting at `goodbye` rejects with TanStack's `CancelledError` (`tryList`: `unexpected_error`); the listing is not set. A crossing, written in `notes/wontfix.md`'s goodbye/hello row.
  * A refused list tells `error`, the listing left as it was, `state.isInvalidated` true (new; TanStack's error reducer).
* **Deviations**: `ThingNotice` is part of the `VaultDB` contract: its `val` may now be sparse. A host's own watch handler sees it. It is the directed consequence of notifying listed Things at the feed.
* **Discoveries**:
  * `setQueryData` dispatches `success` even with the data unchanged, so a listing joined by each listed Thing, then landed, tells several successes.
  * `removeQueries` cancels a query's fetch: a pending `query()` rejects, not resolves.
* **For the Coach**:
  * **Invariant wording.** "An operation caches only its own good answer: the record got, written or listed ... Any other record an answer carries (a refusal's `dbhas`, or a tracked ...) is cached only as the watch tells of it" still holds, but "listed" now means labelpaths, and the listed Things are such "other records". Proposed: "the record got or written, or the labelpaths listed ... (a refusal's `dbhas`, each Thing a list answers, or a tracked ...)". Not reworded.
  * **Left alone, thought wrong**: `listen` subscribes to the whole cache, not this bank's subtree (harmless while the minder owns its client); `notes/deliver-contract.md` names `tryList` (it is big's).
