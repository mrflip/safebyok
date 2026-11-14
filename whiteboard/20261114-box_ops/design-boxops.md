# Box ops: get, write and list boxes as Things

Thread `20261114-box_ops`, worktree `/workspace/byok-box_ops`. The vaultDB stores two more kinds of Thing, the box and
the bank. It lists the children of a box, and it writes a new bank's first Things in one step. On the model side, the
bank seals a box draft into the record the vaultDB stores, and signs a box's tombstone.

**proposed**, **cited** and **actual** are defined in [design-vaultdb.md](../20261114-vault_db/design-vaultdb.md).

## The box as a Thing

| Field        | A box                                                         | Big's box row                       |
| ------------ | ------------------------------------------------------------- | ----------------------------------- |
| `userid`     |                                                               | `user_id`                           |
| `banklabel`  |                                                               | `banklabel`                         |
| `labelpath`  | `box/<label>`; the root box's is `box`                        | `vaultlabel`, `boxlabel`            |
| `label`      | the last label of the labelpath, checked as a boxlabel        | `boxlabel`                          |
| `fmt`        | `BoxThingFormat`, 5103                                        | 5003                                |
| `lifepath`   | `/<root's lifeseq>/<lifeseq>`; the root box's is `/<lifeseq>` | `bank_tok`, `vault_tok`, `box_tok`  |
| `lifeseq`    | (was a token, now a base-32 integer string)                   | `box_tok`                           |
| `revtok`     |                                                               | `revision_tok`                      |
| `revseq`     |                                                               | `revision_seq`                      |
| `born_at`    |                                                               | `registered_at`                     |
| `written_at` |                                                               | `written_at`                        |
| `am`         | `'a'` live, `'x'` gone                                        | `am`                                |

The **body** is every field of a record besides its Thing fields. The store carries it but does not read it.

| Body field               | Live box | Tombstone | Kind (VOCABULARY.md) |
| ------------------------ | -------- | --------- | -------------------- |
| `whisper_codec`          | yes      |           | visible              |
| `whisper_schema_version` | yes      |           | visible              |
| `sidecar`                | yes      |           | unencrypted          |
| `box_key_wrapped`        | yes      | yes       | encrypted            |
| `whisper_ciphered`       | yes      |           | encrypted            |

* **A box is the vault of the boxes under it.** A nested box is at `box/<...parent labels>/<label>`, and its lifepath
  is `/<...parent lifeseqs>/<lifeseq>`. For now every box is a child of the root box, so a boxlabel is unique in its
  bank.
* **The root box**, at `box`, is born with the bank. A get of it is allowed. Nothing lists it, because nothing lists
  its parent. Its lifeseq leads the lifepath of every box under it, so the boxes of an earlier life of the root are
  not its children.
* **A box has two forms**, live and tombstone, each strict. `boxThing` checks either, by `am`.
* **`fmt` 5103** is never read as big's box row (5003). Each kind pins a literal `fmt`, so a caller narrows a `Thing`
  by `thing.fmt`.
* **A box has no `bank_tok`.** Its lifepath names the root box's life, and the root box is born with the bank.

## The bank as a Thing

| Field       | The bank                 | Big's bank row  |
| ----------- | ------------------------ | --------------- |
| `labelpath` | `bank`                   |                 |
| `label`     | `bank`                   |                 |
| `fmt`       | `BankThingFormat`, 3101  | 3001            |
| `lifepath`  | `/<lifeseq>`             | `bank_tok`      |
| `born_at`   |                          | `registered_at` |

Its other fields are the Thing's, named as in the box's table. It has no body.

* **The vaultDB refuses a bank's tombstone** (`bad_record`) for now: deleting a bank needs its children deleted too.
* **The Bank model keeps big's record and its stamp**, `bank_tok` among them. Only the vaultDB stores the bank as a
  Thing for now.

## Storage

### Each kind's checks

```ts
const KindChecks = {
  bank: { record: bankThing, cited: bankCited, stored: bankThing.refusingAs('damaged_row'), policies: {}           },
  gate: { record: gateThing, cited: gateCited, stored: gateThing.refusingAs('damaged_row'), policies: GatePolicies },
  box:  { record: boxThing,  cited: boxCited,  stored: boxThing.refusingAs('damaged_row'),  policies: {}           },
}
```

* **A labelpath is a kind, then zero or more labels.** `bank`, `box` and `gate` are labelpaths. A get of `gate`
  answers `gotvoid`.
* **A box's labelpath** is `box` or `box/<label>`. Its lifepath holds one lifeseq more than its labelpath has labels.
* **A new invariant:** a write keeps the leading lifeseqs of the lifepath it cites. A write does not check that those
  are the root box's current life: that check is design-vaultdb.md's "the row above's life", still to come.
* **Each kind has its own policies.** The gate has its three. The bank and the box have none, and an ask that names a
  policy its kind lacks refuses `bad_option`.
