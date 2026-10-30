# Thread 3: The listing's pipeline (2026-10-30)

Branch `20261030-listing_pipeline`, PR #371 (see the PR for the number if this one moved), stacked on #370. Justify: green (core 3902 tests pass, 37 skipped as before, 93 more than thread 1; root scripts 289; size budgets unmoved).

* **Built**
  * `Listing.settle(thing?)` saves `thing.cacheable` to the device cache and then remakes the listing's snapshot, in a `finally`: the snapshot is made even when the cache refuses the save. `#receiveInto` (so `fetch`, `put`, `del`, notices and `build(record)`) and `build(dna)` pass the thing; `hello` passes none.
  * `ifAbsent: 'fail' | 'nil'` on `fetch` / `tryFetch` (`MSX.ifAbsent`, `MSX.fetchOpts` = `timelyOpts` plus `ifAbsent`; types `IfAbsent`, `FetchOpts`). Default 'fail'. Judged in `#deliver`, after the thing has received and settled: nothing stored, or a tombstone ('x' or 'd'), is absent; 'fail' throws `absentRefusal(scope)`, 'nil' resolves null. `put`, `del` and notices pass none and get the thing back, tombstone or not. The `Storable` trigger launch is `tryFetch({ ifAbsent: 'nil' })`.
  * The listing snapshot is `readonly SnapshotT[]`: each present thing's own `getSnapshot()`, frozen, the same array until some thing's snapshot changes (compared by element identity). `#hold` primes each thing's snapshot and subscribes, so a change in one thing remakes the list and tells the listing's subscribers. A draft shows its draft; the Bob test (a thing edited in place, the others' elements unchanged) is in `box-listing.test.ts`.
  * `isWatchable` defaults true (a plain get/set on `Storable`), pulled forward from a later thread.
  * Doc tidy: the damaged-tombstone rule is said in full in `Tombstone` and by pointer in `Answer` and `Notice`; Cache docs say "loaded once at `hello`, saved after each delivery".
  * Tests: new `tests/models/listing.test.ts` (48); appended to `box-listing.test.ts` (an absent-box describe, the snapshot describe); a describe in `models-shapes.test.ts` for `ifAbsent` / `fetchOpts`. Thread 1's `build(dna)` case now says it saves to the cache and checks the save. An empty changeset (`src/models/` is not exported).

## Decisions taken
* `ifAbsent` is judged **after** delivery, so a 'fail' fetch of a tombstone still leaves the listing holding the tombstoned thing, saved and in the snapshot; only the caller sees the refusal.
* `fetch` validates its scope with `scopeOf` before any call, so a bad scope refuses before `ensureTimely`.
* The snapshot is compared by element identity, not deep equality: a thing makes a new snapshot object when it changes and the same one when it does not.
* The fake store and tests supply the extra contract fields (the Coach's direction): the adapters are a later match-up.
* Set aside: a `settle` that returns bad news to its caller (it is the design the Coach calls poorly thought out; see below); deep-comparing snapshots.

## Bad news that reaches no one (the Coach's inventory; nothing built for it)
1. `Storable.settle()` returns `{ badnews: [] }` always; the base can produce none, and a `Listing.settle(thing)` has no news to carry at all (it returns `void`). A cache `save` refusal is thrown from `settle`: a caller of `fetch` / `put` / `del` / `hello` / `build` gets the throw, but the snapshot is made first.
2. `build(record)` and `build(dna)` return a thing, never news. For a record, `#receiveInto` tells the news to `onBadNews`; for a dna there is none.
3. `#receiveInto` tells news by `tellBadNews`, which does `this.#onBadNews?.(news)`: with no `onBadNews` given the news is dropped.
4. `#onNotice`: a refusal met by `#deliver` on a notice goes to `onBadNews` (tested). But `MSX.notice.parse(notice)` throws **inside the store's watch callback**, reaching the adapter and not `onBadNews`; and the same `#deliver` refusals (a `bad_record`, a world refusal) that a `fetch` caller could handle are, on the watch's way, flattened into news.
5. `#deliver` throws a refusal (the answer's `err`, or `absentRefusal`) at a caller: a caller of `tryFetch` can handle it, but `hydrateAll` (so `hello`) calls `thing.tryHydrate` and drops each `Outcome`, so a failed hydrate tells no one.
6. `Storable.receive` ends silently with `{ badnews: [] }` when `reconcileCentral`'s verdict is not a `receivedAct` ('older', 'same', 'skip'); a 'skip' (a record that cannot be judged against central) is not news to anyone.
7. The `Trigger` launch uses `tryFetch`, so its refusals are the Trigger's; I did not follow where they go.

## Discoveries
* Thread 1 left open whether the snapshot shows `combined`; now each thing's own `getSnapshot()` does, which is what the thing shows (the draft). Thread 5 inherits that.
* Four thread-1 tests broke under the 'fail' default; they now pass `{ ifAbsent: 'nil' }` or use `listing.at`.
* `hello` replaces any thing already held under a cached scope, so tests call `hello` first and build after.
* No test of "bad news before the save" is possible yet, since no source of it exists (item 1).

## Deviations
* None from the plan; no suppressions (`eslint-disable`, `ts-expect-error`).
* Pulled forward: `isWatchable` defaulting true (the handoff named it).

## For the Coach
* The inventory above is the answer to your direction on bad news; I wrote none of it down as code.
* The `record_conflict` test is thread 2's, left alone.
