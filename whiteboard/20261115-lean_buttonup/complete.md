# What "functionally complete" means for the new core

What `safebyok/core` (the gate, the lease, the models, and the vaultDB they write through) and the caching layer,
called `safebyok/cached` here (the ThingMinder; not yet an entry point), must do to be functionally complete. What
PR #707 built (the vaultDB's verbs on bank, gate and box, the battery, `PostgresVaultDB`, `world` and `track` /
`tracked`) is left out. *Sprint Notes*, below, has the steps to get there.

## Features

### safebyok/core

* **Bank's box verbs answer by kind:** `GetAnswer<RecordT>`, `WriteAnswer<RecordT>`, `WriteAsk<RecordT>`.
* **`CoreBox` is the box's record-level class, and the sealer of its whisper.** A class of statics beside `Bank` and
  `Gate`, which are renamed `CoreBank` and `CoreGate` when the instance model's subclasses arrive.
* **The bank's box verbs take and give records:** `getBoxRecord`, `putBoxRecord`, `delBoxRecord` and `listBoxRecords`
  throw and give the record, and each `try` twin answers instead. They accept a duck record, fill in defaults, and
  hand the vaultDB a full ask, which it checks strictly.
* **DONE** *The bank builds the asks.* `makeGetAsk`, `makeListAsk`, `makePutAsk` and `makeDelAsk` fill in the
  bank's scope, the modelkind, and `track` for the bank, its main gate and its root box.
* **Each ask has a draft and a full form, from one schema.** The draft (`GetAskDraft`, `ListAskDraft`,
  `PutAskDraft`, `DelAskDraft`) leaves its defaulted fields optional, and is `Z.input` of a defaulted twin of the strict
  schema. The full form takes the brief name (`GetAsk`, `ListAsk`, `WriteAsk<RecordT>`), and the vaultDB demands it.
* **The birth is an ensure,** answering the roots stored over a complete bank. Its redesign, the bank as a function of
  the main gate, is whiteboarded in `whiteboard/20261116-world_function/world_function.md`, a later thread.
* **The models do not depend on the cache.** `Bank` holds no `QueryCacheOpts` and imports nothing from `minding/`. The
  vaultDB has one source, not two.
* **The classifier is lean.** The memory store and a store that decides (Postgres, and Convex after it) compose the
  same exported steps, and each classifier takes one step's fetch as one bag.
* **DONE** *Postgres's functions are versioned* by name, `safebyok_t01_r000_<stem>`: the head changes with the
  tables, the tail with behaviour atop the same tables.

### safebyok/cached

* **DONE** *One way into the cache.* Every record enters through `structuralSharing` (`betterRecordOf`): a get's
  answer as its `queryFn` returns it, and a notice or a listing through `#doDeliverRecord`.
* **DONE** *Each minder holds its own watch, and the minders know nothing of each other.* A change to the bank, the
  main gate or the root box comes back as that Thing's own notice, through `tracked`.
* **DONE** *The ThingMinder is a strict public primitive.* `get(ask, opts)` and `tryAt(ask, opts)` take the bank's
  full get ask, `track` included, and send it to storage exactly as given. `opts` are the call's overrides of the
  minder's own settings.
* **DONE** *Minders serve a born bank.* Before its birth, a get or a list refuses.
* **DONE** *`listen`.* The listener gets the answer `tryAt` would give, `vacant` once the entry is removed.
* **DONE** *Trouble with no caller goes to the device's `onBadNews`,* whose default warns on the device's logger:
  the watch's trouble, and a host listener that throws.
* **DONE** *The box listing.* A box minder lists the boxes one label under the root box. Each enters the cache sparse
  and stale, so the next get fetches it whole.
* **DONE** *Storage going backward is not served as fresh.* A get whose answer is older than the record cached
  before it refuses `stale_read`, and the newer record stays. A late answer that only lost a race stays as
  `notes/wontfix.md` describes.
* **DONE** *The void sentinel is the shell of its scope,* a whole tombstone, made by one `shellOf`.
* **DONE** *The root box stays cached* while the box minder minds, whatever a host's `gcTime`.
* **DONE** *Cache options are fixed where hosts can't safely choose them.* `networkMode` is `'always'` and `retry` is
  off; `staleTime` defaults to an hour.
