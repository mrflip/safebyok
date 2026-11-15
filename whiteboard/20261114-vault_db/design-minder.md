# Thing Minder: one kind of Thing, syndicated through TanStack Query

Thread `20261114-vault_minder`, worktree `/workspace/byok-vault_minder`, cut from main. The new core gains a
`ThingMinder` (`packages/safebyok/src/minding/thing-minder.ts`): a thin layer between the vaultDB and
`@tanstack/query-core` (TSQ). It takes over what big's `Listing` does for timeliness, joining gets and ordering
records, and leaves instances, snapshots and error triage to whoever listens to it. This first pass does only the get.

**proposed**, **cited** and **actual** are defined in [design-vaultdb.md](design-vaultdb.md); the box's shapes and
`tryListThings` in [design-boxops.md](../20261114-box_ops/design-boxops.md).

The goal is safety and consistency, not availability. Where the cache cannot be sure of a record, it serves nothing
until the vaultDB has been asked again.

## What it is, and what it is not

A minder minds **one kind of Thing in one bank**: the main gate of `(userid, banklabel)`, say, or that bank's boxes.
It does three things:

1. **It asks the vaultDB**, and hands the TSQ cache the record that comes back.
2. **It receives the vaultDB's watch notices**, and hands the cache their records the same way.
3. **It hears the cache**, and tells its listeners each record or refusal that lands there.

It does not make or hold instances, keep records of its own (the cache holds them), build snapshots, raise bad news,
triage errors, or read `world`. Whoever listens does those: in the first place, the keeper of durable instances that
does the other half of what big's `Listing` does.

It is an internal interface. Its callers are ours, and hand it fully formed asks.

## What the cache holds

**For each scope, the cache holds a record, a tombstone, or the Void Sentinel: faithfully true, perhaps out of date.
It holds nothing when we do not know, or when the system is confused.**

* **The Void Sentinel** (`VoidSentinel`) is what the cache holds for a scope the vaultDB last said stores nothing. It
  is one frozen object for every scope, shaped as the shell. A caller tests `record === VoidSentinel`.
* **The cache holds no act.** The minder reads the act where an answer is in hand, and the record it hands the cache
  says the rest.
* **`record`** names what the cache holds or takes: a Thing, live or a tombstone, or the Void Sentinel (`ThingOrVoid`).

## The flows

```
get      caller ──tryGet(ask)──▶ minder ──tsq.query──▶ TSQ ──queryFn──▶ vaultDB.tryGetThing(ask)
                                                                          │
                                    TSQ ◀── setQueryData ◀── #deliver ◀───┘   then the queryFn returns what the cache holds
         caller ◀── the record the cache holds, read back once the fetch lands

notice   vaultDB ──notify──▶ minder.receive ──#deliver──▶ setQueryData ──▶ TSQ

write    caller ──tryWrite──▶ minder ──▶ vaultDB.tryWriteThing ──▶ #deliver ──▶ setQueryData ──▶ TSQ      (later)

tell     TSQ's QueryCache event ──▶ minder ──tell──▶ each listener
```

**Every record enters the cache through `#deliver`.** A tryGet's answer and a notice each go to `#deliver`, which
reads the record off the answer's act, checks it against the record held, and hands it to `setQueryData`. A get's
`queryFn` then returns what the cache holds, which TSQ sets again.

**TSQ applies one ordering rule to every set.** Each `setQueryData`, and the set TSQ makes when a `queryFn` returns,
ends in `Query.setData`, which calls `replaceData(prior, record, options)`, which calls
`options.structuralSharing(prior, record)` when that is a function (query-core 5.107.1, `utils.ts` and `query.ts`).
The minder sets `structuralSharing: newerRecordOf`. That keeps the order even where a notice lands between a `queryFn`
returning and TSQ setting its result.

## Reading the record off the act: `recordOf(answer)`

| Answer                            | Act                  | Record                |
| --------------------------------- | -------------------- | --------------------- |
| a get's, good                     | `gotlive`, `gotgone` | its `val`             |
| a get's, good                     | `gotvoid`            | the Void Sentinel     |
| a notice                          | `gotlive`, `gotgone` | its `val`             |
| a get's, refused                  | any                  | none: the get refuses |

