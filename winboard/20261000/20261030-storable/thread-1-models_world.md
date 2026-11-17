# Thread 1: The models' test world, and three fixes to the forms (2026-10-30)

Branch `20261030-models_world`, PR #370, stacked on #368. Justify: green (core 3809 tests pass, 37 skipped as before; 299 of them new here, in `tests/models/`).

* **Built**:
  * Fix (a): `staged` is null when none. `Storable.#staged` is `Fetched | null`; `combined` is `#staged ?? #central`; `hasStaged` is `#staged !== null`; the `staged` getter answers null; `stagedOrNull` is gone; `cacheable.staged` and `storableArgs.staged` are `sparseBase.nullable()`; `Listing.makeThing(central, staged | null)` and its `BoxListing` override take null, as does `adopt`.
  * Fix (b): `boxSparse` keeps `whisper_codec` and `whisper_schema_version`; `boxRecord` extends it with `sidecar`, `box_key_wrapped`, `whisper_ciphered`, strict.
  * Fix (c): `Answer` is `Outcome<Fetched | null>` with `scope` and `world` beside it, typed and checked.
  * `tests/test-helpers/models-world.ts`: the world (below).
  * `tests/models/models-shapes.test.ts`: every checker, in tables with a blurb as title.
  * `tests/models/box-listing.test.ts`: constructor refusals, `build(dna)`, `build(record)` equal to `fetch` by `cacheable`, `build(dna with whisper)` refusing `unexpected_error` at the seal.
  * An empty changeset: `src/models/` is not exported.

## The test world

Import from `tests/test-helpers/models-world.ts` directly; it is deliberately not on the `TH` door, which is published as `safebyok/testing`. Later threads add their helpers at the **end** of the file.

* `useModelsWorld(opts?)` returns `held`; `held.mw` is a new world for each test, disposed after. Or `makeModelsWorld(opts)` and `mw.dispose()` in `afterEach`. `opts`: `now` (default `T0`, 2023-11-14), `lockState`, `fakeTimers` (default true).
* `mw.world` (a `BoxWorld`: `clock`, `lockState()`, `ensureTimely`, `takeWorld`, `scope`, `vault_tok`), `mw.store` (`get`, `put(record, expected, ifPresent?)`, `del`, `watch`), `mw.cache` (`load`, `save`). `boxListingOf(mw, overrides?)` is a `BoxListing` over them (horizon ten minutes, `onBadNews` logging to `mw.badnews`).
* Call log: `mw.calls`, one ordered array of `{ verb, ... }` for `ensureTimely`, `takeWorld`, `get`, `put` (with `record`, `expected`, `ifPresent`), `del`, `watch`, `unwatch`, `load`, `save`. `mw.callsOf(verb)` narrows; `mw.clearCalls()` forgets calls and bad news.
* Defaults: `get` answers `mw.stored` under the boxlabel, or null. `put` keeps the record and answers it. `del` keeps and answers a tombstone one seq after the one stored or expected. Nothing compares `expected`: a stale write is scripted. `watch` records `onNotice` and `fullFor` (`mw.watches`, `mw.watchedScopes()`) and returns a recorded unwatch. `load` answers `mw.cached`; `save` keeps `cacheable` by boxlabel.
* Scripting, one answer per call then back to the default: `willGet`, `willPut`, `willDel`, `willLoad` (a value, `null` where it means nothing, or a function of the call), `willEnsureTimely`, `willSave` (thunks, which may reject or hold). Answer makers: `answerOf(scope, val|null)`, `refusalOf(scope, err)`, `staleWriteOf(scope, stored)` where `stored` is a full record, a sparse one, null, or `undefined` for no `meta`. For a malformed answer, or one missing `scope`, return any object.
* Seeding: `seedStore(record)`, `seedCache(...copies)`. Pushing: `notify(record)`, `notifyRaw(anything)`.
* Time: `mw.now()`, `mw.setNow(ms)` (jumps the clock only), `await mw.advance(ms)` (moves clock and fake timers together). The Trigger schedules `setTimeout` from `clock.now()`, so never move the clock another way. `lockState` by `mw.setLockState`.
* Builders, also on `mw`: `fullBoxRecord`, `sparseBoxRecord`, `tombstoneBoxRecord(overrides, 'x' | 'd')`, `boxscope(boxlabel)`; `T0`.

## Decisions taken
* Fake timers default on; `dispose` (via `useModelsWorld`) puts real ones back, since `restoreMocks` does not. `models-shapes.test.ts` takes `fakeTimers: false`.
* `put`'s third argument is recorded and unused; thread 8 gives it meaning. No compare-and-set in the defaults.
* `holdsCases` in `models-shapes.test.ts` gives one `expect` per row on the refusalkind thrown (or `'passes'`), so a failure shows both.
* The `Case` tables and `verdictOf` are file-local; copy them rather than export.
* **A damaged record is delivered as a tombstone in the kind's sparse form** (the review's significant finding, ruled by the orchestrator, YOLO, a two-way door). The `Answer` and `Notice` docs said a damaged tombstone carried only its scope, `vault_tok`, revision and times, which `MSX.answer` passes but `BoxListing.sparseOf` (`boxSparse`) refuses `bad_record`. Now the docs say what `Tombstone<SparseT>` already did: `am` 'd', the sparse props as far as storage recovered them, the kind's constants filled in by the adapter (for a box `fmt`, `whisper_codec`, `whisper_schema_version`). No code path changed; `boxSparse` and fix (b) stand as they were. Set aside: loosening `boxSparse` for tombstones, which would spread the damaged case into every concrete listing. `tombstoneBoxRecord(_, 'd')` builds exactly the sparse form (it always did; its doc now says so). `box-listing.test.ts` ends with `fetch` answering such a tombstone (a damaged box held, not present) and a bare one refused `bad_record`, pinning the contract. Threads 2 and 3 (adapters, `storedInStaleRefusal`) should build damaged tombstones this way.

## Discoveries
* `listing.snapshot` is `thing.sparse` of present things, and `sparse` is the sparse form of **central**. A box built from a dna (draft staged over a central never stored, `am: 'x'`, seq -1) therefore appears in the snapshot as that tombstone, not as its draft. The test asserts the boxlabel only. Threads 3 and 5 own the snapshot; they should decide whether the snapshot shows `combined`.
* The cache is handed `thing.cacheable` whose `central` is the full record where one was received, not a sparse form; `box-listing.test.ts` asserts that as it stands.
* `build(dna)` does not save to the cache today; thread 3's `settle(thing)` will.
* `Box.sidecar` is null for a draft (not full) even with a sidecar in the dna; `draftOf` defaults an empty one.

## Deviations
* None from the plan. No suppressions (`eslint-disable`, `ts-expect-error`).
