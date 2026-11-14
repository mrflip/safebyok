# Thread 3: The listing's pipeline (2026-10-30)

Branch `20261030-listing_pipeline`, PR #372, stacked on #375 (line main → #368 → #374 → #370 → #371 → #373 → #376 → #377 → #375 → #372). Justify: green (core 4195 pass, 37 skipped, 2 todo; root scripts 289; every package and size budget green), at the tip and at each commit.

* **Built**
  * `Listing.settle(thing?)` saves `thing.cacheable` to the device cache, tells a refused save to `onBadNews` (a cache miss), and remakes the listing's snapshot in a `finally`.
  * `ifAbsent: 'fail' | 'nil'` on `fetch` / `tryFetch` (`MSX.ifAbsent`, `MSX.fetchOpts`; types `IfAbsent`, `FetchOpts`), default 'fail', judged in `#deliver` after delivery: nothing stored or a tombstone is absent. Only a fetch passes one; `put`, `del` and notices have the instance back, tombstone or not. The trigger's launch is `tryFetch({ ifAbsent: 'nil' })`.
  * The listing snapshot: each present thing's own `getSnapshot()`, frozen, the same array until a thing's snapshot changes (element identity). `#hold` primes and subscribes.
  * `isWatchable` defaults true, pulled forward.
  * Second rework: one pipeline (`#buildOrReceive`), the throw rule, success by receive's verdict, the background refresh told (below).
  * Tests: `tests/models/listing.test.ts`; appended describes in `box-listing.test.ts`, `models-shapes.test.ts`, `storable.test.ts`, `tests/helpers/trigger.test.ts`. An empty changeset (`src/models/` and `src/helpers/` are not exported).

## Rework (second review, 2026-10-30)
Commits b6fdb125 and 261354f7, after folding 1be5ec32 into b8bdeaba's tests (now 51f0984f) so every commit is green.

* **The throw rule (M).** A call that cannot give what it asked for throws; reporting never replaces a throw owed. A record `receive` refuses is thrown to the `fetch`, `put`, `del` or `build(record)` that asked, the instance as it was, nothing saved, nothing told. A `stale_write` is still thrown as it came; the record it carries, if `receive` refuses it, is told (the caller already has a throw). A refused cache save, a refused cache load and a copy that cannot be revived are cache misses: told, no throw. Every refusal met on a notice, a malformed notice's included, is told. Thread 2's "nothing stored for a thing held alive" and 4b's `vault_remade` through `box.fetch()` are back to their original throws.
* **One pipeline (L).** Survey of every site that made or held an instance before: `hello` (`makeThing` + `#hold` per cached copy, skipping held scopes); `build(dna)` (`makeThing` + `#hold`, *replacing* a held instance); `build(record)` (`at ?? #makeThingFor`); `#buildOrReceive` for `fetch`, `put`, `del`, notices and a `stale_write`'s carried record (`at ?? #makeThingFor`); `#makeThingFor` itself; the concrete `makeThing`s (`box-listing.ts`, `vault-listing.ts`), called only by the listing. Now every one goes through `#buildOrReceive(scope, intake)`, the intake a `received` record, a `cached` copy or a `drafted` dna; it alone calls `#bornOf`, and only where nothing is held. A test counts `makeThing` across all routes: once per scope.
  * Consequences: `build(dna)` over a held scope refuses 'bad_option' (`alreadyHeldError`: edit the instance held), the spec's simplest cure, so the `loosened.test.ts` describe pinning the replacement is gone. Nothing is ever replaced, so the first review's YOLO fix (the unsubscribe map) falls out, and so does "a replaced instance's trigger left running". `hello` reviving only scopes not held stays, as the `cached` rule. A newborn is held only once `receive` accepts its record, so a refused one leaves nothing held.
* **Background refresh (Q) and success (4).** `Trigger` takes `notesOwnSuccess` (an ok outcome notes nothing; the launch notes its own) and `onTimerRefusal` (told a timer launch's refusal, which no caller awaits). `Storable` sets both: `receive`'s verdict (not older, the record in hand whole) is the one owner of success on the fetch path, and a timer launch's refusal reaches `listing.tellBadNews` (now public). A `hydrate` caller still has its refusal thrown; `hydrateAll` tells.
* **ifAbsent (5).** Already only `fetch` passes one; a test pins `del` answered by a tombstone resolving the instance.
* **Set aside.** Catching in a `#receiveInto` (the first rework's ruling-4 design: it swallowed throws owed). Keeping the unsubscribe map and replacing on `build(dna)` (the Coach: nothing built more than once). Dropping success-noting from `Trigger` altogether (it is a generic helper with an ok-means-success default other users may want; an opt is additive). Telling *and* throwing a delivery refusal (the Coach: reporting does not replace a throw, and a caller who has the throw needs no news).

## Decisions taken
* `fetch` validates its scope with `scopeOf` before any call, so a bad scope refuses before `ensureTimely`.
* Snapshots compared by identity: a thing makes a new snapshot object only when it changes.
* A held instance's change remakes the listing snapshot inside `receive`, before the save; a newborn's appears at `settle`, after the save. The Coach ruled the cache may lag ("it's a cache"), and no instance is ever unfollowed.
* The fake store and tests supply the contract's extra fields (the Coach's direction).

## Discoveries
* A newborn notifies nobody of its first `receive`: it is subscribed only once held, after.
* `hydrateAll` joining a timer launch tells its refusal twice (see the bad-news file, item 8).
* Bad news: the inventory is in `thread-3-bad-news.md`, beside this file.

## Deviations
* No suppressions (`eslint-disable`, `ts-expect-error`) added.
* Pulled forward: `isWatchable` defaulting true.

## For the Coach
* **`build(dna)` over a held scope refuses 'bad_option'.** Your "one pipeline" ruling leaves build(dna) either refusing or meaning edit; refusing is the smaller door. If you would rather it edit the held instance, it is one branch in `#buildOrReceive`.
* **A cache load refused at `hello` is a cache miss**, told, and hello goes on to watch and hydrate.

## Restacked (2026-10-30)
Rebased from 5b80fd21 onto bc53f4e8 (#375); old tip tagged `20261030-listing_pipeline-prerebase` (7972132c). Merges in `box.ts`, `storable.ts` and the shared test files kept both sides, thread 3's describes last. Thread 5's "getSnapshot is made on the first call" builds its box with `new Box(...)`, as `#hold` primes a held box's snapshot.