The minder asks with `ifAbsent: 'nil'`, so a get refuses only where the vaultDB could not answer, and its `dbhas` is
then null: what is not a Thing (a damaged row) never reaches an answer as one. A write's acts come with `tryWrite`.

## Ordering two records of one scope: `ageOf(prior, record)`

A record's place in its scope's history is its `lifepath`, compared lifeseq by lifeseq as numbers, then its `revseq`.

| prior and record                                          | age      |
| --------------------------------------------------------- | -------- |
| same `revtok`, and the same lifepath, `revseq` and `am`   | `same`   |
| same `revtok`, but another lifepath, `revseq` or `am`     | `forked` |
| another `revtok`, at the same lifepath and `revseq`       | `forked` |
| another `revtok`, record later                            | `newer`  |
| another `revtok`, record earlier                          | `older`  |

* **The lifepath comes first** because a `revseq` starts again at 0 when a Thing is born under a new life of its
  parent. Within one life of the parent, the Thing's own lifeseq only rises as its `revseq` does.
* **`forked` is a pair our system never produces.** One revision has one token, and one token one revision. It covers
  big's three: one revision under two tokens, two lives or two fates.

## Merging: `newerRecordOf(prior, record)`

The `structuralSharing` function for the minder's keys. It runs inside TSQ's `setData`, so it never throws, and never
calls TSQ.

| prior                       | record                     | the cache keeps                       |
| --------------------------- | -------------------------- | ------------------------------------- |
| none, or the Void Sentinel  | anything                   | record                                |
| a Thing                     | the Void Sentinel          | prior                                 |
| a Thing                     | `newer`                    | `replaceEqualDeep(prior, record)`     |
| a Thing                     | `older`, `same`            | prior                                 |
| a Thing                     | `forked`                   | record, and `#deliver` asks again     |

* **`replaceEqualDeep`** is TSQ's own structural sharing, exported by query-core. A newer record keeps the objects of
  every part that did not change, so a render that reads one part of it sees no change there.
* **A Thing is kept over the Void Sentinel** because the void may be late: a get that began before a birth answers
  void, and if the birth's notice lands first, taking the void would erase the birth. A void that is not late, a
  datastore that lost the row, is caught as a rollback (below), against what the cache held when the get began.
* **A `forked` record wins**, and the scope is asked again. Keeping `prior` would make the refresh's answer, if it is
  the record again, forked again.

## The impossible: forks and rollbacks

| Pair                                                         | Found by             | What happens                                                                  |
| ------------------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------- |
| `forked`, from a notice                                      | `#deliver`           | record kept; the scope asked again                                            |
| `forked`, from a get                                         | `#deliver`           | record kept: it is the vaultDB's answer of a moment ago                       |
| **rollback**: a get answers `gotvoid`, or an `older` record, behind what the cache held when the get began | the get's `queryFn` | refused `record_conflict`; the entry dropped, so nothing is served; the next get takes what the vaultDB answers |

* **A rollback needs `prior`, the record held when the get began**, so only a get can find one. A notice older than
  the cache is late, which is ordinary. Comparing with the record held *before* the get tells a late answer (the cache
  moved on during the fetch) from a rollback (the vaultDB went back behind what it had already said).
* **The refresh after a fork is started, never awaited.** `#deliver` starts a fetch of the scope with `staleTime: 0`
  and returns. Its answer comes back through the `queryFn`, and `#deliver`, like any get's. Its refusal, if any, is
  told to the listeners through the cache.
* **It cannot loop.** TSQ joins a fetch to one of the same scope already under way, as it joins any get, and a get's
  own answer reaches `#deliver` while its fetch is under way. So a fork found in a get's answer joins that get, and
  asks nothing more.
* **A rollback is told as its refusal**, since the `queryFn` throws it. A fork is not told: nothing is refused.
* **The entry is dropped once the failed fetch settles.** `#fetch` catches the `record_conflict` and removes the entry:
  a `queryFn` cannot remove the entry it is fetching, since removing an entry cancels its fetch. Until then, a
  microtask or two, `at` can still serve the record held before.