* **DONE** *Lifecycle.* `hello` is idempotent, and `goodbye` empties the minder's entries and query defaults.

## Not part of this push

* The instance-based model in front of the minder: sugared calls and a sync/async collection interface. Its API is
  designed afterwards, from what this push teaches, and design-minder.md is rewritten then.
* Error handling and consistency checks in the minder.
* Trees: boxes deeper than one label, gates beyond the main gate (which will control adding and removing them), and
  bringing a parent to life.
* What `maingate` names: the root gate, or the gate that authorized the caller. (Proposed: the world carries the
  gate the caller came in through; `whiteboard/20261116-world_function/world_function.md`.)
* A box birth checking that its parent is live (TODO.md).
* The batch ask (*Batch Ask*, below): a generic batch of writes, built when convenient, replacing `tryBirthBank`. Its
  answer's shape matters most, then its ask's.
* A subscription to one record's feed on the minder, so the bank follows its own revisions and `track` stops carrying
  rows it has already seen.
* A bank's lives sharing a lifeseq (TODO.md).
* Exporting `PostgresVaultDB`, once `safebyok` publishes; a Convex vaultDB built on the Postgres pattern; a GraphQL
  vaultDB.
* Moving the adapters, `safebyok-react`, the demo and e2e off `safebyok-big`.

## Sprint Notes

### 1. The doc-block branch (#708)

* **DONE** Plain-English doc blocks across `packages/safebyok/src`, rebased onto #707 and made coherent with its code.

### 2. T2 `minder_buttonup` (#709)

* **DONE** `VaultDB`'s `getAsk`, `putAsk`, `delAsk` and `listAsk` removed; `Bank` gains `makeGetAsk`, `makeListAsk`,
  `makePutAsk`, `makeDelAsk` and a `track` getter, and its verbs use them.
* **DONE** `GetAskArgs`, `ListAskArgs`, `PutAskArgs`, `DelAskArgs`, `BankAskArgs` and `GetBoxArgs` renamed `GetAsk`,
  `ListAsk`, `PutAsk`, `DelAsk`, `BankAsk` and `GetBoxAsk`; every parameter of them is named `ask`.
* **DONE** `track` gains a third fixed key, the root box at `box`, in both stores; Postgres gains `safebyok_root_box`,
  and each write function returns the root box after the write.
* **DONE** The roster (`MinderRoster`), `#routeWorld`, `#route` and `make`'s `minders` input removed; `receive` drops
  notices of other kinds.
* **DONE** The get's `queryFn` stops writing the cache; `#doGet` reads the cache after the fetch, since TanStack's
  `query()` resolves with the raw value the `queryFn` returned.
* **DONE** The friend is `Pick<Bank, 'scope' | 'rootBox' | 'makeGetAsk' | 'makeListAsk' | 'tellBadNews'>`; `rootBox`
  only seeds the box minder's cache, in `hello`.
* **DONE** `onBadNews`, `DefaultOnBadNews` and `tellBadNewsTo` ported from big into `Device`; `bank.tellBadNews`
  passes through to it, and `#reportTrouble` calls it. The minder's own `onBadNews` and its ended-bank check removed.
* **DONE** `voidSentinelOf`, `Bank.#shellOf` and `#voidSentinelAt` replaced by `shellOf`, with forced defaults for
  the shell's fixed fields. The shell's lifeseq is `'-000000001'`.
* **DONE** `seqOfLifeseq` and `lifeseqOf` renamed `lifenumOfLifeseq` and `lifeseqOfLifenum`.
* **DONE** `stale_read` added to big's refusal kinds (family `condition`) and to `CustomerKinds`; the wontfix entry
  "The ThingMinder detects no conflict among the records it holds" amended.
