# Thread 5: minder_invalidate (2026-11-19)

Branch `20261119-minder_invalidate`, PR #TBD, stacked on #758. Proved: see the PR body.

* **Built**
  * **Test split** (`tests/minding/thing-minder/`, a pure `tests:` commit, 181 tests before and after, redone after the rebase onto #758's reviewed tip so it carries the reviewed titles): `world.ts` (every helper and test vaultDB the sections share, exported) and `thing-minder-{lifecycle,cache,reads,listen,writes,listing-orders,staleness,keys}.test.ts`. `listingAfter` stays in `listing-orders`, its one user.
  * **`ThingMinder.invalidate(labelpath: Labelpath | undefined, opts: MinderInvalidateOpts): void`** (section `Invalidating`). One `invalidateQueries` call, `refetchType: 'none'`, key prefix the labelpath's key head (which selects its own listing and every key under it) or the bank's, and a predicate that keeps keys ending `'kids'`: listings only. New private `#bankKeyHead`, which `#keyHeadOf` now builds on.
  * `MinderChecks.minderInvalidateOpts` (`obj({ list: lit('all') }).strict()`), `MinderInvalidateOpts` type, exported from `index.ts`.
  * `isUsefulTSQEvent` passes the `invalidate` action; `#minderEventOf` turns it, for a listing key, into `{ carkind: 'invalidation', modelkind, labelpath, card: 'list', tag: 'kids' }`.
  * `InvalidationEvent`: `tags: 'all'` became `tag: ListingEvent['tag']`.
  * One invariant added to `ThingMinder`'s class doc: invalidate asks the vaultDB nothing and changes no car and no listing's labelpaths.
  * Tests: `thing-minder-invalidate.test.ts`, 14 cases: asks the vaultDB nothing, tells each listing under a labelpath (own included); one listing alone; no labelpath tells all; no listing cached tells nothing; cars and listing arrays untouched (same objects); told only the first time; a later `list` replaces the listing, tells a listing event, and invalidating again tells again; removal tells a listing event with `labelpaths: undefined`, never an invalidation; six bad-argument rows.

* **Decisions made**
  * **The first argument is `Labelpath | undefined`, not optional**, as TypeScript allows no required parameter after an optional one: a caller says `invalidate(undefined, { list: 'all' })` for every listing. An overload `invalidate(opts)` would read better; say if wanted.
  * **One TanStack call, not `subtreeQueryKey` plus the own listing's key**: the labelpath's key head is a prefix of both, and the predicate drops cars. `subtreeQueryKey` is not used.
  * **No `#demandReady`**: like `at`, it asks nothing; before `hello` the cache is empty, so it does nothing.

* **Discoveries**
  * **A listing that is invalidated and then joined by a record (`#joinParentListing`, a `setQueryData`) loses its invalid mark**, as any `setQueryData` clears `isInvalidated`, though no `list` has run. Nothing in the minder reads the mark, and the next invalidate tells afresh, so a bridge that invalidates on each write loses nothing. Not tested; the Coach may want a join to keep the mark.
  * The cache tells `invalidate` events synchronously inside the call (listeners are called inside `notifyManager.batch`, not scheduled).
  * `eslint` refuses `query` and shorthand `queryKey` as names (STYLE.md *Naming*): `tsqQuery`, `queryKey: keyHead`.