## Get: `tryGet`

```
minder.tryGet(ask: MinderGetAsk, { staleTime = minder's } = {}) → Promise<Outcome<ThingOrVoid>>   never throws
  demand enabled
  await this.#fetch(ask, staleTime)
  demand enabled
  record = tsq.getQueryData(key)       may be newer than what the vaultDB answered
  record === undefined (dropped by a rollback beside it) ? refuse record_conflict : good(record)
  catch: bad(err), or disabled after goodbye

#fetch(ask, staleTime)
  try:   return await tsq.query({ ...this.#thingQuerier(ask), staleTime })
  catch: a record_conflict drops the entry (tsq.removeQueries, exact); rethrow

#thingQuerier(ask)
  queryKey: this.queryKey(ask)
  queryFn:  prior  = tsq.getQueryData(key)
            answer = await vaultDB.tryGetThing(ask)
            if (! answer.ok) throw answer.err
            if isRollback(prior, recordOf(answer)) throw record_conflict, with the answer's val as its dbhas
            this.#deliver(ask, answer)
            return tsq.getQueryData(key)
```

* **`MinderGetAsk` is `GetThingAsk & { ifAbsent: 'nil' }`.** One cache entry serves every caller, and a fetch is
  joined by key, so every ask of a scope must ask the same. A `'fail'` ask does not compile.
* **`tsq.query` gives the join and the timeliness.** A second `tryGet` of a scope while one is in flight shares its
  `queryFn`, as big's `#doTryGetJoined` did. A record fresher than `staleTime` is served without a fetch, as big's
  `isHydratedWithin` did. (`fetchQuery`, which does the same, is deprecated in query-core 5.107 in favour of `query`.)
* **The answer is the record the cache holds**: the Thing, its tombstone, or the Void Sentinel. A caller that wants
  void or gone refused checks the record itself.

## At: `at`

```
minder.at(ask: MinderGetAsk, { staleTime = minder's } = {}) → ThingOrVoid | undefined
  demand enabled
  no entry, or entry.isStaleByTime(staleTime): undefined
  otherwise the record it holds
```

Synchronous, and never asks the vaultDB. It takes the same ask as `tryGet`, and can be made nicer later.
**`undefined` is "nothing to serve"**: not known, or not known recently enough. **The Void Sentinel is void**, as the
vaultDB last said. A tombstone is served as it is.

## Notices: `receive`

```
minder.receive                    a getter: bound, so the vaultDB's watch takes it as it is
  ignore the notice unless enabled, and its Thing is of this minder's kind
  this.#deliver(notice.val, notice)
```

A notice counts as a refresh, as it did in big: `setData` stamps `dataUpdatedAt` whether or not the record changed.

## Delivering: `#deliver`

```
#deliver(scoped: ThingScope, answer: good get answer | ThingNotice)      synchronous
  record   = recordOf(answer)                     read off the act
  isForked = prior and record are Things, and ageOf(prior, record) is 'forked'
  tsq.setQueryData(key, record)                   newerRecordOf picks what is kept
  if isForked: start a refresh of the scope, never awaited
```

* **`scoped` names the key**, since the Void Sentinel carries no scope: the get's ask, or the notice's Thing.
* **The refresh builds its ask by hand** (`{ op: 'get', ...scope, ifAbsent: 'nil' }`) until the vaultDB's ask
  builders land.

## Telling the listeners: `listen`, and the cache event

```
minder.listen(listener: (tidings: ThingTidings) => void) → unlisten

cache event, under this minder's key prefix (TSQ → Minder)
  'updated', action 'success': tell { scope, record }
  'updated', action 'error':   tell { scope, err }
  anything else: nothing
```

```ts
/** What a listener hears of one scope: the record the cache now holds, or the refusal a get met. */
type ThingTidings = { scope: ThingScope, record: ThingOrVoid } | { scope: ThingScope, err: VaultError }
```

