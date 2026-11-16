# What "functionally complete" means for the new core

The work remaining to functionally complete  `safebyok/core` (the gate, the lease, the models, and the vaultDB they write through) and the
caching layer, called `safebyok/cached` here (the ThingMinder; not yet an entry point).
What PR #707 built (the vaultDB's verbs on bank, gate and box, the battery, `PostgresVaultDB`, `world` and
`track` / `tracked`) is left out.

## safebyok/core

* **Bank's box verbs answer by kind.**
  - `GetAnswer<RecordT>`, `WriteAnswer<RecordT>`, `WriteAsk<RecordT>`.
  - Bank's box verbs then lose the `otherThanBox` check, which cannot fire; the
    `answer.val as BankThing` cast; and the ended-bank check repeated in five methods (`disabledAnswerOf`).
* **`CoreBox` is the box's record-level class, and the sealer of its whisper.**
  - A class of statics beside `Bank` and `Gate` (renamed `CoreBank` and `CoreGate` when the instance model's subclasses
    arrive): `nextRevisionOf`, `tombstoneOf`, and the Sealer's members (`tags`, `purposes`, `stampsOf`, `encode`,
    `decode`, `sealedOf`, `recordOf`), with `CoreBox satisfies Sealer`. The Sealer loses `nextRevisionOf`; the lease
    takes the sealer itself, not a kind string, so `sealerkindVals`, `BoxWhisper`, `BoxTombstone` (the sealer) and
    `sealerOf` go. One sealer, since only the whisper is sealed. `sealBox`, `tombstoneBox` and `unsealBox` stay on the
    bank, which holds the lease.
* **The bank's box verbs take and give records.** `getBoxRecord`, `putBoxRecord`, `delBoxRecord`, `listBoxRecords` throw
  and give the record; each `try` twin answers instead (STYLE.md, *Naming*: `tryFoo`). They accept a duck record, fill
  in defaults, and hand the vaultDB a full ask, which it checks strictly.
* **The models do not depend on the cache.** `Bank` holds no `QueryCacheOpts` and imports nothing from `minding/`. The
  vaultDB has one source, not two (`Device` and `BankOpts` each hold one now).
* **The classifier is lean.** `AdapterVaultDB`'s protected `classify*` methods pass through to plain functions, no store
  overrides them, and they go. The memory store and a store that decides (Postgres, and Convex after it) both compose
  the same exported steps.

## safebyok/cached

* **One way into the cache.** Every record enters through `#doDeliverRecord`: a get's answer, a notice, a write's
  answer, a listing, and each Thing that `tracked` or `world` carries. The get's `queryFn` stops writing the cache
  itself.
* **Each minder holds its own watch, and the minders know nothing of each other.** A minder's `receive` drops the
  notices of other kinds. A change to the bank, the main gate or the root box comes back as that Thing's own notice,
  through `tracked`, so no minder delivers `world`.
* **The bank builds the asks.** `makeGetAsk`, `makePutAsk`, `makeDelAsk` and `makeListAsk` move from `VaultDB` to
  `Bank`, and fill in the bank's scope, the modelkind and `track` (the bank, its main gate and its root box). The
  ThingMinder is a strict public primitive: `get` and `tryAt` take one full ask, made by `minder.makeGetAsk`, with
  `staleTime` and `ifStale` in it and no `opts`.
* **`listen`.** A host subscribes to a minder's records through one `QueryCache.subscribe`, filtered by the minder's
  `keyPrefix`. The listener gets the answer `tryAt` would give, `vacant` once the entry is removed.
* **Trouble with no caller goes to the device's `onBadNews`** (ported from big), whose default warns on the device's
  logger: the watch's trouble, and a host listener that throws.
* **The box listing.** A box minder lists the boxes one label under the root box. Each listed box enters the cache as
  a sparse record, marked stale, so the next get fetches it whole. The dead `#tsqListAskOf` goes, and its two safety
  hatches with it.
* **Storage going backward is not served as fresh.** Where storage answers a get with a record older than the cached
  one (a lost row, a rollback), the entry stops counting as timely, rather than staying fresh until `goodbye`. A late
  answer that only lost a race stays as `notes/wontfix.md` describes.
* **`VoidSentinel` is a whole tombstone**, with every field a tombstone has. `isVoidSentinel`, `gotAnswerOf` and box
  citing change with it. A box under the root cites its own shell.
