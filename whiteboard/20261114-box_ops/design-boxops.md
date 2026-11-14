# Box ops: get, write and list boxes as Things

Thread `20261114-box_ops`, worktree `/workspace/byok-box_ops`. The vaultDB stores two more kinds of Thing, the box and
the bank. It lists the children of a Thing, and it writes a new bank's first Things in one step. On the model side, the
bank seals a box into the record the vaultDB stores, signs a box's tombstone, and offers the box flows as methods.

**proposed**, **cited** and **actual** are defined in [design-vaultdb.md](../20261114-vault_db/design-vaultdb.md).

## Labelpaths and lifepaths

* **A labelpath is a modelkind, then zero or more labels**, joined by `/`: `box`, `box/openai`. A Thing whose
  labelpath is its modelkind alone is the **root** of its kind. A root's label is its modelkind.
* **A lifepath has one lifeseq for each segment of the labelpath**, joined by `/`. The first is the root's, and the
  last is the Thing's own. The root box's lifepath is `<lifeseq>`, and a box under it has `<root's lifeseq>/<lifeseq>`.
  Every kind's check demands the two counts match.
* **A Thing's lifepath starts with its parent's**, so the Things under an earlier life of a parent are not its
  children. A shell's lifepath is its parent's, then `/-1`. A root's shell has `-1`.
* **A write keeps the leading lifeseqs of the lifepath it cites.** It does not check that they are the parent's
  current life. That check is design-vaultdb.md's "the row above's life", and it comes with nested boxes.

## The box as a Thing

| Field        | A box                                                    | Big's box row                      |
| ------------ | -------------------------------------------------------- | ---------------------------------- |
| `userid`     |                                                          | `user_id`                          |
| `banklabel`  |                                                          | `banklabel`                        |
| `labelpath`  | `box/<label>`; the root box's is `box`                   | `vaultlabel`, `boxlabel`           |
| `label`      | the last segment of the labelpath                        | `boxlabel`                         |
| `fmt`        | `BoxThingFormat`, 5103                                   | 5003                               |
| `lifepath`   | `<root's lifeseq>/<lifeseq>`; the root box's `<lifeseq>` | `bank_tok`, `vault_tok`, `box_tok` |
| `lifeseq`    | a base-32 integer string                                 | `box_tok`                          |
| `revtok`     |                                                          | `revision_tok`                     |
| `revseq`     |                                                          | `revision_seq`                     |
| `born_at`    |                                                          | `registered_at`                    |
| `written_at` |                                                          | `written_at`                       |
| `am`         | `'a'` live, `'x'` gone                                   | `am`                               |

The **body** is every field of a record besides its Thing fields. The store carries it but does not read it.

| Body field       | Live box | Tombstone             | Kind (VOCABULARY.md) |
| ---------------- | -------- | --------------------- | -------------------- |
| `sidecar`        | yes      |                       | unencrypted          |
| `whisper_sealed` | yes      | yes, an empty whisper | sealed               |

```ts
/** One sealed part of a record: a fresh key wrapped under the bankKey, the cleartext ciphered under that key, and the tags its unseal reads. */
export interface Sealed {
  key_wrapped: CX.Ciphered
  ciphered:    CX.Ciphered
  /** How the cleartext was turned into text before it was ciphered. */
  codectag:    string
  /** The customer's tag for the schema of the cleartext. */
  schematag:   string
}

/** `RecordT` with each part `CleartextsT` names sealed, at `<part>_sealed`. */
type SealedOf<RecordT, CleartextsT> =
  Omit<RecordT, keyof CleartextsT> & { [K in keyof CleartextsT & string as `${K}_sealed`]: Sealed }

/** `RecordT` with each `<part>_sealed` that `CleartextsT` names unsealed, at `<part>`. */
type UnsealedOf<RecordT, CleartextsT> =
  Omit<RecordT, `${keyof CleartextsT & string}_sealed`> & CleartextsT
```

* **Each sealed part of a record is a `Sealed`, at `<part>_sealed`.** A box has one part, its whisper. The key, the
  ciphertext and both tags travel together, so any record that seals a part has the same shape for it.
* **`codectag` and `schematag` are visible**: stored in the clear, and bound into the seal's ctx, so a change to
  either refuses the unseal.
