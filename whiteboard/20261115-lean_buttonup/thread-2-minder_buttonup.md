# Thread 2: minder_buttonup (2026-11-15, rounds 3 and 4 on 2026-11-16)

Branch `20261115-minder_buttonup`, PR [#709](https://github.com/mrflip/safebyok/pull/709) (draft), on #708, on #707.
Round 3 starts from 1b061d9d9, the restacked tip. Proved: see the PR's **Tests:** line. `thread-2-storage_backward.md`
beside this file holds the round-1 proposal behind `stale_read`.

Rounds 1 and 2 built the minder's inputs, fixed cache options, `#doDeliverRecord` as the one `setQueryData`,
`list()`, `listen` over one `QueryCache.subscribe`, `stale_read` (TanStack's error state keeps the record, marks it
untimely, holds the refusal as `lastErr`), `goodbye` during a get refusing `disabled`, and the keys. Round 3 (every item
the Coach's ruling) and round 4 change:

* **Built**:
  * **`track` has three fixed keys**: `bank`, `gate` (`MainGateLabelpath`) and `box` (`RootBoxLabelpath`), in
    `shapes-thing.ts`, the memory store and Postgres. Postgres: a STABLE `safebyok_root_box(userid, banklabel)`, read
    beside `safebyok_world` in the get and list statements; each write function returns a `root` column, read after
    the write in plpgsql (an outer STABLE call would not see the write); `safebyok_tracked(world, root, track)`.
  * **`Bank` builds the asks**: `makeGetAsk`, `makeListAsk`, `makePutAsk`, `makeDelAsk`, each over the pure
    `*AskOf`, filling in the scope and `bank.track` (this object's revseq and lifepath of itself, its main gate and
    its root box). `VaultDB` and `AdapterVaultDB` lose their builders. `bank.tellBadNews(badnews)` passes to the device.
  * **`Device`** ports big's `onBadNews` option, `DefaultOnBadNews`, `tellBadNewsTo`, `BadNews`, `BadNewsHandler` and
    `device.tellBadNews` (the host's handler while enabled, the default after a sweep), with big's tests.
  * **The minder's strict ask**: `MinderGetAsk` (shapes-minder) is the bank's get ask, `track` and `ifAbsent: 'nil'`
    required: storage fields, so in the ask. `get(ask, opts)`, `tryAt(ask, opts)` and `isStaleAt(ask, opts)` take
    `staleTime` (and `ifStale`) in `opts`, which the Coach ruled stands; the merged form was deleted unshipped.
    `#answerOfTSQ(ask, opts)` finds the entry itself, after any refresh starts. `minderTrack` demands the track, then
    `checkedGetThingAsk` the ask, strict; the vaultDB gets the ask as given.
  * **Own watches**: every minder watches in `hello`; `#receive` caches a notice's Thing of its own kind and drops the
    rest. The roster, `#routeWorld`, `#route` and their phrases are gone. The friend is
    `Pick<Bank, 'scope' | 'rootBox' | 'makeGetAsk' | 'makeListAsk' | 'tellBadNews'>`.
  * **One way into the cache**: the get's `queryFn` returns the record, or its shell, after the `stale_read` check,
    and TanStack caches it through `structuralSharing` (`betterRecordOf`); `#doDeliverRecord` is for notices and
    listings alone. A get tells listeners once.
  * **Root box seeding**: the box minder seeds `rootBox` through `#doDeliverSeed` in `hello`, not in the constructor:
    before `hello` nothing is cached and no defaults exist, and `goodbye` removes it, so `hello` seeds again.
    `#pinRootBox` then subscribes a `QueryObserver` with `enabled: false` on its key until `goodbye`: TanStack never
    collects an entry with an observer, and this one never fetches. Query defaults could not: the root box's key is
    the box minder's own `keyPrefix`. A test with `gcTime: 10` and fake timers shows a listed box collected and the
    root box kept.
  * **Minders serve a born bank** (ruling A): `ThingMinder`'s class doc says a get or a list before the bank's
    birth refuses. No wontfix row.
  * **The builders' inputs** are `GetAsk`, `ListAsk`, `PutAsk`, `DelAsk` (were `*AskArgs`), each documented as the
    ask with its defaulted fields left out; every parameter of those types is `ask`. In `tryGetBox`, `tryPutBox` and
    `tryDelBox` the whole ask built from it is `thingAsk`.
    `#shellAt` builds a box's shell from the root box in the minder's own cache.
  * **`listen(listener)`** calls `listener(answer)`, a `TSQGotAnswer`: `#answerOfTSQ` at the minder's own staleTime,
    over the friend's get ask for the scope, `vacant` on `removed`. A listener's throw goes to `tellBadNews` wrapped as
    `unexpected_error`; the watch's trouble goes as it is.
  * **`shellOf(scoped, parent?)`** in `shapes-thing.ts`, exported from `safebyok/storage`, replaces `voidSentinelOf`,
    `Bank.#shellOf` and `#voidSentinelAt`, and makes `Bank.makeRecord`'s root box shell. Each fixed field defaults to
    the shell's and refuses another value; the proposed shell passes `isLabelLast`, `isLifeseqOwn`, `isLifepathDeep`
    and its kind's fmt. A given `lifepath` must be the shell's own. `VoidSentinel` moved there.
  * **The shell's lifeseq is `'-000000001'`**; `lifeseqOfLifenum(-1)` gives it. `seqOfLifeseq` is
    `lifenumOfLifeseq`, `lifeseqOf` is `lifeseqOfLifenum`, and `seq` variables are `lifenum` (the Postgres
    `safebyok_base32_of_bigint` parameter too). The SQL branches on `revseq = -1` and strips the last lifepath segment;
    nothing compares the text `'-1'`, so it needed no other change.
  * **`stale_read`** joined `CustomerKinds` in both eslint configs. VOCABULARY.md: **shell**, **Void Sentinel**,
    **minder** and **listen** updated; **lifeseq** and **lifenum** added.
* **Decisions made**:
  * **`list()` sends `bank.makeListAsk`**, tracked; on an unborn bank it refuses `storage_issue`, as a get does.
  * **`#doGet` still answers `this.at(ask) ?? fetched`**: TanStack's `query` resolves with what the `queryFn`
    returned, not what `structuralSharing` kept, so a notice that lands while the get waits would otherwise be
    answered over (two tests break without it). Its comment now says that, in place of the one about the gap between
    the `queryFn` returning and TanStack resolving.
  * **`bank.tellBadNews` takes an array**, as `device.tellBadNews` does, so it passes straight through.
  * **The bank's put still forces `labelpath: 'bank'`** and the box verbs `modelkind: 'box'` over the built ask, so
    what is not this bank's refuses, as before.
* **Deviations**: none.
* **Discoveries**:
  * **A get with a `track` refuses `storage_issue` where a tracked root is missing** (`writtenOf(null)`), so a
    minder serves only a born bank. The minder tests birth the bank first, and the root-shell get test is gone.
  * Changing a write function's output columns, or a parameter's name, makes `CREATE OR REPLACE` fail on a database
    that has the old function. The thread before did the same without a `DROP`; pre-1.0, no migration. Held: the
    Coach wants a data version in the function names, its form not yet settled.

## For the Coach

* **`BankAskArgs` and `GetBoxArgs`** are the same kind of input (the ask as a caller states it) but were not in the
  rename list; their parameters are now `ask`. Recommendation: rename them too, perhaps `BankAsk` and `GetBoxAsk`.
* **The SQL `CREATE OR REPLACE`**: held for the data version in the function names.
* **`Bank.queryCacheOpts`** is read by nothing: recommend removing it in step 3.