* **`ThingRecord` is the Thing fields** every kind shares. **`Thing` is any kind's record**: `BankThing | GateThing |
  BoxThing`.

### Get and write

The verbs are unchanged. A box can be deleted, which the main gate never is. So a write of a box's tombstone answers
`deleted`, a put over that tombstone answers `reborn` at the next lifeseq, and a tombstone written over a tombstone
refuses `bad_record`.

### Listing a Thing's children: `tryListThings`

```
vaultDB.tryListThings(ask: ListThingsAsk) → Promise<ListThingsAnswer>   never throws
```

```ts
/** A record's Thing fields, without its body: what a listing gives of each Thing. */
type Sparse<RecordT extends ThingRecord> = Pick<RecordT, keyof ThingRecord>

/** Get the Thing at this scope, and list its children. */
type ListThingsAsk = ThingScope & { op: 'list', ifAbsent: 'fail' | 'nil' }

/** A stored child that fails its kind's checks, named by where it is stored. */
type DamagedThing = ThingScope & { am: 'd' }

/** The parent's children, sparse, with the parent beside them. A refusal carries the parent as stored in `dbhas`. */
type ListThingsAnswer<RecordT extends Thing = Thing> =
  | (GoodAnswer<Sparse<RecordT>[], EX.GotAct> & { parent: Sparse<RecordT> | null, damaged_rows: DamagedThing[] })
  | BadAnswer
```

* **A listing is a get of the parent that also returns its children.** Its act is the parent's: `gotlive`,
  `gotgone` or `gotvoid`, or under `ifAbsent: 'fail'` a refused `void` or `gone`. The children are those of the
  parent's current life, the ones whose lifepath starts with the parent's. A parent that is gone or void has none.
* **`parent`** is the parent's sparse record, or null for none.
* **Each child is sparse.** A full record comes from a get.
* **Tombstones are listed**, `am: 'x'`, so that a cache learns of a delete from a listing.
* **A child that fails its checks is listed in `damaged_rows`**, and the rest are listed as usual. A row stored
  outside the parent refuses `storage_issue`, because the store is broken.
* **Children come in labelpath order**, byte for byte, as Postgres's `COLLATE "C"` sorts them.

```
adapter.tryListThings(ask)
  try
    const checked     = checkedListThingsAsk(ask)                  bad_option
    const loggableAsk = loggableAskOf(checked)
    const actual      = await this.doListThings(checked)
    actual.ok ? { ok, ask: loggableAsk, act, world, parent, damaged_rows, val: actual.children }
              : { ok, ask: loggableAsk, act, world, dbhas: actual.parent, err }
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

* Where no bank is stored, it writes all three, each over the shell, and answers `born`.
* Where a live bank is stored, it writes nothing, and answers `passed` with the three Things stored. So a second call
  does no harm.
* A rebirth over a bank's tombstone waits on deleting a bank.

### Postgres, as a design

As for the gate, this is not built.

* **`safebyok_boxes`** has the Thing's columns and CHECKs, and the body table's columns, each null where its form has
  none: `CHECK ((am = 'a') = (whisper_ciphered IS NOT NULL))`, and so on.
* **`safebyok_banks`** has the Thing's columns alone.
* **`safebyok_write_box(proposed, cited)`** is the gate's write function without the policies.
* **The listing** is two SELECTs on the primary key: the parent's row, and its children's range,
  `labelpath >= 'box/' AND labelpath < 'box0'`, filtered to one more label and to the parent's lifepath.
* **`safebyok_birth_bank(bank, gate, root)`** inserts the three rows in one call, which Postgres runs atomically.

## The models

| Type            | What it holds                                                               | What it is for                       |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| `BoxRecord`     | a live box as stored: its Thing fields and its body                         | what the vaultDB stores and answers  |
| `BoxTombstone`  | a deleted box as stored: its Thing fields and `box_key_wrapped`             | the same, for a deleted box          |
| `BoxDraft`      | a box's next revision without its encrypted fields: a live one, or a tombstone | what `bank.sealBox` seals            |
| `BoxCleartexts` | `{ whisper }`, the secret the seal ciphers                                  | what `bank.sealBox` takes beside it  |
| `BoxUnsealed`   | a live box's draft, with its whisper                                        | what `bank.unsealBox` gives          |

So `BoxDraft` is `BoxRecord` without `box_key_wrapped` and `whisper_ciphered`, or `BoxTombstone` without
`box_key_wrapped`. `BoxUnsealed` is a live `BoxDraft` and its whisper.

* **`Sealers.BoxWhisper.nextDraftOf(prior, { sidecar })`** makes the next revision of `prior`, a stored box or the
  box shell, as a live draft. It has a new `revtok`, `revseq + 1`, and `written_at` now. Over a tombstone or the
  shell, it also has the next lifeseq, its lifepath, and `born_at = written_at`. These are what the write invariants
  demand, so a sealed draft passes `checkedWriteThingAsk`. Its header comes from `nextThingRevisionOf` in
  `shapes-thing.ts`, which `tombstoneOf` uses too.
* **`Sealers.BoxWhisper.tombstoneOf(prior)`** makes the tombstone draft of a live box: its next revision, with
  `am: 'x'`, the next lifeseq, and no body.
