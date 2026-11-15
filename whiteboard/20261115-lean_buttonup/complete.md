# What "functionally complete" means for the new core

The work left before `safebyok/core` (the gate, the lease, the models, and the vaultDB they write through) and the
caching layer, called `safebyok/cached` here (the ThingMinder; not yet an entry point), are functionally complete.
What PR #707 built (the vaultDB's verbs on bank, gate and box, the battery, `PostgresVaultDB`, `world` and
`track` / `tracked`) is left out.

## safebyok/core

* **Bank's box verbs answer by kind.** `GetThingAnswer` and `WriteThingAnswer` are generic in the record, as the asks
  already are (`WriteAskOf<RecordT>`). Bank's box verbs then lose the `otherThanBox` check, which cannot fire; the
  `answer.val as BankThing` cast; and the ended-bank check repeated in five methods (`disabledAnswerOf`).
* **A box's methods live on the box.** They are stranded on its Sealer today. Where they go is designed with the Coach.
* **The models do not depend on the cache.** `Bank` holds no `QueryCacheOpts` and imports nothing from `minding/`. The
  vaultDB has one source, not two (`Device` and `BankOpts` each hold one now).
* **The classifier is lean.** `AdapterVaultDB`'s protected `classify*` methods pass through to plain functions, no store
  overrides them, and they go. The memory store and a store that decides (Postgres, and Convex after it) both compose
  the same exported steps.

## safebyok/cached

* **One way into the cache.** Every record enters through `#doDeliverRecord`: a get's answer, a notice, a write's
  answer, a listing, and each Thing that `tracked` or `world` carries. The get's `queryFn` stops writing the cache
  itself.
* **One watch per bank.** The bank's minder holds the bank's only watch. Its `receive` takes each notice, delivers the
  bank and main gate from `world` and `tracked`, and routes gates and boxes on to their minders: vaultDB, then world,
  then gate and box. The kind check moves out of `#doDeliverRecord` into `receive`. No other minder takes out a watch.
* **`listen`.** A host subscribes to a minder's records through one `QueryCache.subscribe`, filtered by the minder's
  `keyPrefix`.
* **The box listing.** A box minder lists the boxes one label under the root box. Each listed box enters the cache as
  a sparse record, marked stale, so the next get fetches it whole. The dead `#tsqListAskOf` goes, and its two safety
  hatches with it.
* **Storage going backward is not served as fresh.** Where storage answers a get with a record older than the cached
  one (a lost row, a rollback), the entry stops counting as timely, rather than staying fresh until `goodbye`. A late
  answer that only lost a race stays as `notes/wontfix.md` describes.
* **`VoidSentinel` is a whole tombstone**, with every field a tombstone has. `isVoidSentinel`, `gotAnswerOf` and box
  citing change with it. A box under the root cites its own shell.
* **The minder's inputs.** It takes `make(recordish, livepropsAndOpts, friend)`, with the friend `Pick<Bank, 'scope'>`
  and the cache options apart from it. `onBadNews` goes until something calls it. The ended-bank check goes.
* **Cache options are fixed where hosts can't safely choose them.** `networkMode` is `'always'` and `retry` is off,
  neither settable by a host. `staleTime` defaults to an hour.
* **Lifecycle.** `hello` is idempotent (it checks `#isReady`, so a second call opens no second watch). `goodbye`
  removes the minder's query defaults from the shared client.
* **Keys and names.** `queryKey` names the modelkind once. `pins` becomes `ties`, read without parsing the minder on
  every access. `isLifeOff` becomes `isLifeMismatch`.

## Not part of this push

* The instance-based model in front of the minder: sugared calls and a sync/async collection interface. Its API is
  designed afterwards, from what this push teaches, and design-minder.md is rewritten then.
* Error handling and consistency checks in the minder.
* Trees: boxes deeper than one label, gates beyond the main gate (which will control adding and removing them), and
  bringing a parent to life.
* What `maingate` names: the root gate, or the gate that authorized the caller.
* A box birth checking that its parent is live (TODO.md).
* A bank's lives sharing a lifeseq (TODO.md).
* Exporting `PostgresVaultDB`, once `safebyok` publishes; a Convex vaultDB built on the Postgres pattern; a GraphQL
  vaultDB.
* Moving the adapters, `safebyok-react`, the demo and e2e off `safebyok-big`.

## Order of operations

1. The doc-block branch, rebased onto #707, as its own PR.
2. T2 `minder_buttonup`, stacked on it:
   1. the minder's inputs, cache options and lifecycle;
   2. one way into the cache;
   3. `VoidSentinel`;
   4. the bank minder's `receive`, routing gates and boxes;
   5. `listen`;
   6. the box listing;
   7. storage going backward;
   8. keys and names.
3. The classifier tidy, and the models off the cache.
4. T3 `bank_box_errors`: answers by kind, then a box's methods off its Sealer, with the Coach.
