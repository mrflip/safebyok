# soon_item: the minder caches records, not cars

Stacked on #784 (`20261120-logical_gating`). Agreed with the Coach in chat, 2026-11-20.

The ThingMinder stops caching a `ThingCar` ({ newest, fullest }) per Thing. Each Thing gets up to two
cache entries instead: an **item**, the whole record (live, tombstone or shell) a host shows, and a
**soon**, a sparse record newer than the item, kept only while the item is behind it. A host sees
the item and an `invalidate` event when the item falls behind; it never sees a soon.

Nothing here is a compatibility shim: `safebyok` is private at 0.0.0, and the giver is on no entry
of `safebyok-react`.

## Query keys

The kind of entry comes right after the bank head; the mark at the end stays (the root box's key,
without its mark, would start every box's key).

| method (instance)  | key                                                       | was                    |
|--------------------|-----------------------------------------------------------|------------------------|
| `itemQueryKey`     | `[...bankhead, 'item', 'box', '/', '<label>', '!']`       | `queryKey`             |
| `soonQueryKey`     | `[...bankhead, 'soon', 'box', '/', '<label>', '~']`       | new                    |
| `listQueryKey`     | `[...bankhead, 'list', 'box', '/', '<label>', '#', 'kids']` | `listingQueryKey`    |

* `descendantsQueryKey` is dropped: with the kind first, no one prefix covers a Thing's descendants
  of every kind, and nothing but its own test uses it. It comes back per kind when nested boxes
  need it. Say so in the changeset.
* `ThingMinder.queryKeyOf` (static, host-facing) is renamed `itemQueryKeyOf`: it means what
  `itemQueryKey` means. `bankQueryKeyOf` is unchanged.
* `isThingEvent` tests the kind segment for `'item'`. `#scopeOfQueryKey` reads the labels between
  the kind segment and the mark.
* Defaults are set **once by prefix** in `#makeTSQ`, generic before specific:
  `[...bankhead, 'list']` takes `queryFn: skipToken`, `stableListingOf`, the minder's staleTime;
  `[...bankhead, 'soon']` takes `queryFn: skipToken` and `newerRecordOf`. The item takes the client
  defaults: the queryFn, `newerRecordOf`, the minder's staleTime as a plain number.
  `#setListingDefaults` goes.
* `invalidate(labelpath)` uses the prefix `[...bankhead, 'list', ...labels]` (or `[...bankhead, 'list']`
  for every listing), which covers a Thing's own listing and every listing under it: the `'kids'`
  predicate goes.

## Landing

One merge for both entries, replacing `bestCarOf`: **`newerRecordOf(prior, next)`** keeps the newer
record by `Thing.cmp` (lifepath, then revseq), `prior` on a tie. It is exported, and the giver
uses it too.

`#sendToTSQ(record)` (notices, list answers, write answers):

1. A whole record, tombstone or shell goes to the item.
2. A sparse record goes to the soon, unless it is no newer than the item or the soon: then it is
   dropped, not written (no event, no query made and removed).
3. `#addToParentListing(record)` (was `#joinParentListing`), then `#markBehinds(scope)`.

`#markBehinds(scope)` (was `#settle`): where both an item and a soon are cached, remove the soon if
the item is **no older** (`Thing.cmp(item, soon) <= 0`), else invalidate the item (`exact`,
`refetchType: 'none'`: the minder fetches nothing here). TanStack emits nothing for invalidating
an invalidated query.

Gets: `#makeTSQ` builds the `QueryCache` with `onSuccess`, which calls `#addToParentListing` and
`#markBehinds`. TanStack calls it synchronously right after `setData` on a fetch (never for
`setQueryData`). Cache listeners are called synchronously too, inside `setData`'s batch (only
observer notifications go through the `setTimeout(0)` scheduler), so a listener hears the fetch's
`success`, invalidated flag cleared, before `onSuccess` marks the item behind again and it hears
`invalidate`. That arises only where a sparse record lands while a get waits: a wontfix row.

* `#fetchCar` becomes `#fetchRecord`: it answers the record (or the shell), and its `stale_read`
  prior is `soon ?? item`, read before asking.
