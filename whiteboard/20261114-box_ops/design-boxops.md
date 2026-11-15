# Box ops: get, write and list boxes as Things

Thread `20261114-box_ops`, worktree `/workspace/byok-box_ops`. The vaultDB keeps two more kinds of Thing, the box and
the bank. It lists the children of a Thing, and it writes a new bank's first Things in one step. On the model side, the
bank seals a box into the record the vaultDB keeps, signs a box's tombstone, and offers the box flows as methods.

**proposed**, **cited** and **actual** are defined in [design-vaultdb.md](../20261114-vault_db/design-vaultdb.md).

## Labelpaths and lifepaths

* **A labelpath is a modelkind, then zero or more labels**, joined by `/`: `box`, `box/openai`. A Thing whose
  labelpath is its modelkind alone is the **root** of its kind. A root's label is its modelkind.
* **Each kind's root**: the bank at `bank`, the main gate at `gate`, the root box at `box`. Further gates sit at
  `gate/<label>`, under the main gate, which has authority over them. Gates nest no deeper. Boxes nest to any depth.
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
| `labelpath` | `bank`                   |                 |
| `label`     | `bank`                   |                 |
| `fmt`       | `BankThingFormat`, 3101  | 3001            |
| `lifepath`  | `<lifeseq>`              | `bank_tok`      |
| `born_at`   |                          | `registered_at` |

Its other fields are the Thing's, named as in the box's table. It has no body.

* **The vaultDB keeps a bank's tombstone** as it does any kind's. What a bank's delete does to its gate and boxes is
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
  `delAsk({ cited, record })` parse what they are given with zod, which fills in the op, the modelkind and the default
  policies. Front-end methods call them. Everywhere else an ask is either loggable or wholly checked, and no other
  code fills in a default or a null.

  | Builder   | Policies                                |
  | --------- | --------------------------------------- |
  | `getAsk`  | `ifAbsent: 'nil'`                       |
  | `listAsk` | `ifAbsent: 'fail'`, of the parent                         |
  | `putAsk`  | `ifAbsent: 'add'`, `ifPresent: 'repl'`                    |
  | `delAsk`  | `ifAbsent: 'fail'`, `ifPresent: 'repl'`, neither overridable |

  A verb accepts only a whole ask, so every logged ask shows its policies.

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

/** List the children of the Thing at this scope. */
type ListThingsAsk = ThingScope & { op: 'list', modelkind: Thingkind, ifAbsent: 'fail' | 'nil' }

/** A stored child that fails its kind's checks, named by where it is stored. */
type DamagedThing = ThingScope & { am: 'd' }

/** What every listing answer carries, refused or not: the parent, and the listed Things that failed their checks. */
type ListedBeside<RecordT extends Thing> = { parent: Sparse<RecordT> | null, damaged_rows: DamagedThing[] }

type ListThingsAnswer<RecordT extends Thing = Thing> =
  | (GoodAnswer<Sparse<RecordT>[], EX.GotAct> & ListedBeside<RecordT>)
  | (BadAnswer<Sparse<RecordT>[] | null>       & ListedBeside<RecordT>)