* **A listener hears every record that lands, changed or not.** TSQ dispatches `success` on every `setData`, and its
  event does not carry the record held before, so the minder cannot tell a change without keeping records of its
  own. A get's record lands twice, once from `#deliver` and once from the `queryFn`'s return. The listener orders by
  `ageOf`'s rule, as it must anyway to keep its instance, and a record it already has changes nothing.
* **A refusal is told as it is.** No triage, no bad news.
* **A listener that throws is skipped**, and stays listening. Its throw reaches neither the other listeners nor TSQ.

## Starting and ending: `make`, `hello`, `goodbye`

```
ThingMinder.make({ userid, banklabel, modelkind }, { vaultDB, tsq, staleTime? })    the checker supplies staleTime's default

minder.hello()
  tsq.setQueryDefaults(this.keyPrefix, { structuralSharing: newerRecordOf, staleTime, gcTime: Infinity,
                                         retry: false, networkMode: 'always' })
  start the cache subscription, then the vaultDB watch of the bank, with this.receive

minder.goodbye()                                         synchronous, and disables first
  disable; stop the watch; end the cache subscription; forget the listeners
  tsq.removeQueries({ queryKey: this.keyPrefix })
```

* **`staleTime`** is TSQ's name for how long a record stays timely: big's `maxMillisSinceRefresh`. Its default,
  `DefaultStaleTime`, is 5 minutes, as big's `vaultRefreshMinutes` was.
* **`make` checks its arguments**: the scope's names, a vaultDB with `tryGetThing` and `watch`, a QueryClient with
  `fetchQuery` and `getQueryCache`, and a non-negative `staleTime`, refusing `bad_option`. The asks `tryGet` and `at`
  take are trusted, as an internal interface's are.
* **The minder is handed its `tsq`**, and never makes one. A host using TanStack Query for its own data can hand it
  the same client, and see the minder's entries in its devtools.
* **The defaults are set under the minder's key prefix**, so they reach a `setQueryData` of a scope never fetched
  (`QueryCache.build` defaults its options through `getQueryDefaults`), and touch none of the host's queries.
* **`retry: false`** keeps retries out of the critical path, as CLAUDE.md asks. `query` already defaults to it, but a
  `QueryObserver`, which polling will need, defaults to three.
* **`networkMode: 'always'`.** Under TSQ's default, `'online'`, a fetch made while the browser reports itself offline
  pauses until it reports itself online, and the `tryGet` hangs. Under `'always'` the vaultDB is asked, and answers
  `storage_unavailable` if it cannot be reached.
* **`gcTime: Infinity`** keeps a record while the minder lives. A bank's Things are few. Without it, TSQ drops an entry
  five minutes after its last use, and `at` forgets a record it was told.
* **`goodbye` removes the minder's entries**, so a record of a bank let go does not outlive the minder in a shared
  client. After it, `tryGet` and `at` refuse `disabled`, and notices and cache events are ignored.

## Keys

```
keyPrefix                     ['safebyok', userid, banklabel, modelkind]
queryKey(scoped)              ['safebyok', userid, banklabel, modelkind, labelpath]
```

* **The modelkind is its own segment**, though the labelpath starts with it, because TSQ matches a key's prefix by
  whole segments: `['safebyok', userid, banklabel]` then names every minder of the bank, and the minder's prefix its
  own entries.
* **A listing gets keys of its own when it comes**, under the same prefix.

## The interface

```ts
export class ThingMinder {
  static make(scope: { userid, banklabel, modelkind: Thingkind }, opts: { vaultDB: VaultDB, tsq: TSQ.QueryClient, staleTime?: number }): ThingMinder
  readonly userid: string
  readonly banklabel: string
  readonly modelkind: Thingkind
  get scope(): ThingWatchScope
  get keyPrefix(): TSQ.QueryKey
  queryKey(scoped: ThingScope): TSQ.QueryKey
  get receive(): (notice: ThingNotice) => void
  hello(): void
  goodbye(): void
  at(ask: MinderGetAsk, opts?: { staleTime?: number }): ThingOrVoid | undefined
  tryGet(ask: MinderGetAsk, opts?: { staleTime?: number }): Promise<Outcome<ThingOrVoid>>
  listen(listener: (tidings: ThingTidings) => void): () => void
}
export const VoidSentinel: ThingCited
export const DefaultStaleTime: number
export type ThingOrVoid = Thing | typeof VoidSentinel
export type MinderGetAsk = GetThingAsk & { ifAbsent: 'nil' }
```

