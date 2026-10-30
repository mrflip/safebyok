# Thread 3: The listing's pipeline (2026-10-30)

Branch `20261030-listing_pipeline`, PR #372, stacked on #370. Justify: green (core 3911 tests pass, 37 skipped as before, 93 more than thread 1; root scripts 289; size budgets unmoved).

* **Built**
  * `Listing.settle(thing?)` saves `thing.cacheable` to the device cache, tells a refused save to `onBadNews`, and then remakes the listing's snapshot. `#receiveInto` (so `fetch`, `put`, `del`, notices and `build(record)`) and `build(dna)` pass the thing; `hello` passes none. For a delivered record the snapshot is in fact made inside `receive` (the thing notifies the listing), before the save; only `build(dna)` and `hello` rely on `settle`'s own remake.
  * `#receiveInto` catches what `thing.receive` throws and tells it to `onBadNews` (rework, the Coach's ruling 4); `hydrateAll` tells each refused hydrate.
  * `ifAbsent: 'fail' | 'nil'` on `fetch` / `tryFetch` (`MSX.ifAbsent`, `MSX.fetchOpts` = `timelyOpts` plus `ifAbsent`; types `IfAbsent`, `FetchOpts`). Default 'fail'. Judged in `#deliver`, after the thing has received and settled: nothing stored, or a tombstone ('x' or 'd'), is absent; 'fail' throws `absentRefusal(scope)`, 'nil' resolves null. `put`, `del` and notices pass none and get the thing back, tombstone or not. The `Storable` trigger launch is `tryFetch({ ifAbsent: 'nil' })`.
  * The listing snapshot is `readonly SnapshotT[]`: each present thing's own `getSnapshot()`, frozen, the same array until some thing's snapshot changes (compared by element identity). `#hold` primes each thing's snapshot and subscribes, so a change in one thing remakes the list and tells the listing's subscribers. A draft shows its draft; the Bob test (a thing edited in place, the others' elements unchanged) is in `box-listing.test.ts`.
  * `isWatchable` defaults true (a plain get/set on `Storable`), pulled forward from a later thread.
  * Doc tidy: the damaged-tombstone rule is said in full in `Tombstone` and by pointer in `Answer` and `Notice`; Cache docs say "loaded once at `hello`, saved after each delivery".
  * Tests: new `tests/models/listing.test.ts` (48); appended to `box-listing.test.ts` (an absent-box describe, the snapshot describe); a describe in `models-shapes.test.ts` for `ifAbsent` / `fetchOpts`. Thread 1's `build(dna)` case now says it saves to the cache and checks the save. An empty changeset (`src/models/` is not exported).

## Decisions taken
* **Rework rulings (YOLO, two-way doors).** (1) `hello` revives a cached copy only for a scope `at(scope)` does not hold: a held instance is fresher. No test in this thread called `hello` first merely to dodge the replacement (each does it to start the watch), so none was removed. (2) `#hold` keeps each subscription's unsubscribe in a private map by scopepath and calls it when it replaces an instance; `build(dna)` over a held scope still replaces (the Coach's open question, pinned by another thread's `loosened.test.ts`). (3) The snapshot-before-save mechanism is unchanged (see Open questions); `settle`'s `try/finally` is gone, because the catch that tells a refused save replaced it.
* **Which refusals reach whom (the Coach's ruling 4).** A `fetch`, `put` or `del` that asked gets the answer's own refusals thrown: the world's (`takeWorld`, `ensureTimely`), the answer's `err` (a `stale_write` as it came, `meta.box_stored` kept), `absentRefusal` for a `fetch` with 'fail', and a malformed answer. A refusal met in *delivering the record* (`thing.receive` throwing `corrupt_record`, say, or the cache's save) goes only to `onBadNews`, for every route alike (`fetch`, `put`, `del`, `build(record)`, `build(dna)`, notices); the caller has the instance back as it stands. So a `stale_write` whose carried record conflicts now reaches the caller as `stale_write` with its meta, the conflict told as news (tested). `build` returns the instance and no news: its refusals reach `onBadNews`. `hydrateAll` tells each refused hydrate. A record that cannot be made into an instance (`#makeThingFor`) still throws: nothing exists to hand back. Cost: a `fetch` caller no longer hears of a record `receive` refused, and a host that gives no `onBadNews` hears nothing of it (inventory 3).
* `ifAbsent` is judged **after** delivery, so a 'fail' fetch of a tombstone still leaves the listing holding the tombstoned thing, saved and in the snapshot; only the caller sees the refusal.
* `fetch` validates its scope with `scopeOf` before any call, so a bad scope refuses before `ensureTimely`.
* The snapshot is compared by element identity, not deep equality: a thing makes a new snapshot object when it changes and the same one when it does not.
* The fake store and tests supply the extra contract fields (the Coach's direction): the adapters are a later match-up.
* Set aside: a `settle` that returns bad news to its caller (it is the design the Coach calls poorly thought out; see below); deep-comparing snapshots.

## Bad news that reaches no one (the Coach's inventory; ruling 4 closed items 2, 5 and part of 1 and 4)
Closed: item 2 (`build`'s news, a record's refusal or a refused save, is told to `onBadNews`; a dna still has none of its own), item 5 (`hydrateAll` tells each refused hydrate), and the parts of items 1 and 4 about a refused save and about delivery refusals met on a notice.
1. `Storable.settle()` returns `{ badnews: [] }` always; the base can produce none, and a `Listing.settle(thing)` has no news to carry at all (it returns `void`).
3. `tellBadNews` does `this.#onBadNews?.(news)`: with no `onBadNews` given the news is dropped. This now matters more: every delivery refusal goes this way.
4. `MSX.notice.parse(notice)` throws **inside the store's watch callback**, reaching the adapter and not `onBadNews`.
6. `Storable.receive` ends silently with `{ badnews: [] }` when `reconcileCentral`'s verdict is not a `receivedAct` ('older', 'same', 'skip'); a 'skip' (a record that cannot be judged against central) is not news to anyone.
7. The `Trigger` launch uses `tryFetch`, so its refusals are the Trigger's; I did not follow where they go.

## Open questions
* **Snapshot before save (the reviewer's significant finding 1; the Coach's).** A listener hears the new snapshot during `receive`, because the thing notifies the listing as it settles, before `Listing.settle` saves to the device cache. A fix changes how the listing follows its things (follow the things only after the save, or a listing-level batch), so none was made. Test "makes the snapshot inside receive, before the save" pins today's order.
* **A fetch hears no delivery refusal.** Ruling 4 sends a `corrupt_record` met by `receive` to `onBadNews` and gives the `fetch` caller the instance as it stands. Is a caller who asked owed the refusal as well (tell and throw)? Left as ruled.

## Discoveries
* Thread 1 left open whether the snapshot shows `combined`; now each thing's own `getSnapshot()` does, which is what the thing shows (the draft). Thread 5 inherits that.
* Four thread-1 tests broke under the 'fail' default; they now pass `{ ifAbsent: 'nil' }` or use `listing.at`.
* `hello` used to replace any thing already held under a cached scope; it now revives only scopes not held.
* Without the unsubscribe a replaced instance's change only remade the same snapshot (no listener called), so the leak is not visible through the listing; the test spies on the unsubscribe.
* No test of "bad news before the save" is possible yet, since no source of it exists (item 1).

## Deviations
* None from the plan; no suppressions (`eslint-disable`, `ts-expect-error`).
* Pulled forward: `isWatchable` defaulting true (the handoff named it).

## For the Coach
* The inventory above is the answer to your direction on bad news; I wrote none of it down as code.
* A `stale_write` whose carried record `receive` refuses now reaches the caller as `stale_write`, meta kept, the refusal told as news (tested here as `corrupt_record`). Thread 2's `record_conflict` test is not on this branch; if it expects the conflict thrown to the caller it will need updating where stacked.