```

`BadAnswer` has the type of its `dbhas` as a type parameter, as `GoodAnswer` has the type of its `val`. Its default is `Thing | null`,
which every other verb keeps. A get's refusal has the stored record as its `dbhas`: the tombstone under `gone`, and
null under `void` or wherever the store's answer is in doubt.

* **A listing is similar to a sparse get of the parent that also gives its sparse children.** Its act is the
  parent's: with `ifAbsent: 'nil'` it answers `gotlive`, `gotgone` or `gotvoid`, and with `ifAbsent: 'fail'` it refuses
  `void` or `gone`.
* **`val` is an array of sparse children**, not descendants, in labelpath order, byte for byte, as Postgres's
  `COLLATE "C"` sorts them. A full record comes from a get.
* **`dbhas` has `val`'s shape, and changes with it.** `parent` and `damaged_rows` do not change with the shape of
  what is listed. Under `void` and `gone` it is `[]`: a child hangs off its parent's live lifepath, so neither has
  one, and the same stored state under `ifAbsent: 'nil'` gives `val: []`. Under any other refusal it is null.
* **`parent`** is the parent's sparse record, or null for none.
* **Tombstones are listed**, `am: 'x'`, so that a cache learns of a delete from a listing.
* **A gate is listed whole.** Gates are light, and a gate's timeliness matters more than a box's: only a box is
  listed sparse.
* **A child that fails its checks is listed in `damaged_rows`**, and the rest are listed as usual. A row stored
  outside the parent refuses `storage_issue`, because the store is broken.
* **Descendants come later, in the same answer.** Labels are `[a-z0-9_]`, every byte of them above `/`, so labelpath
  order puts each Thing's descendants right after it: a depth-first walk. A listing of a subtree gives the same flat
  `val`, each Thing's depth the count of its segments, and a filter narrows it.

```
adapter.tryListThings(ask)
  try
    const checked     = checkedListThingsAsk(ask)                  bad_option
    const loggableAsk = loggableAskOf(checked)
    const actual      = await this.doListThings(checked)
    const beside      = { parent: actual.parent, damaged_rows: actual.damaged_rows }
    actual.ok ? { ok, ask: loggableAsk, act, world, ...beside, val: actual.listed }
              : { ok, ask: loggableAsk, act, world, ...beside, dbhas: actual.listed, err }
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
  | the gate's `lifepath = '/' \|\| lifeseq`               | every gate                           | `lifepath = lifeseq` for the main gate; the depth check for the rest                                 |
  | the gate's `labelpath = 'gate/' \|\| label`            | the main gate, at `gate`             | `labelpath IN ('gate', 'gate/' \|\| label)`                                                          |
  | the gate's `label <> 'main' OR am = 'a'`               |                                      | `labelpath <> 'gate' OR am = 'a'`                                                                    |

* **`safebyok_write_box(proposed, cited)`** is the gate's write function without the policies.
* **The listing** is two SELECTs on the primary key: the parent's row, and the range under it,
  `labelpath >= 'box/' AND labelpath < 'box0'`, filtered to one more segment and to the parent's lifepath.
* **`safebyok_birth_bank(bank, gate, root)`** inserts the three rows in one call, which Postgres runs atomically.

## The models

### The types

| Type            | What it contains                                                       | What it is for                                               |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `BoxRecord`     | a live box as stored: its Thing fields, `sidecar` and `whisper_sealed` | what the vaultDB keeps                                       |
| `BoxTombstone`  | a deleted box as stored: its Thing fields and `whisper_sealed`          | the same, for a deleted box                                  |
| `BoxSparse`     | a box's Thing fields alone, live or a tombstone                        | what a listing gives; with a sidecar, what `sealBox` accepts |
| `BoxCleartexts` | `{ whisper }`                                                          | what `bank.sealBox` ciphers                                  |
| `BoxUnsealed`   | `UnsealedOf<BoxRecord, BoxCleartexts>`: Thing fields, sidecar, whisper | what `bank.unsealBox` gives                                  |

The seal makes the next revision itself, so it needs no draft type: what it accepts is the prior box's Thing fields
with the sidecar to put.

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
* **Each method checks the box is the bank's own.** `bank.#demandBox(box)` parses the box by its own shape,
  returns it, and refuses `record_conflict` unless its `userid` and `banklabel` are the bank's and its lifepath starts
  with the lifeseq of the bank's root box.
* **The lease's seal is built**, and stays: `lease.seal(sealerkind, prior, cleartexts)` asks the sealer for the next
  revision, wraps a fresh key, and ciphers the cleartexts under it. `Sealers.BoxWhisper` changes in three places: its
  `sealedOf` and `recordOf` read and write `whisper_sealed`, its `stampsOf` binds the box's Thing fields and the two
  tags, and its `nextRevisionOf` starts a new life with the next lifeseq in place of a new `box_tok`.