* **Not generic, for now.** `Thing` is the main gate alone, so the minder's records are typed `Thing`. It takes a type
  parameter when `Thing` becomes a union of kinds.
* **Exported from the main `safebyok` entry**, whose header now says so.

## Changes to the vaultDB

* **`ThingNotice` gains `ok: true`**: `Pick<GoodAnswer<Thing, 'gotlive' | 'gotgone'>, 'ok' | 'act' | 'val' | 'world'>`.
  It was the one answer `#deliver` takes that `ok` could not narrow.
* **`GetThingAnswer` ties its `val` to its act**: `GoodAnswer<Thing, 'gotlive' | 'gotgone'> | GoodAnswer<null,
  'gotvoid'> | BadAnswer`. The adapter refuses `storage_issue` where a store reports `gotlive` or `gotgone` with no
  Thing, as it already did for a good write.
* **The watch takes the vaultDB's words.** `watch(scope, receive, onBadNews)`; the memory store's `Listener`,
  `#listeners`, `#tell` and `hear` are `Watcher`, `#watchers`, `#notify` and `receive`, and so is `doWatch`'s callback.

## Vocabulary

Each layer gets its own four words: to start, those started, to send, to take.

| Layer              | start       | those started | send      | take      |
| ------------------ | ----------- | ------------- | --------- | --------- |
| vaultDB            | `watch`     | watchers      | `notify`  | `receive` |
| Minder             | `listen`    | listeners     | `tell`    | `hear`    |
| snapshot           | `subscribe` | subscribers   | `publish` | (none)    |

* **What `notify` sends is a `ThingNotice`**, and what `tell` sends is `ThingTidings`: news would clash with bad news.
* **No fourth word for a snapshot.** `useSyncExternalStore` calls its subscriber with nothing, and the subscriber reads
  the snapshot again. `use` also reads as a React hook.

## Guarantees loosened, dropped or changed, against big's `Listing`

1. **`tryGet` returns the record, not the vaultDB's answer.** Big's `tryGet` returned the bankDB's answer, with its
   `ask`, `act` and `parent`, or act `timely` where the listed instance served. Here it returns `{ ok, val }` with the
   record the cache holds once the fetch lands, which may be newer than what the vaultDB answered, or `{ ok, err }`.
2. **`tryGet` no longer refuses void or gone.** Big's took `ifAbsent: 'fail'`. Here the ask is always `'nil'`, and a
   caller checks the record.
3. **A fork is mended, not refused.** Big threw `record_conflict` where one revision came under two tokens, two lives
   or two fates. Here the cache takes the incoming record and asks the vaultDB again, and nothing is reported.
4. **A rollback is refused, where big let it pass.** Big kept a newer record over an older one and said nothing. Here
   a get that answers behind what the cache held when it began refuses `record_conflict`, and nothing is served until
   the next get.
5. **A void after a parent's rebirth reads as a rollback**, once Things nest and a tidy removes the children of an
   old life: one spurious `record_conflict`, then the next get takes the void. A shell per scope, carrying its
   parent's life, would tell them apart.
6. **No `world`, no parent refresh.** Big's `maxParentMillis` refreshed the vault before a box get, and every answer
   delivered its `parent`. Here `world` is dropped on the way in. It is null until the bank is a Thing.
7. **No panic on a revoked identity.** Big's listing vacated the device on `identity_revoked`. Here the refusal is
   told to the listeners as it is.
8. **No instances.** Enlisting, keeping and taking down move to the listener. The minder holds no record of its own.
9. **Timeliness is the cache's.** Big marked a thing refreshed only when its record was whole. Here every record that
   lands stamps the entry, and the minder has only whole records until a listing brings sparse ones.

