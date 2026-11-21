# Thread 1: soon_item, the minder caches records, not cars (2026-11-20)

Branch `20261120-soon_item`, PR #790, stacked on #784 (`20261120-logical_gating`). Design: `soon_item-design.md` beside
this file (with the Coach's three amendments of 2026-11-20; its "nothing of a soon" is superseded by rework directive 5
below). Proved: see the PR's **Tests:** line (rework 2: safebyok 1333 tests, safebyok-react 333, `pnpm justify` at the
tip).

* **Built**:
  - `packages/safebyok/src/minding/thing-minder.ts`: items (`'!'`) and soons (`'~'`) in place of cars. `#sendToTSQ`
    routes a whole record, tombstone or shell to the item, a sparse record to the soon unless it is no newer than
    `#newestAt` (the newer of soon and item, by `#isBehindAt`); then `#addToParentListing` and `#markBehinds`. The `QueryCache`'s `onSuccess` calls
    `#landedByGet` (the same two) after a fetch. `#fetchRecord`'s `stale_read` prior is `#newestAt`. `#doGet` is two
    lines. Keys: `[...bankhead, 'item'|'soon'|'list', ...labels, mark]`; defaults by prefix in `#makeTSQ`;
    `invalidate` by the `'list'` prefix. `itemQueryKeyOf` (static), `itemQueryKey`, `soonQueryKey`, `listQueryKey`;
    `soonAt` is new. `descendantsQueryKey` and `#setListingDefaults` are gone.
  - `packages/safebyok/src/minding/newer-thing.ts`: `newerThingOf(prior, next)`, exported from `index.ts`.
    `thing-car.ts` and its test are gone, and so are the car types, `carLivenessVals` and the car phrases.
  - `models/vault.ts`: `withWhisper` reads `soonAt ?? item`; `#newestAt` is `soonAt ?? at ?? get`. Answers unchanged.
  - Giver: `getBoxRecord`, `listenBoxRecords`, `boxRecordQueryOptions`, `boxRecordQueryKey`; the bridge copies each
    `success` and forwards each `invalidate`; host staleTime `Infinity`; `newerOrSharedOf` wraps `newerRecordOf`.
  - Tests rewritten for items and soons; `tests/minding/newer-record.test.ts` new; the fake giver world now has
    scoped, cited fake records and `_cheat_hearBehind`.
  - VOCABULARY.md (item, soon rows; car, fullest, newest rows gone), notes/wontfix.md (two entries), TODO.md.
* **Decisions made**:
  - `newerThingOf` lives in its own module (the minder's file is long, and the giver imports it), refuses
    `bad_record` (it is an export: a bad value is the caller's), and takes `unknown`s, as structural sharing hands it.
  - No type replaces the car's: `get`/`at` answer `ThingAt<L> | Tombstone<ThingAt<L>>`, inline (Coach's amendment 3).
    `TSQGotAnswer` carries `record` where it carried `car`, its freshness fields inline.
  - Records are deep-frozen as they land (`#sendToTSQ`, `#fetchRecord`), as `carOf` froze them.
  - Giver names say "record" (`getBoxRecord`, `boxRecordQueryOptions`, `boxRecordQueryKey`), to match `useBoxRecord`.
  - The bridge acts on `success`, `invalidate` and (rework) `error`; it skips a `removed`.
* **Deviations**:
  - **`'static'` is refused** (rework, the Coach). The build kept it, with a `staleTime: 0` override for a behind item,
    because TanStack never counts a query stale under `'static'`, even invalidated; the Coach yanked it instead.
  - **TanStack tells cache listeners synchronously**, not on `setTimeout(0)`: `QueryCache.notify` calls each listener
    inside `notifyManager.batch` (query-core 5.107.1, queryCache.ts:362). Only observer notifications are scheduled. So
    a fetch's `success` is heard, `isInvalidated` false, before `onSuccess` re-marks the item; its `invalidate` follows
    at once. It arises only when a sparse record lands while a get waits, a crossing: a wontfix entry, no test.
  - "An item falling behind tells `invalidate` once" holds per landing: every landing clears TanStack's flag, so a
    whole record older than the soon re-marks it, and tells again.
  - VOCABULARY's *fullest* and *newest* rows went with *car*, and *am*'s sentence on a car's liveness.
* **Discoveries**:
  - The fake giver world's records must pass `ThingChecks.scopedCited` for the host's structural sharing to order them.
* **For the Coach**:
  - No security entry recorded: what is cached, and frozen, is what the car's fullest was.

## Rework, 2026-11-20 (the orchestrator's three directives, the Coach's two)

* **A refused get stays invalidated** (1). The bridge forwards an item's `error` as
  `invalidateQueries({ queryKey, exact: true, refetchType: 'none' })`: TanStack invalidates a query whose fetch errs, and
  `invalidate()` dispatches nothing on one already invalidated, so the later fall-behind tells no second `invalidate`
  and the host entry would otherwise stay fresh. No refetch: the host's own fetch may be the one refused. Stated in the
  bridge's doc, the minder's invariants and `listen`. Tests: minder-giver "marks the entry stale when a get is refused";
  thing-minder-listen "tells no invalidate when the item falls behind after a refused get".
* **The host's side of the crossing** (2): added to the wontfix entry "A sparse record that lands while a get waits";
  removed again by rework 2's directive 3.
* **Behind is a comparison** (3): `#isBehindAt` (then `#isDBNewerAt`) is true when a soon is cached and newer than the item by `Thing.cmp`, or
  with no item. Used by `isTimelyQuery`, `gotAnswerOf` and (pulled forward) `#newestAt`; `#tsqQueryOptions` needs it no more
  once `'static'` went (4), so the
  order the soon's removal and the item's landing take matters nowhere. Test: a read inside the item's `success`, for a
  whole record by notice or by get that catches up the soon, answers `gotlive` (fails without the fix).
* **'static' yanked** (4): `tsqStaleTime` is milliseconds or `Infinity`; the `staleTime: 0` override is gone. Tests over
  `[Infinity, 'static']` keep `Infinity`; `'static'` refuses as a call's and as `queryCacheOpts`' staleTime.
* **The minder tells everything; the bridge filters** (5): `#minderEventOf` tells a soon's events as a `SoonEvent`
  (`isSoonEvent`; revision fields from the sparse record; `RecordEventFields` shared with `ThingEvent`).
  `isThingEvent` holds of an item's only. `giverBankOfMinder` already filtered on `isThingEvent`; its doc says it hears
  no soon. Tests: a listener hears a soon's `success` and `removed`; the giver's bank passes on neither.
* **Decision**: no `ThingMinder.isListingEvent`; a listing is what both guards refuse. The tests' `world.ts` has one.
* **Discovery**: safebyok-react's tests import the built `safebyok`; after a change to its `src`, build it first
  (`pnpm --filter safebyok build`), or "isSoonEvent is not a function".
* Commits: `minder:` (1 in the minder, 3, 4, 5), `giver:` (1, 5's filter), `docs:` (2, VOCABULARY, TODO, changeset).

## Rework 2, 2026-11-20

In `thread-1-soon_item-rework2.md` beside this file, for whoever reworks or files the thread: the commits of each
directive (directive 3's two drop cleanly), the `cancelRefetch` deviation, and the get fix set aside.