* **`bank.sealBox(draft, cleartexts)`** seals a draft. For a live draft, it wraps a fresh boxKey and ciphers the
  whisper under it. For a tombstone draft, it takes no cleartexts, and wraps a fresh key alone, which signs it.
* **The seal binds** the bank's stamp, then the draft's Thing fields and its codec fields. A security reviewer should
  see this change: it goes into `notes/security.md` through a `sonnet` subagent when it is built.
* **The lease seals the draft it is handed.** The Sealer interface's `nextRevisionOf` becomes `nextDraftOf`, which
  the caller calls before the seal. design-gate.md changes to match.
* **`bank.unsealBox(box)`** gives a live box's `BoxUnsealed`. Given a tombstone, it checks the signature, and gives
  the tombstone's draft.
* **`bank.#demandOwnBox`** checks the box's `userid` and `banklabel` against the bank's.

### Signed tombstones

* **A tombstone's `box_key_wrapped`** is a fresh key wrapped under the bankKey, bound to the bank's stamp and the
  tombstone's Thing fields. Unwrapping it checks them. A wayin's header is authenticated the same way, by the context
  its wrap is bound to.
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
root    const listed = await vaultDB.tryListThings({ op: 'list', userid, banklabel, labelpath: 'box', ifAbsent: 'fail' })
        const root   = listed.parent

put     const scope  = { userid, banklabel, labelpath: 'box/openai' }
        const got    = await vaultDB.tryGetThing({ op: 'get', ...scope, ifAbsent: 'nil' })
        const prior  = got.val ?? boxShellOf(scope, root)
        const record = await bank.sealBox(Sealers.BoxWhisper.nextDraftOf(prior, { sidecar }), { whisper })
        await vaultDB.tryWriteThing({ op: 'write', ...scope, cited: prior, record, ifAbsent: 'add', ifPresent: 'repl' })

delete  const record = await bank.sealBox(Sealers.BoxWhisper.tombstoneOf(prior))
        await vaultDB.tryWriteThing({ op: 'write', ...scope, cited: prior, record, ifAbsent: 'fail', ifPresent: 'repl' })
```

`boxShellOf(scope, root)` is the shell of a box under `root`: its lifepath is the root's, then `/-1`.

## Guarantees loosened, dropped or changed, against big

1. **No vault.** Its lifecycle and its acts (`vault_void`, `vault_gone`, `vault_reborn`) are gone. A boxlabel is
   unique in its bank, not in a vault. Nested boxes bring the grouping back.
2. **A write does not check a box's parent.** Big refused a box op in a bank or vault that was not live under its
   tokens (`bank_*`, `vault_*`). A listing leaves out the boxes of an earlier life of the root box, but a write over
   one is not refused.
3. **No box cap.** Big's soft cap and its `vault_full` are gone. design-vaultdb.md's `safebyok_capacity_ok` sketches
   how a cap comes back.
4. **A box of another life of the bank** refused `record_conflict` at `bank.sealBox` and `bank.unsealBox`. Now
   `unsealBox` refuses it `damaged_whisper`, and `sealBox` seals it into this life.
5. **No `tidyGone`.** Tombstones are kept, and listed.
6. **The sparse form leaves out the codec fields**, which big's `BoxSparse` had.
7. **A delete needs the bank unlocked.** Big deleted a box with no key.
8. **A listing's acts are the parent's get acts.** Big's `got` and `gotvoid` counted the children.

## Building it

Two PRs, the second stacked on the first:

1. Storage: labelpaths of a kind alone, the bank and box kinds, each kind's policies, the lifeseq invariant,
   `tryListThings`, `tryBirthBank`, the memory store, and their tests.
2. Models: the drafts, the sealer, signed tombstones and the bank's guard, with one test of the flows above through
   `MemoryVaultDB`. Then design-vaultdb.md and design-gate.md are brought up to date, and the security note is written.

## Open questions

* **What the root box holds.** I recommend no whisper and no sidecar, which makes those fields optional on a live
  box. Then `tryBirthBank` needs no key, and a box that serves as a vault need not hold a secret. The other way is a
  sealed empty whisper, which needs the bank unlocked inside the birth.
* **The label of a root**: the last `/`-segment of its labelpath, so `box` and `bank`? It keeps one rule, and needs no
  empty label.
* **The bank at labelpath `bank`**, the root of its kind as the root box is of its own? This answers
  design-vaultdb.md's open question on the bank's label.
* **A live bank missing its gate or root box**, met by `tryBirthBank`: I recommend refusing `damaged_row`. Writing
  what is missing would be a repair inside a normal operation.
* **`fmt` 5103 and 3101.**
* **`cleartext`** in VOCABULARY.md is the passphrase or passkey answer a gating takes. `BoxCleartexts`, from
  lean_gate, uses it for the whisper. One of them needs another name.

## Principles

* **Disable a case only once you can name the harm it does.** A get of a root box is allowed. A root is never listed
  because nothing lists its parent, not because it is banned.