* **The root box**, at `box`, is born with the bank and sealed like any other box. A get of it is allowed. Nothing
  lists a root, because nothing lists its parent.
* **A box has two forms**, live and tombstone, each strict. `boxThing` checks either, by `am`.
* **Each kind pins a literal `fmt`**, so a caller narrows a `Thing` by `thing.fmt`.

## The bank as a Thing

| Field       | The bank                 | Big's bank row  |
| ----------- | ------------------------ | --------------- |
| `labelpath` | `bank` (open question 1) |                 |
| `label`     | `bank`                   |                 |
| `fmt`       | `BankThingFormat`, 3101  | 3001            |
| `lifepath`  | `<lifeseq>`              | `bank_tok`      |
| `born_at`   |                          | `registered_at` |

Its other fields are the Thing's, named as in the box's table. It has no body.

* **The vaultDB stores a bank's tombstone** as it does any kind's. What a bank's delete does to its gate and boxes is
  decided where the coordinated operations are built.

## Storage

### Each kind's checks

```ts
const KindChecks = {
  bank: { record: bankThing, cited: bankCited, stored: bankThing.refusingAs('damaged_row'), policies: {}           },
  gate: { record: gateThing, cited: gateCited, stored: gateThing.refusingAs('damaged_row'), policies: GatePolicies },
  box:  { record: boxThing,  cited: boxCited,  stored: boxThing.refusingAs('damaged_row'),  policies: {}           },
}
```

* **Each kind has its own policies.** The gate has its three. The bank and the box have none, and an ask that names a
  policy its kind lacks refuses `bad_option`.
* **`ThingRecord` is the Thing fields** every kind shares. **`Thing` is any kind's record**: `BankThing | GateThing |
  BoxThing`.

### The asks

* **An ask names its op and its modelkind.** A write's op is `put` for a live record and `del` for a tombstone. The op
  picks the act table, `putActOf` or `delActOf`. The modelkind picks the kind's checks, and lets TypeScript narrow the
  record an ask carries. An ask whose modelkind is not its labelpath's first segment, or whose op does not match its
  record's `am`, refuses `bad_option`.
* **The vaultDB builds each kind of ask.** `vaultDB.getAsk(scope)`, `listAsk(scope)`, `putAsk({ cited, record })` and
  `delAsk({ cited, record })` fill in the op, the modelkind and the default policies:

  | Builder   | Policies                                |
  | --------- | --------------------------------------- |
  | `getAsk`  | `ifAbsent: 'nil'`                       |
  | `listAsk` | `ifAbsent: 'fail'`                      |
  | `putAsk`  | `ifAbsent: 'add'`, `ifPresent: 'repl'`  |
  | `delAsk`  | `ifAbsent: 'fail'`, `ifPresent: 'repl'` |

  A verb takes only a whole ask, so every logged ask shows its policies.

### Get and write

The verbs are unchanged. A box can be deleted, which the main gate never is: a `del` of a live box answers `deleted`,
a `put` over its tombstone answers `reborn` at the next lifeseq, and a `del` over a tombstone refuses `dubdel`.

### Listing a Thing's children: `tryListThings`

```
vaultDB.tryListThings(ask: ListThingsAsk) → Promise<ListThingsAnswer>   never throws
```

```ts
/** A record's Thing fields, without its body: what a listing gives of each Thing. */
type Sparse<RecordT extends ThingRecord> = Pick<RecordT, keyof ThingRecord>

/** Get the Thing at this scope, and list its children. */
type ListThingsAsk = ThingScope & { op: 'list', modelkind: Thingkind, ifAbsent: 'fail' | 'nil' }

/** A stored child that fails its kind's checks, named by where it is stored. */
type DamagedThing = ThingScope & { am: 'd' }

/** What every listing answer carries, refused or not: the parent, and the children that failed their checks. */
type ListedBeside<RecordT extends Thing> = { parent: Sparse<RecordT> | null, damaged_rows: DamagedThing[] }

type ListThingsAnswer<RecordT extends Thing = Thing> =
  | (GoodAnswer<Sparse<RecordT>[], EX.GotAct> & ListedBeside<RecordT>)
  | (BadAnswer<Sparse<RecordT>[]>              & ListedBeside<RecordT>)