## Later

* **Writes.** `tryWrite(ask)` asks `vaultDB.tryWriteThing`, hands the answer to `#deliver`, and returns it as it is.
  `recordOf` then reads a write's acts: `born`, `reborn`, `replaced`, `passed` and `deleted` give `val`, a refused
  `void` the Void Sentinel, and a refused act over a stored Thing its `dbhas`. A refused `ahead` cited against a void
  has a null `dbhas`, which its act alone does not tell from one over a Thing. A write can find a rollback as a get
  does, against the record held when it began. It uses `setQueryData`, not a TSQ mutation, whose retries and queue
  are machinery we do not want.
* **The world.** No WorldMinder class: each minder's `make` takes a function to hand `world` to, a no-op by default.
  The bank's own minder keeps the default, and the others are handed the bank minder's entry for a bare record. It
  comes when the bank is a Thing.
* **The listing.** `tryList` over `tryListThings` (design-boxops.md): its sparse children under keys of their own,
  and its `parent` (perhaps `parentage`) delivered to the parent's key. `newerRecordOf` then prefers a whole record to
  a sparse one of the same revision, as big's receive table did.
* **Polling.** A `QueryObserver` per scope a listener wants kept live, with `refetchInterval`. Nothing polls until a
  listener asks for it.
* **Error triage**: telling a fork, and what becomes of a rollback beyond its refusal.
* **TODO `ifSparse`.** `tryAt` and `at` serve a sparse record where it is otherwise acceptable. A flag
  `ifSparse: 'nil' | 'get'` on `tryAt` would let a caller that needs the body refuse it, or fetch it whole.

## Wontfix

In `notes/wontfix.md`: a late, older answer marks the newer record fresh; the minder detects no conflict among
the records it holds.

## The dependency

`@tanstack/query-core` `^5.107.1`, a `dependency` of `safebyok`: the newest release past seven days old, as pnpm's
`minimumReleaseAge` resolved it. It has no dependencies of its own, runs wherever the host does, and is the core under
React Query, Vue Query, Solid Query and Svelte Query. It replaces big's joined gets, its timeliness checks and the
ordering half of its receive table. As a `dependency` with a `^5` range, a host that already has it shares one copy.

## Security

* **The cache holds what the vaultDB holds**: ciphertext, the sidecar, and the Thing fields. Nothing unsealed enters
  it. A host that persists or dehydrates a shared client writes nothing the backend does not already have.
* **A refusal in the cache** is a `VaultError`, which carries a `LoggableAsk`, never a record's body.
* **Rollback detection is new**, and goes into `notes/security.md` once the design settles: what it catches (a
  datastore that answers behind what it already said to this device), and what it does not (a rollback before this
  device first asked, or while the cache had dropped the entry).

## Open questions

1. **`ThingMinder` or `VaultMinder`.** I recommend `ThingMinder`: it minds Things, one kind to a minder, and an
   instance reads as `gateMinder`. Built as `ThingMinder`.
2. **One minder per kind per bank.** Each minder holds its own watch of its bank. The wiring above can share one
   watch instead, since `receive` is public.
3. **A fork: keep one, or serve nothing.** Built as you said: the record wins and the scope is asked again. Serving
   nothing until the refresh lands, as for a rollback, would follow your rule that any answer then is worse than
   wrong, and give both impossibilities one remedy, for the cost of a cache with nothing to serve for one get.
4. **The `as` casts.** TSQ's query defaults and cache events are typed `unknown` and `any`, so `newerRecordOf` and
   the cache event cast to `ThingOrVoid`, each under a comment saying what holds it true.





For a DB op:
harvest the
 undeliverable: (errors that have no data) -- throw the error
* ask and answer are inconsistent -- throw unexpected error
* impossible data: (ones that seem to be healthy but cannot occur in a working system) -- these cannot be served by the cache. if there's no option to *schedule* them for a refresh in a way that they won't be served, then just remove them so the next request refreshes. Then throw the error
Next, gather everything deliverable.
dbhas: { act: 'dbhas', val, ok: true }