* **DONE** `listen` translates TanStack's events into answers, and catches a listener's throw.
* **DONE** `goodbye` during a get refuses `disabled`, not TanStack's `CancelledError`.
* **DONE** The box minder holds a `QueryObserver` (`enabled: false`) on the root box from `hello` to `goodbye`.
* **DONE** `isStaleAt(ask, opts)` and `#answerOfTSQ(ask, opts)`.
* **DONE** The dead `#tsqListAskOf` and its two safety hatches removed.
* **DONE** `queryKey` names the modelkind once; `pins` becomes `ties`; `isLifeOff` becomes `isLifeMismatch`.
* **DONE** `TableVersion` and `SqlRevision` name every Postgres function; old versions stay installed.

### 3. The signature PR (`#pass-it-whole`)

* The signature hunt's clear wins 1-8 and 12, and its cosmetic fixes (`notifyTrackedRecords` named `(ask, answer)`;
  `Bank`'s constructor takes `(record, opts)` and parses first).
* `judgeStrength(device, scope, cleartext)`.
* `clear` becomes `cleartext` in code (19 uses).
* Not done: 10, `doBirthBank(ask)` and `tryBirthBank` answering in the batch answer's shape, was reverted from #713.
  Its bank put went to `ifPresent: 'fail'`, which made the birth create-only. The birth is redone in
  `whiteboard/20261116-world_function/world_function.md`.
* The asks' drafts and full forms renamed, in one commit, drafts first: `GetAsk`, `ListAsk`, `PutAsk`, `DelAsk`,
  `BankAsk` and `GetBoxAsk` become `GetAskDraft`, `ListAskDraft`, `PutAskDraft`, `DelAskDraft`, `BankAskDraft` and
  `GetBoxAskDraft`; then `GetThingAsk`, `ListThingsAsk` and `WriteAskOf` / `WriteThingAsk` become `GetAsk`, `ListAsk`
  and `WriteAsk<RecordT>`. VOCABULARY.md gains **draft**.

### 4. The classifier tidy, and the models off the cache

* `AdapterVaultDB`'s protected `classify*` pass-throughs removed.
* Each classifier takes one step's fetch as one bag (the hunt's 17, with 11 and 13).
* Each ask's draft becomes `Z.input` of a defaulted twin of its strict schema, and its builder one `safeParse`.
* `Bank.queryCacheOpts` removed.

### 5. T3 `bank_box_errors`

* Answers by kind; Bank's box verbs lose the `otherThanBox` check, the `answer.val as BankThing` cast, and the
  ended-bank check repeated in five methods (`disabledAnswerOf`).
* `CoreBox`: `nextRevisionOf`, `tombstoneOf`, and the Sealer's members (`tags`, `purposes`, `stampsOf`, `encode`,
  `decode`, `sealedOf`, `recordOf`), with `CoreBox satisfies Sealer`. The Sealer loses `nextRevisionOf`, and the lease
  takes the sealer itself, not a kind string, so `sealerkindVals`, `BoxWhisper`, `BoxTombstone` (the sealer) and
  `sealerOf` go. `sealBox`, `tombstoneBox` and `unsealBox` stay on the bank, which holds the lease.
* The bank's record verbs: `getBoxRecord`, `putBoxRecord`, `delBoxRecord`, `listBoxRecords` and their `try` twins.
* The bank and gate stamp pair spelled one way (the hunt's 14), after `notes/guarantees-big.md`'s check.

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

1. *All or none* (#all-or-none): the writes run in one database transaction (one Postgres function call is one). Each write locks the
   row it writes until the transaction ends, so another writer of that row waits for it; an insert over a key another
   transaction is inserting waits for that one to end.
2. *Observed at or after the end* (#seen-at-commit / #seen-after-commit): the store reads each record back after its writes, in the same call or later.
3. *Observed at one instant* (a #snapshot across slots): every record is read in one statement, or under `REPEATABLE
   READ`.
4. *Serializable* (#needs-lock), as if batches ran one at a time: `SERIALIZABLE` isolation, or a lock taken for it, which is a last
   resort.

A birth needs 1 and 2 only. Each store known *at current time* guarantees *All or none* and *Observed at or after the
end*. `notes/transaction-levels.md` sets these handles against Postgres's rungs, and finds that nothing in Postgres
reads "at commit": #seen-at-commit is better named #still-true-at-commit.

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