```

`BadAnswer` takes the type of its `dbhas`, as `GoodAnswer` takes the type of its `val`. Its default is `Thing | null`,
which every other verb keeps.

* **A listing is a get of the parent that also gives its children.** Its act is the parent's: `gotlive`, `gotgone` or
  `gotvoid`, or under `ifAbsent: 'fail'` a refused `void` or `gone`.
* **`val` is the children, sparse**, in labelpath order, byte for byte, as Postgres's `COLLATE "C"` sorts them. A
  full record comes from a get.
* **`dbhas` has `val`'s shape.** A parent that is void or gone has no children, so a refused `void` or `gone` has
  `dbhas: []`.
* **`parent`** is the parent's sparse record, or null for none.
* **Tombstones are listed**, `am: 'x'`, so that a cache learns of a delete from a listing.
* **A child that fails its checks is listed in `damaged_rows`**, and the rest are listed as usual. A row stored
  outside the parent refuses `storage_issue`, because the store is broken.

**Why `val` is a flat list.** Labels are `[a-z0-9_]`, every byte of them above `/`, so labelpath order puts each
Thing's descendants right after it: a depth-first walk of the tree. A listing of a whole subtree gives the same flat
list, each Thing's depth the count of its segments, and a filter narrows it. So `val` is the Things asked for in each
case.

```
adapter.tryListThings(ask)
  try
    const checked     = checkedListThingsAsk(ask)                  bad_option
    const loggableAsk = loggableAskOf(checked)
    const actual      = await this.doListThings(checked)
    const beside      = { parent: actual.parent, damaged_rows: actual.damaged_rows }
    actual.ok ? { ok, ask: loggableAsk, act, world, ...beside, val: actual.children }
              : { ok, ask: loggableAsk, act, world, ...beside, dbhas: actual.children, err }
  catch (thrown)
    return this.answerForThrown(thrown, 'listThings', ask)

store.doListThings(ask)                                            one read
  fetch the raw parent at ask's scope, and every raw Thing one label under it, each with its labelpath
  return this.classifyListThings(ask, fetched)
```

**Memory** keys its map by bank, then labelpath, so that a listing reads one bank's entries.

**The watch** is unchanged: a bank's watch hears its boxes too.

### Birthing a bank: `tryBirthBank`

```
vaultDB.tryBirthBank(ask: BirthBankAsk) → Promise<BirthBankAnswer>   never throws
```

```ts
/** Write a new bank's first Things in one step: the bank, its main gate and its root box. */
type BirthBankAsk = BankScope & { op: 'birth', bank: BankThing, gate: GateThing, root: BoxThing }

