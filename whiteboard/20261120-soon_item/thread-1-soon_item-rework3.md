# Thread 1: soon_item, rework 3 (2026-11-20)

Branch `20261120-soon_item`, PR #790, stacked on #784. Changes agreed with the Coach by consensus, 2026-11-20.
`b84aab323` and `d63c73075` (rework 2's directive 3) are accepted and kept.

Commits: `b613f74f5` (the code and tests), `62b2dd198` (VOCABULARY and the changeset).

Proved: safebyok 1337 tests, safebyok-react 333, both typecheck and lint clean; `pnpm justify` at the tip (see the PR's
**Tests:** line).

* **Built**
  * **Principles, in the code.** `#minderEventOf` has "The emitted event pragmatically mimics the incoming TSQ event."
    above it, and shapes-minder's section comment opens the same way. react-giver.ts's module doc (it holds both the
    query defaults and the bridge's start) says the giver reads the minder's events for what a host and its user most
    likely want to see, intrudes as little as it can on the host's cache, chooses what to add and offers sound defaults,
    and does not interfere after that.
  * **1, the reorder.** `#sendToTSQ`: a sparse record newer than `soon ?? item` invalidates the item first
    (`#invalidateItem`: exact, `refetchType: 'none'`), then lands in the soon. `#markBehinds` runs only where a whole
    record lands, and in `#landedByGet`. The class doc states the invariant: a soon's `success` finds its item already
    invalidated, so a get from inside that listener fetches, as `isStaleAt` answers. Test: "asks the vaultDB for a get
    from inside a soon's success..." in thing-minder-listen.test.ts; it fails with the two lines swapped back.
  * **2, eventkind.** `MinderEventkind = 'item' | 'soon' | 'list'`, on every event; `MinderEventOf<DataT, EventkindT>`.
    `ThingMinder.isThingEvent` and `isSoonEvent` are gone. minder-bank narrows on `eventkind !== 'list'`, the bridge on
    `eventkind === 'soon'`. Liveness by Thing helpers: the giver's `shownRecordOf` is `Thing.isTombstone(record)`; the
    minder tests' `toldSortOf` uses `Thing.isGone`, `noticeOf` `Thing.isLive`.
  * **3, the action whole**: `Object.freeze({ ...tsqEvent.action })`, typed `MinderActionOf<DataT>`, from TanStack's
    own action union (`TSQQueryAction`, extracted from `QueryCacheNotifyEvent`, as TanStack exports no action type).
  * **4, removal keeps data.** The state stays a frozen shallow copy; every doc that said data was undefined after a
    removal now says the last state is told.
  * **5, every event but observers'.** `isTellableTSQEvent` passes `added`, `updated`, `removed`. In practice the new
    ones are `added` and `fetch` (the minder's queries have no observers, retry false).
  * **6, `queryHash`** beside `queryKey`; the Query itself stays out; scope and revision fields kept.
* **Decisions made**
  * `MinderActionTyped<ActionT, DataT>` maps TanStack's `any`-typed fields to ours: `success.data` as `DataT |
    undefined`, `setState.state` as `Partial<QueryState<DataT>>`, an `error` as `DefaultError`. Exported, with
    `TSQQueryAction`, as the forgotten-exports check requires of every type an export names.
  * `TellableTSQEvent` is our own union over `TSQ.Query` (default generics), not an `Extract` of TanStack's: TanStack's
    `Query<any, ...>` made every field `any`, which lint refuses.
  * The minder tests' `listenerOf()` records only what the tests before this rework heard (`removed`, and `success`,
    `error`, `invalidate` updates), so their sequences stay readable; `everyEventListenerOf()` hears all, used by the
    eventkind and queryHash tests. Two raw listeners in thing-minder-writes filter on `action.type === 'success'`.
  * `GiverEvent.action` is `Readonly<{ type: string }> | undefined`: the giver reads only the type.
  * `RecordFields` stays `{ am: string }`, as the type constraint every box record meets; its doc no longer says the
    giver reads `am`.
* **Deviations**
  * **ThingFormat is not bumped.** It is the `fmt` of every stored record (shapes-thing.ts), LeaseFormat, and the
    Postgres adapter's TableVersion, so it versions stored records, not only the event shape. The shapes-minder comment
    "A change to this shape bumps ThingFormat, which `listen` takes" is left as it was, now in conflict with this
    change: an Open matter.
* **Discoveries**
  * The fake giver world's records parse as Things (scope, UUID revtok, revseq, am, lifepath), so `Thing.isTombstone`
    reads its tombstones without changing the fakes.
  * `.changeset/20261120-minder_try.md` (another PR's) names `isThingEvent`; left alone, since this changeset says it
    is gone.
* **For the Coach**
  * **ThingFormat for the event shape**: a separate feed version for `listen` (say `MinderEventFormat`), bumped here,
    or keep `ThingFormat` and accept that an event-shape change goes unversioned until a stored change bumps it.
    Recommend the separate constant.