* `#doGet` is two lines: run the query, then answer the cached item `?? fetched` (TanStack resolves
  with what the queryFn returned, not what sharing kept).

## Reading

* `get`, `tryGet` and `at` answer the item's record, not a car.
* `gotAnswerOf` reads the item; a soon still counts as it does today: no item and a soon cached
  answers `untimely`; neither answers `vacant`. A timely item answers `gotlive`, `gotgone` or
  `gotvoid` by its record; an item that is invalidated or stale by time answers `untimely`.
* `isTimelyQuery` and `isStaleAt` rely on TanStack's own staleness (`isStaleByTime` counts an
  invalidated query stale), and on **behind as a comparison**: an item is behind when a cached soon
  is newer than it by `Thing.cmp`, or a soon is cached with no item. `staleTimeFnOf` and `dbHasNewer`
  go. A staleTime is milliseconds or `Infinity`: `'static'` is refused (the Coach, 2026-11-20).
* `#minderEventOf` tells everything: an item's `success`, `error` and `invalidate`, a listing's events
  as now, and a soon's `success` and `removed`, as a `SoonEvent` (`isSoonEvent`). A soon's removal
  is routine, the item having caught up. The listener filters: the bridge copies an item's
  `success`, forwards its `invalidate`, and its `error` with `refetchType: 'none'`, and ignores
  soons (the Coach, 2026-11-20). The event's `agerank` goes; its revision fields come from the
  record. The comment "A car's invalidation can't arise" is rewritten.
* `soonAt(scoped)`: the cached soon record, or undefined for none; like `at`, it never asks the
  vaultDB. The revision a write cites is `soonAt(scope) ?? at(scope)`.

## Types, exports, notes

* `thing-car.ts` goes: `ThingCar`, `carOf`, `bestCarOf`, `dbHasNewer`, `agerankOf`, the car checks.
  `newerRecordOf` lives where the worker judges best and is exported from `index.ts`.
* `CarAt`, `BankCar`, `BoxCar`, `GateCar`, `CarFreshness` and the like go away, not renamed: callers
  use the existing record types (`ThingAt` and its kin). `phrases.ts` loses the car phrases. The
  `staleTime` doc's "A `bhnd` or `bare` car is never timely" is rewritten.
* `models/vault.ts` answers as today, reading `soon ?? item` where it read `car.newest`:
  `withWhisper` gets the item, then takes `soonAt(scope) ?? item` (a sparse record that landed during
  the get still makes the unseal refuse); `#newestAt` is `soonAt ?? at ?? await get`, the revision a
  put or del cites.
* The class doc's invariants are rewritten for items and soons.
* `gcTime`: already fixed at `Infinity` in `FixedQueryCacheOpts` at #784; nothing to do.
* VOCABULARY.md: the *car* row goes; *listing*'s "Like a car" is reworded; rows for **item** and
  **soon**. Docs say "whole record" for what an item holds (`item` is the key level).
* `notes/wontfix.md`: with a soon from a newer life, the old life's whole record stays in the item,
  marked invalidated, until the refetch.
* `TODO.md`: with a soon from a newer life, remove the old life's item if possible. (Removing it
  empties `at()`; the host keeps showing it, since the bridge ignores `removed`.)

## Giver

* `giverBankOfMinder` passes the item's `invalidate` event on.
* `deliverEvent`: on `invalidate`, `client.invalidateQueries({ queryKey, exact: true })`; on success,
  `setQueryData(queryKey, record, { updatedAt })`. No `dbHasNewer`.
* `react-giver.ts`, `shapes-giver.ts` move from cars to records: `CarFields`, `carStaleTimeOf`,
  `fullestOf` and the default `select` go. The host's staleTime is `Infinity` (the bridge keeps it
  current and forwards invalidation). `newerCarOf` becomes a wrapper: two records of one labelpath
  go to `newerRecordOf`, anything else to `replaceEqualDeep` (its comment names the race it keeps
  out: a host fetch that read an older record resolving after the bridge copied a newer one).