type BirthBankAnswer = Answer<{ bank: BankThing, gate: GateThing, root: BoxThing }, 'born' | 'passed'>
```

The bank is unlocked while it is born, so the root box is sealed.

* **Where no bank is stored**, it writes all three, each over the shell, and answers `born`.
* **Where a live bank is stored with its gate and root box**, it writes nothing, and answers `passed` with the three
  Things stored. So a second call does no harm.
* **Where a live bank is stored without its gate or its root box**, it refuses `storage_issue`: someone has to mend the
  store by hand.
* **Where a bank's tombstone is stored**, each of the three is a put citing the shell, so the bank's put refuses as
  any put citing the shell over a tombstone does, and nothing is written. A rebirth has to cite what is stored for each
  of the three, and has to settle what becomes of the gate and root box of the earlier life. That waits on the
  coordinated delete.

### Postgres, as a design

As for the gate, this is not built.

* **`safebyok_boxes`** has the Thing's columns and CHECKs, `sidecar jsonb`, null on a tombstone, and `whisper_sealed
  jsonb NOT NULL`: `CHECK ((am = 'a') = (sidecar IS NOT NULL))`.
* **`safebyok_banks`** has the Thing's columns alone.
* **The Thing's CHECKs change for roots, and for lifepaths with no leading `/`:**

  | Now                                                    | Refuses                              | Becomes                                                                                              |
  | ------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
  | `right(labelpath, length(label) + 1) = '/' \|\| label` | a root, whose label is its labelpath | `label = substring(labelpath from '[^/]*$')`                                                         |
  | `right(lifepath, 11) = '/' \|\| lifeseq`               | a root's lifepath, its lifeseq alone | `lifeseq = substring(lifepath from '[^/]*$')`                                                        |
  | (none)                                                 |                                      | `array_length(string_to_array(lifepath, '/'), 1) = array_length(string_to_array(labelpath, '/'), 1)` |
  | the gate's `lifepath = '/' \|\| lifeseq`               | every gate                           | `lifepath = lifeseq`                                                                                 |

* **`safebyok_write_box(proposed, cited)`** is the gate's write function without the policies.
* **The listing** is two SELECTs on the primary key: the parent's row, and its children's range,
  `labelpath >= 'box/' AND labelpath < 'box0'`, filtered to one more segment and to the parent's lifepath.
* **`safebyok_birth_bank(bank, gate, root)`** inserts the three rows in one call, which Postgres runs atomically.

## The models

### The types

| Type            | What it holds                                                          | What it is for                                             |
| --------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `BoxRecord`     | a live box as stored: its Thing fields, `sidecar` and `whisper_sealed` | what the vaultDB stores                                    |
| `BoxTombstone`  | a deleted box as stored: its Thing fields and `whisper_sealed`          | the same, for a deleted box                                |
| `BoxSparse`     | a box's Thing fields alone, live or a tombstone                        | what a listing gives; with a sidecar, what `sealBox` takes |
| `BoxCleartexts` | `{ whisper }`                                                          | what `bank.sealBox` ciphers                                |
| `BoxUnsealed`   | `UnsealedOf<BoxRecord, BoxCleartexts>`: Thing fields, sidecar, whisper | what `bank.unsealBox` gives                                |

The seal makes the next revision itself, so it needs no draft type: what it takes is the prior box's Thing fields
with the sidecar to store.

### The bank's box methods

* **`bank.sealBox(prior: BoxSparse & { sidecar: Sidecar }, cleartexts: BoxCleartexts): Promise<BoxRecord>`** gives the
  live box next after `prior`. Over a live box that is its next revision. Over a tombstone or a shell it is the first
  revision of the next life. It reads the Thing fields and the sidecar of `prior`, and ignores the rest, so a stored
  record spread with a new sidecar will do.
* **`bank.tombstoneBox(prior: BoxSparse): Promise<BoxTombstone>`** gives the tombstone of a live box: its next
  revision at the next lifeseq, sealing an empty whisper. Given a tombstone or a shell, it refuses `bad_option`: a
  tombstone's lifeseq is odd, and the next one is a live box's.
* **`bank.unsealBox(box: BoxRecord | BoxTombstone)`** checks the seal and gives the box unsealed. A tombstone's gives
  its Thing fields and its empty whisper, and the check is its signature.
* **Each method checks the box is the bank's own.** `bank.#demandOwnBox(box)` parses the box by its own shape,
  returns it, and refuses `record_conflict` unless its `userid` and `banklabel` are the bank's and its lifepath starts
  with the lifeseq of the bank's root box.
* **Two sealers**, `Sealers.BoxWhisper` and `Sealers.BoxTombstone`, seal the same part. Each `nextRevisionOf` gives
  the revision its method promises. They and their helpers live in `models/sealers.ts`.
* **The seal binds** the bank's stamp, then the box's Thing fields, then `codectag` and `schematag`. A security
  reviewer should see this change: it goes into `notes/security.md` through a `sonnet` subagent when it is built.

### The bank on its Thing

The Bank model is made from the bank's Thing, its gate and its root box. Nothing more comes over from big's bank row
until something needs it.

| Prop                   | Big's Bank                                          | The bank on its Thing                       |
| ---------------------- | --------------------------------------------------- | ------------------------------------------- |
| `userid`               | `user_id`                                           | `userid`, as the Thing names it             |
| `banklabel`            | `banklabel`                                         | `banklabel`                                 |
| `lifeseq`              | `bank_tok`                                          | `lifeseq`; `bank_tok` is dropped            |
| `born_at`              | `registered_at`                                     | `born_at`                                   |
| `revtok`, `revseq`     | `revision_tok`, `revision_seq`                      | `revtok`, `revseq`                          |
| `written_at`           | `written_at`                                        | `written_at`                                |
| `stamp`                | `user_id`, `banklabel`, `bank_tok`, `registered_at` | `userid`, `banklabel`, `lifeseq`, `born_at` |
| `scope`                | `user_id`, `banklabel`                              | `userid`, `banklabel`                       |
| `maingate`             | the main gate                                       | the main gate                               |
| `rootBox`              |                                                     | the root box's sparse record                |
| `device`, `device_tok` | the device                                          | unchanged                                   |
| the lock and its guards, `modelkind` | the model's own                       | unchanged                                   |