* **One `shellOf`**, in shapes-thing, replacing `voidSentinelOf` and `Bank.#shellOf`. Its forms are
  `shellOf({ ...scope, labelpath, lifepath? })`, with any life at that scope or none for a root, and
  `shellOf({ ...scope, label | labelpath }, { labelpath, lifepath })`, with the parent's two strings or any parent
  record. No `lifeseq` input.
* **The minder's inputs.** It takes `make(recordish, livepropsAndOpts, friend)`, with the friend
  `Pick<Bank, 'scope' | 'rootBox' | 'makeGetAsk' | 'tellBadNews'>` (the root box only to seed the box minder's cache)
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
* The batch ask (*Batch Ask*, below): a generic batch of writes, built when convenient, replacing `tryBirthBank`. Its
  answer's shape matters most, then its ask's. Until it is built, `doBirthBank` takes the ask alone, and `tryBirthBank`
  answers in the batch answer's final shape.
* A subscription to one record's feed on the minder, so the bank follows its own revisions and `track` stops carrying
  rows it has already seen.
* A bank's lives sharing a lifeseq (TODO.md).
* Exporting `PostgresVaultDB`, once `safebyok` publishes; a Convex vaultDB built on the Postgres pattern; a GraphQL
  vaultDB.
* Moving the adapters, `safebyok-react`, the demo and e2e off `safebyok-big`.

## Order of operations

1. Done: the doc-block branch, rebased onto #707, as its own PR (#708).
2. Done: T2 `minder_buttonup`, stacked on it (#709):
   1. the minder's inputs, cache options and lifecycle;
   2. one way into the cache;
   3. `VoidSentinel`;
   4. the bank minder's `receive`, routing gates and boxes;
   5. `listen`;
   6. the box listing;
   7. storage going backward;
   8. keys and names.
3. The signature PR (`#pass-it-whole`): the signature hunt's clear wins 1-8, 10 (`doBirthBank(ask)`) and 12, the
   cosmetic fixes, `judgeStrength(device, scope, cleartext)`, `clear` becoming `cleartext` in code, and `tryBirthBank`
   answering in the batch answer's shape: `act: 'born' | 'noop'`, `val` keyed by slot (`bank`, `gate`, `box`).
4. The classifier tidy, and the models off the cache: each classifier takes one step's fetch as one bag; each ask's
   caller-stated type is `Z.input` of a defaulted twin of its strict schema, and its builder one `safeParse`;
   `Bank.queryCacheOpts` goes.
5. T3 `bank_box_errors`: answers by kind, then a box's methods off its Sealer, with the Coach.

## Batch Ask

One request, several Things, one atomic step.
A batch ask carries slot asks, each a get, list, put or del of a Thing in one bank, under its slotlabel.
The store runs them in one atomic step, and answers each slot under its label.

```ts
type BatchAsk = Readonly<{
  op:        'batch',
  userid:    string                                  // the bank every slot is in
  banklabel: string
  policies:  Readonly<{ transaction: TransactionPolicy }>
  track?:    Track
  asks:      readonly (readonly [slotlabel: string, ask: SlotAsk])[]
}>
type SlotAsk           = Omit<GetThingAsk | ListThingsAsk | WriteThingAsk, 'track'>
type TransactionPolicy = Readonly<{ commit: 'all', okact?: GoodAct }>   // okact defaults to 'done'

type BatchAnswer = Readonly<{
  ok:       true
  act:      'noop' | 'done' | GoodAct                // 'noop': rolled back; otherwise the okact
  world:    WorldRecord | null
  tracked?: Tracked
  ask:      Pick<BatchAsk, 'op' | 'policies'>        // the batch's own fields; each slot carries its own ask
  val:      Readonly<Record<string, SlotAnswer>>
}>
type SlotAnswer = Omit<GoodAnswer, 'world' | 'tracked'> | Omit<BadAnswer, 'world' | 'tracked'>

type BatchBadAnswer = Readonly<{
  ok:       false
  act:      BadAct                                   // the step itself failed: storage unavailable, or a storage issue
  world:    WorldRecord | null
  tracked?: Tracked
  ask:      LoggableBatchAsk                         // the whole ask, each slot's ask loggable
  err:      VaultError
}>
```

**The step.**

A batch promises only what a birth needs, and no more:

* **All or none.** With `commit: 'all'`, the only commit policy offered at current time, either every write lands or
  none does.
  - Where any slot refuses, nothing is written, and the batch answers `ok: true`, `act: 'noop'`.
  - Otherwise every write lands, and the batch answers its `okact`.
* **Each record is observed at or after the end of the step, when `ok`=true**
  - That holds for every slot's `val` and `dbhas`, and for `world` and `tracked`.
    Nothing else is promised about when: two records in one answer may have been observed at
    different moments, and either may have changed since.
  - With `ok=false`, consistent timing may not be guaranteed even if the adapter otherwise provides it

What a store does to give more is its own affair, and no caller may rely on it. The levels, weakest first, and what gives
each:

1. *All or none*: the writes run in one database transaction (one Postgres function call is one). Each write locks the
   row it writes until the transaction ends, so another writer of that row waits for it; an insert over a key another
   transaction is inserting waits for that one to end.
2. *Observed at or after the end*: the store reads each record back after its writes, in the same call or later.
3. *Observed at one instant* (a snapshot across slots): every record is read in one statement, or under `REPEATABLE
   READ`.
4. *Serializable*, as if batches ran one at a time: `SERIALIZABLE` isolation, or a lock taken for it, which is a last
   resort.

A birth needs 1 and 2 only. Each store known *at current time* guarantees *All or none* an *Observed at or after the end*

**Every slot is answered**, as a lone ask would be answered over the same rows:

* Each slot gives the answer it would give as a lone ask, whether the batch committed or rolled back. In a batch that
  rolled back, a slot that passed still answers, say, `replaced`, and the slot that refused gives its `BadAnswer`, with
  `dbhas`, so the failing slot announces itself. The batch's `act: 'noop'` is what says nothing landed.
* A store is permitted, but discouraged, to answer a slot otherwise than it would answer a lone ask, in success or
  failure: each departure leaves a caller guessing at what happened.
* `world` and `tracked` come once, for the batch. No slot answer carries them.
* `ok: false` means the step itself failed: storage unavailable, or a storage issue. Then no slot is answered, and the
  answer echoes the whole ask.

**Slots.**

* Slotlabels are unique, and each passes the label check or the labelpath check:
  - A label is lowercase alphanumbar (`a-z0-9_`), starts with a letter, and does not end in `_` or contain `'__'`
  - A labelpath starts with a label followed by zero or more labels separated by `'/'`
  - No slotlabel can be mistaken for an integer.
* The return order of slots in the answer is unspecified: read each answer by its slotlabel.
* The execution order of slots is unspecified *at current time*
* `AdapterVaultDB` must keep the asks in the array order given, so a store that chooses to guarantee an order can.
* A slot carries no `track`: the batch's `track` speaks for the whole step.

**The helper** is generous. It takes the asks as any of these:

* an ordered bag: written order is kept, since no slotlabel is integer-like;
* an array of `[slotlabel, niceask]` pairs;
* an array of niceask, each under its labelpath.

A niceask is a draft Ask or a string
A string is validated to be a labelpath and generates the implied get ask:
    `{ op: 'get', ...bankscope, labelpath, modelkind, ifAbsent: 'nil' }`.

**A birth is a batch** of three puts

* each cites its void shell, with `commit: 'all'` and `okact: 'born'`.
* A birth that loses the race answers `noop`:
  - each slot's `dbhas` carries the root the winner stored.
* A successful birth answers `'born'`

`tryBatch` replaces `tryBirthBank`.
It takes `doBirthBank`, `birthPutsOf`, `BirthPuts`, `classifyBirthBank`, `unwrittenBirthOf` and
`BankRootsFetched` with it, and Postgres's `safebyok_birth_roots` becomes one generic batch function.

**Changes to every ask.**

* `policies` sits on the ask itself, not inside `options`. It is optional and keyed by policy name:
  `{ [policyname]: PolicyShapes[policyname] }`.
  - A gate put names `policies: { replace_passphrase: {} }` in place of `options: { policies: ['replace_passphrase'] }`.
  - That changes what the Postgres policy check reads: a behaviour change atop the same tables, so `SqlRevision`
    bumps from `r000` to `r001`.
* `track` stays optional.
