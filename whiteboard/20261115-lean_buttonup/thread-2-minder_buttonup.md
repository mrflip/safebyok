# Thread 2: minder_buttonup (2026-11-15)

Branch `20261115-minder_buttonup`, PR #PRNUM (draft), stacked on #708 (doc blocks), which is stacked on #707. The
branch's first commit, 52b29f8fc, is the Coach's hand edit to `thing-minder.ts`, kept. Proved: PROOF.

**Blocked on one item**, which the orchestrator asked to see before it is built: *storage going backward is not served
as fresh* (complete.md, *safebyok/cached*). The proposal is in `thread-2-storage_backward.md`, for whoever builds
it; nothing of it is built.

* **Built** (`packages/safebyok/src/minding/`, tests in `tests/minding/thing-minder.test.ts`):
  * **Inputs.** `ThingMinder.make({ modelkind }, { vaultDB, tsq, queryCacheOpts?, minders? }, bank)`. The friend goes
    third, `MinderFriend = Pick<Bank, 'scope' | 'rootBox'>`, kept live. `onBadNews` and `#demandEnabled` are gone;
    the watch gets `noop` for its trouble, under a comment. `make`'s checks name the minder class, so they sit in
    `thing-minder.ts`, as `bank.ts` keeps its own.
  * **Cache options.** `QueryCacheOpts` is `{ staleTime, gcTime }`, default an hour and Infinity; the strict check
    refuses `networkMode` and `retry`. `FixedQueryCacheOpts = { networkMode: 'always', retry: false }` is spread over
    them in `hello`, with `structuralSharing`, in one `setQueryDefaults` on `keyPrefix`.
  * **Lifecycle.** `hello` returns at once when `#isReady`. `goodbye` sets the key's defaults to `{}`: TanStack Query
    has no way to remove them.
  * **One way into the cache.** `#doDeliverRecord` is the one `setQueryData`, and caches nothing unless `#isReady`.
    The get's `queryFn` delivers the answer's record (or the void sentinel) and its world through it, then returns
    `this.at(ask)`, so TanStack's own write of the return changes nothing.
  * **`VoidSentinel`** is a type, `Sparse<Thing> & { am: 'x' }`, and `voidSentinelOf(scoped, parentLifepath)` makes
    one: the shell of the Thing at the scope, with every Thing field, `-1` revseq and lifeseq, the void tok and time.
    A root's lifepath is `-1`; a box under the root box gets `<root box's lifepath>/-1`, read from the friend's
    `rootBox`, so a box's birth can cite what the get returned (tested against `MemoryVaultDB`).
  * **One watch.** Only the bank's minder watches (`hello` checks `modelkind === 'bank'`). `#receive` routes the
    notice's world (bank, then main gate), then its Thing, each to the minder of its kind from `#minders`
    (`opts.minders`, plus itself). The kind check is the routing; `#isOurThing` is gone.
  * **`listen(listener)`**: one `QueryCache.subscribe`, filtered with `TSQ.matchQuery({ queryKey: keyPrefix })`; the
    listener gets TanStack's `QueryCacheNotifyEvent`.
  * **`list()`**: lists the Things one label under the minder's root (`labelpath: modelkind`, `ifAbsent: 'nil'`),
    seeds each through `#doDeliverSeed`, routes the world, and resolves the labelpaths. `#tsqListAskOf`,
    `listingKey` and their two safety hatches are gone.
  * **Keys and names.** `queryKey` is `['safebyok', userid, banklabel, ...labels]`: the labelpath starts with the
    modelkind, so `keyPrefix` still selects the minder's entries. `pins` is `ties`, a getter that builds the object
    without parsing. `isLifeOff` is `isLifeMismatch` (`thing-classifier.ts`). VOCABULARY.md: a **ties** entry, and
    the **Void Sentinel** entry rewritten for the shell it now is.
* **Decisions made**:
  * **The friend carries `rootBox`.** "A box under the root cites its own shell" needs the root box's lifepath: a
    shell lifepath of `-1` under `box/openai` fails `boxSparse` and a birth citing it refuses `lifepathNotKept`. No
    get answer carries the root box, so the friend does. Asked below, since the friend was settled as `scope` alone.
  * **The roster is given to the bank's minder** (`opts.minders`), fixed at `make`; the gate and box minders know
    nothing of it. Set aside: each minder registering with the bank's minder in `hello` (a mutable roster, and a live
    bank minder in every minder's opts) -- more machinery for no case yet.
  * **World from a gate or box minder's own get** goes only to the minders it knows: itself, so the main gate of a
    gate get's world lands, and the bank of it is dropped. The bank's minder routes both.
  * **`tracked`** is not read off a get's answer: the minder's asks carry no `track`, and the vaultDB already turns
    each `tracked` entry into a notice on the watch.
  * **The roster's check** refuses a minder of another kind or another bank (`MinderOfOtherKind`): input validation,
    not a scope limit. A non-bank minder may be given a roster; nothing forbids it.
  * **`list` resolves labelpaths**, not records: the records are in the cache.
  * **`listen` hands over TanStack's event** rather than a shape of ours: the minder's API is being redesigned.
* **Deviations**: none from the handoff beyond the friend's `rootBox` above. `Bank` is untouched: its
  `queryCacheOpts` is now read by nothing (asked below).
* **Rows, not fixes** (races and loose ends, none handled):
  * A `goodbye` while a get is under way rejects that get with TanStack's `CancelledError`, not a `VaultError`.
  * A listener that throws throws out of the `setQueryData` that told it: out of a get, or into the watch's `noop`.
  * The friend's `rootBox` is the Bank's own copy, set once more at the bank's birth. A root box reborn elsewhere
    leaves the shell's lifepath stale, as it does `Bank.#shellOf`'s.
  * `goodbye` leaves an empty entry in TanStack's defaults map, one per key prefix said goodbye to.
* **Discoveries**: TanStack's `error` action sets `isInvalidated: true` and keeps `data` and `dataUpdatedAt`: a
  `queryFn` that throws leaves the record, marks it untimely, and shows the refusal as `lastErr`. The proposal leans
  on it. Its `success` action clears `isInvalidated`, so an invalidation made inside a `queryFn` does not survive the
  fetch.

## For the Coach

* **Storage going backward**: the proposal in `thread-2-storage_backward.md`. Recommendation: throw `record_conflict` from the `queryFn`.
* **The friend carries `rootBox`** (`Pick<Bank, 'scope' | 'rootBox'>`). Recommendation: keep it; the other way caches
  a shell no birth can cite.
* **`Bank.queryCacheOpts`** is dead now that the minder takes its options. Recommendation: remove it in step 3 (the
  models off the cache), as planned, not here.
* **The watch's trouble goes to `noop`.** Recommendation: hand it the device's logger when the minder's error
  handling is built.