**The stamp binds the bank's lifeseq in place of `bank_tok`.** Every ctx binds the stamp first, each wayin's among
them, so a wayin stored today does not unwrap after the change: it fails safe as damaged, and the changeset says so.

### Light sugar on the bank

The bank is given a VaultDB when it is made. Each method fills in the bank's scope and the modelkind.

* **`bank.rootBox`**: the root box's sparse record, held since the bank was made.
* **`bank.tryListBoxes()`**: `tryListThings` of the root box.
* **`bank.tryGetBox({ labelpath, ifAbsent })`**: `tryGetThing`, with one more `ifAbsent`, `'shell'`, which gives the
  box's shell under the root box where none is stored.
* **`bank.tryPutBox({ cited, record })`** and **`bank.tryDelBox({ cited, record })`**: `tryWriteThing` of `putAsk`
  and `delAsk`.

### Signed tombstones

* **A tombstone's `whisper_sealed`** seals an empty whisper under a fresh key, bound to the bank's stamp and the
  tombstone's Thing fields. Unsealing it checks them.
* **It catches** a tombstone that storage made up, or wrote over a live box. Checked, such a tombstone refuses as
  damaged instead of reading as the user's delete. Every record a device writes is then sealed.
* **It does not catch** storage removing a row, which reads as void, or putting back an older revision that was
  genuine.
* **It costs** a key for every delete: a box is deleted only while the bank is unlocked. Checking a tombstone needs
  the bank unlocked too.
* **It counts only where something checks it.** `bank.unsealBox` checks a tombstone, so a cache that unseals what it
  receives checks tombstones as well.

### The box flows, end to end

```
list    const listed  = await bank.tryListBoxes()          // vaultDB.tryListThings(vaultDB.listAsk({ userid, banklabel, labelpath: 'box' }))
        const root    = bank.rootBox                       // the same root as listed.parent

put     const got     = await bank.tryGetBox({ labelpath: 'box/openai', ifAbsent: 'shell' })
        const prior   = got.val                            // the stored box, its tombstone, or its shell
        const old     = (prior.am === 'a') ? await bank.unsealBox(prior) : null
        const whisper = { ...old?.whisper, apicalls: (old?.whisper.apicalls ?? 0) + 1 }
        const record  = await bank.sealBox({ ...prior, sidecar }, { whisper })
        await bank.tryPutBox({ cited: prior, record })     // vaultDB.tryWriteThing(vaultDB.putAsk({ cited: prior, record }))

delete  const record  = await bank.tombstoneBox(prior)
        await bank.tryDelBox({ cited: prior, record })     // vaultDB.tryWriteThing(vaultDB.delAsk({ cited: prior, record }))
```

## Guarantees loosened, dropped or changed, against big

1. **No vault.** Its lifecycle and its acts (`vault_void`, `vault_gone`, `vault_reborn`) are gone. A boxlabel is
   unique in its bank, not in a vault. Nested boxes bring the grouping back.
2. **A write does not check a box's parent.** Big refused a box op in a bank or vault that was not live under its
   tokens (`bank_*`, `vault_*`). A listing leaves out the boxes of an earlier life of the root box, but a write over
   one is not refused. The check comes back with nested boxes.
3. **No box cap.** Big's Postgres `safebyok_birth_box` counts the box rows of a vault's life, tombstones included, and
   refuses a new box once there are `maxboxes`. A revision is not counted. Here nothing counts. The cap comes back as
   the box's first policy, through design-vaultdb.md's `safebyok_capacity_ok`.
4. **A box of another life is checked against the root box.** Big refused a box whose `bank_tok` was not the bank's,
   `record_conflict`, at `bank.sealBox` and `bank.unsealBox`. Here those methods refuse a box whose lifepath does not
   start with the lifeseq of the bank's root box, with the same refusal.