* **A tombstone needs a different next revision**, `am: 'x'` at the next lifeseq, and the lease asks the sealer for
  it. So `Sealers.BoxTombstone` is `{ ...BoxWhisper, nextRevisionOf: boxTombstoneOf }`, one line, and
  `bank.tombstoneBox` seals `{ whisper: {} }` with it. The sealers and their helpers live in `models/sealers.ts`.
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
| `rootBox`              |                                                     | `#rootBox`, the root box's sparse record    |
| `device`, `device_tok` | the device                                          | unchanged                                   |
| the lock and its guards, `modelkind` | the model's own                       | unchanged                                   |

**The stamp binds the bank's lifeseq in place of `bank_tok`.** Every ctx binds the stamp first, each wayin's among
them, so a wayin stored today does not unwrap after the change: it fails safe as damaged, and the changeset says so.

### Light sugar on the bank

The bank is given a VaultDB when it is made. Each method fills in the bank's scope and the modelkind. `safebyok/core`
exports the bank with its sugar, for a host that wants only lock, unlock and a few secrets. The header of `core.ts`,
which says core does no storing, is corrected to match the README.

* **`bank.rootBox`**: the root box's sparse record, kept since the bank was made.
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
   from an earlier life unwraps only to that life's key. What the random token added: a wrap never unwraps in another life,
   even where storage loses the bank row and a bank is born again at the same lifeseq. In TODO.md.
9. **A birth's `passed` does not check that the gate and root box are of the bank's life.** Big's build checked the gate
   row's `bank_tok` against the bank's. A root's lifepath carries none of the bank's lifeseq, so the check cannot be
   written here.
10. **A main gate or root box stored with no bank refuses the birth.** Big wrote a new gate over one unchecked. Here
    each root is a put citing the shell, and the put table refuses it, so someone has to mend the store by hand.

## Guarantees abandoned

* **The sparse form leaves out the codec fields**, which big's `BoxSparse` had.

## Building it

Three PRs, each stacked on the one before:

1. **Storage**: roots, the main gate at `gate`, lifepaths with no leading `/` and one lifeseq per segment, `put` and
   `del` with a modelkind, the ask builders, the bank and box kinds and their policies, `tryListThings`,
   `tryBirthBank`, the memory store, and their tests. design-vaultdb.md's labelpaths and roots are brought up to date
   with it.
2. **Sealing**: `Sealed` at `<part>_sealed`, `SealedOf` and `UnsealedOf`, the two box sealers, signed tombstones,
   `sealBox`, `tombstoneBox` and `unsealBox`, and the security note.
3. **The bank on its Thing**: its props, `rootBox`, the stamp, and the sugar, with one test of the flows above
   through `MemoryVaultDB`. Then design-vaultdb.md and design-gate.md are brought up to date.

## Open questions

1. **The gate's wayins and `Sealed`.** A wayin wraps the bankKey under a key its passphrase or passkey derives, and
   ciphers nothing, so it has no `ciphered`, `codectag` or `schematag`: it is a wrap, not a seal. Its shapes can be
   made one schema per kind in a thread of its own; none of it touches boxes.

## Principles

* **Disable a case only once you can say how it breaks**, and then decide. Never work around it. A get of a root box
  is allowed. A root is never listed because nothing lists its parent, not because it is banned.

### Ensuring parentage on a write (TODO) NO CODE YET IGNORE THE BELOW

A write ask may carry `parentage: SparseParent[]`, with `SparseParent = { revtok, born_at }`, plus `whisper_sealed`
for a box. It names every parent of the Thing written, or it is left out.

* **Where a parent is stored live**, nothing happens to it.
* **Where a parent is missing, or is a tombstone one lifeseq short of the lifepath written**, its sparse parent is
  filled out and written in its place. It is given the `written_at` of the Thing written, and the scope, life and other
  fields its position implies. Its sealed part binds those same fields.

There's some good arguments being made by the  other  agent that  we should be passing the void singleton or a void shell around in more places. I'm sympathetic to that argument for the normal `dbhas`

However: for listing, and maybe get, we should return parentage: [...parents, from root to first tombstone]