5. **No `tidyGone`.** Tombstones are kept, and listed.
6. **A delete needs the bank unlocked.** Big deleted a box with no key. A delete is now authenticated.
7. **A listing's act says what the parent is, not whether it has children.** Big's listing answered `got` when it
   found boxes and `gotvoid` when it found none. Here a live parent answers `gotlive` with or without children, and an
   empty one gives `val: []`. A caller that read `gotvoid` as "no boxes" reads `val.length === 0` instead.
8. **The bank's stamp binds its lifeseq, not a random `bank_tok`.** Each life of a bank has a new bankKey, so a wrap
   from an earlier life opens only to that life's key. What the random token added: a wrap never opens in another life,
   even where storage loses the bank row and a bank is born again at the same lifeseq.

## Guarantees abandoned

* **The sparse form leaves out the codec fields**, which big's `BoxSparse` had.

## Building it

Three PRs, each stacked on the one before:

1. **Storage**: roots, lifepaths with no leading `/` and one lifeseq per segment, `put` and `del` with a modelkind,
   the ask builders, the bank and box kinds and their policies, `tryListThings`, `tryBirthBank`, the memory store, and
   their tests.
2. **Sealing**: `Sealed` at `<part>_sealed`, `SealedOf` and `UnsealedOf`, the two box sealers, signed tombstones,
   `sealBox`, `tombstoneBox` and `unsealBox`, and the security note.
3. **The bank on its Thing**: its props, `rootBox`, the stamp, and the sugar, with one test of the flows above
   through `MemoryVaultDB`. Then design-vaultdb.md and design-gate.md are brought up to date.

## Open questions

1. **The bank at `bank`, or at `bank/<banklabel>`.** I recommend `bank`. Every scope carries the banklabel, so bob's
   bank is `(userid, 'bob', 'bank')` and alice's is `(userid, 'alice', 'bank')`: a user's banks are apart with nothing
   more. `bank/bob` repeats the banklabel, which a check must then hold equal to the scope's. It also puts the bank at
   depth 2 under a root bank that is never stored, so its lifepath breaks one lifeseq per segment. It would earn its
   place if a listing could name a user without a bank, to list their banks, and no scope does that yet.
2. **The main gate as the root gate, at `gate`.** One lifeseq per segment puts `gate/main` at depth 2, under a root
   gate that is never stored. I recommend the main gate move to `gate`, with label `gate`. Then every root is at depth
   1, a get of `gate` answers the main gate, and later gates nest under it. The other way exempts the gate from the
   rule. Either changes the gate's stored shape.
3. **A tombstone's seal: an empty whisper, or a key alone.** Your table had no `whisper_sealed` on a tombstone, but
   something has to carry its signature. I recommend an empty whisper: a tombstone then has a live box's sealed part,
   read by the same unseal, for a few dozen bytes. A key alone is a `Sealed` without its `ciphered`, a shape of its
   own.
4. **The sugar in `safebyok/core`.** `core.ts` says core has no storing and no instance sugar, and `bank.tryPutBox`
   stores. I recommend core take it on and say so: someone who wants only lock, unlock and a few secrets needs them
   stored. The gate and the lease stay apart from storing. Only the bank's sugar touches a VaultDB.
5. **How the bank knows its root box.** I recommend it hold the root box, as it holds its main gate, given by
   `tryBirthBank` or a listing. A rule tying the root's lifeseq to the bank's is your TODO, and nothing here needs it.
6. **The gate's wayins as `Sealed` parts.** They fit the shape, and moving them is a change to the gate's stored
   shape. I recommend a thread of its own after this one.
7. **`Sealed`'s fields.** Your `sealers.ts` has `wrapped`, `codec`, and a ciphered `schematag`, and your doc has
   `key_wrapped`, `codectag`, and a plain `schematag`. I took the doc's: a stored field is underbar_case, and the
   schematag is visible, so a host reads it without unlocking.

## Principles

* **Disable a case only once you can say how it breaks**, and then decide. Never work around it. A get of a root box
  is allowed. A root is never listed because nothing lists its parent, not because it is banned.
