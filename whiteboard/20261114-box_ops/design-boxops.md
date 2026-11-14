# Box ops: get, write and list boxes as Things

Thread `20261114-box_ops`, worktree `/workspace/byok-box_ops`, cut from main after #699. The vaultDB takes the box as
its second kind of Thing, and gains a third verb, `tryListThings`, a flat listing of a bank's boxes. On the model side,
`bank.sealBox` gives a box Thing, which the vaultDB stores as it is.

Words as in [design-vaultdb.md](../20261114-vault_db/design-vaultdb.md): **proposed** is `ask.record`, **cited** is
`ask.cited`, **actual** is the record the store holds.

## The box as a Thing

| Field        | A box                                                        | Big's box row                       |
| ------------ | ------------------------------------------------------------ | ----------------------------------- |
| `userid`     |                                                              | `user_id`                           |
| `banklabel`  |                                                              | `banklabel`                         |
| `labelpath`  | `box/<label>`                                                | `vaultlabel`, `boxlabel`            |
| `label`      | the box's label, checked as a boxlabel is today              | `boxlabel`                          |
| `fmt`        | `BoxThingFormat`, 5103                                       | 5003                                |
| `lifepath`   | `/<lifeseq>`, at depth 1                                     | `bank_tok`, `vault_tok`, `box_tok`  |
| `lifeseq`    |                                                              | `box_tok`                           |
| `revtok`     |                                                              | `revision_tok`                      |
| `revseq`     |                                                              | `revision_seq`                      |
| `born_at`    |                                                              | `registered_at`                     |
| `written_at` |                                                              | `written_at`                        |
| `am`         | `'a'` live, `'x'` gone                                       | `am`                                |

The body, as big's: `whisper_codec` and `whisper_schema_version` on both forms; `sidecar`, `box_key_wrapped` and
`whisper_ciphered` on a live box only.

* **No vault.** A box sits at `box/<label>`, right under the bank. When boxes nest, a box is the vault of the boxes
  under it: `box/<outer>/<inner>`, lifepath `/<outer's lifeseq>/<inner's lifeseq>`. So design-vaultdb.md's
  `box/<vaultlabel>/<boxlabel>` becomes `box/<label>`, and a boxlabel is unique in its bank, not in its vault.
* **Two forms**, live and tombstone, as big's `boxRecord` and `boxTombstone`; `boxThing` checks either by `am`. Both
  are strict, as the gate is.
* **`fmt` 5103**: big's 5003 moved by the 100 the gate's moved (4001 to 4101), so that it is never read as big's row.
  `GateThing` and `BoxThing` each pin a literal `fmt`, so a caller narrows a `Thing` by `thing.fmt`.
* **`bank_tok` goes.** The box no longer names its bank's life in storage. The row above's life waits on depth 2 and
  on the Bank as a Thing (design-vaultdb.md, the fourth row of the lifeseq table).

## Storage

### Each kind's checks

`KindChecks` gains `box`, and `kindChecksOf` looks up the modelkind at the base of the labelpath. A `bank/` labelpath
still refuses `bad_option`.

```ts
const KindChecks = {
  gate: { record: gateThing, cited: gateCited, stored: gateThing.refusingAs('damaged_row'), policies: GatePolicies },
  box:  { record: boxThing,  cited: boxCited,  stored: boxThing.refusingAs('damaged_row'),  policies: {}           },
}
```

* **A box's own checks**: `labelpath === 'box/' + label`, and its lifepath is its own lifeseq: both depth 1, for now.
  `isMainGateLive` becomes the gate's alone.
* **Policies are per kind.** An ask that names a policy its kind does not have refuses `bad_option`, so a box write
  names none. The testimony check (`replace_passphrase` needs `cited.wayins.main`) stays the gate's, and the
  classifier applies a kind's own policies from its entry.
* **`Thing` is `GateThing | BoxThing`.** The answers stay typed `Thing`.

### Get and write

The verbs do not change: `tryGetThing` and `tryWriteThing` take a box's labelpath, and the act tables already hold.
What the box brings is the tombstone, which the gate never reaches: a write of a box's tombstone is `deleted`, a put
over it is `reborn` at the next lifeseq, and a tombstone over a tombstone refuses `bad_record`.

### The third verb: `tryListThings`

```
vaultDB.tryListThings(ask: ListThingsAsk) → Promise<Answer<ThingsListed, ListAct>>   never throws
```

```ts
/** The Things directly under `parentpath` in a bank. */
type ListThingsAsk = { op: 'list', userid, banklabel, parentpath: 'box' }

/** A Thing's own fields, its body left out: what a listing gives of each. */
type ThingSparse = Pick<Thing, 'userid' | 'banklabel' | 'labelpath' | 'label' | 'fmt' | 'lifepath' | 'lifeseq'
                             | 'revtok' | 'revseq' | 'born_at' | 'written_at' | 'am'>

/** A Thing stored that fails its kind's checks, named by the scope it is stored at. */
type DamagedThing = ThingScope & { am: 'd' }

type ThingsListed     = { things: ThingSparse[], damaged_rows: DamagedThing[] }
type ListThingsAnswer = Answer<ThingsListed, EX.ListAct>
```

* **`parentpath`** is the labelpath the listed Things sit right under. For now only `'box'`, the root of the boxes:
  every box in the bank. With the tree it takes `box/<outer>`, and the outer box's lifepath, so that only the boxes
  of its current life are listed. "Parent" is kept for just that. Any other `parentpath` refuses `bad_option`.
* **Sparse**: a Thing's own fields, the same for every kind, its body left out. A box's listing has no sidecar, no
  ciphertexts and no codec fields. Big's `BoxSparse` also left out the sidecar, but carried the codec fields.
* **Tombstones are listed**, `am: 'x'`, so that a cache learns of a delete from a listing as it does from a get, as
  in big.
* **A damaged row is listed** in `damaged_rows`, so that one bad row never hides the rest, as in big. A row stored
  outside `parentpath` refuses `storage_issue`: the store is broken.
* **In labelpath order**, byte for byte, as Postgres's `COLLATE "C"` sorts, so that two stores list alike.
* **Acts**: `got`, or `gotvoid` for none (big's `ListAct`). A flat listing has no refusal of its own: there is no
  parent to be void or gone. With the tree, an outer box that is void, gone or of another life refuses, as big's
  vault acts did.
* `world` is null, as on the other verbs. No paging and no count, as in big.

```
adapter.tryListThings(ask)
  try
    const checked     = checkedListThingsAsk(ask)                  bad_option
    const loggableAsk = loggableAskOf(checked)
    const actual      = await this.doListThings(checked)
    { ok: true, ask: loggableAsk, act: actual.act, world: actual.world, val: actual.listed }
  catch (thrown)
    return this.answerForThrown(thrown, 'listThings', ask)

store.doListThings(ask)                                            one read
  fetch every raw Thing under ask.parentpath, each with the labelpath it is stored at
  return this.classifyListThings(ask, fetched)

classifyListThings(ask, fetched: { labelpath, raw }[])
  each raw, by its kind's stored check at its labelpath: its sparse fields, or a DamagedThing
  act: got when anything is listed, gotvoid when nothing is
```

`ListActual`, beside `Actual`: `{ ok: true, act: ListAct, world: null, listed: ThingsListed }`.

**Memory** keys its map by bank, then labelpath (`Map<bank ckey, Map<labelpath, raw>>`), so that `doListThings`
reads one bank's map and has each labelpath at hand. `_cheat_things` changes with it.

**The watch** does not change: a bank's watch hears its boxes, and `noticedThingOf` checks each by its kind.

### Postgres, as a design

As for the gate, not built.

```sql
CREATE TABLE IF NOT EXISTS safebyok_boxes (
  -- the Thing's columns and CHECKs, as safebyok_gates has them, then:
  whisper_codec          text    COLLATE "C" NOT NULL,
  whisper_schema_version integer NOT NULL,
  sidecar                jsonb,
  box_key_wrapped        jsonb,
  whisper_ciphered       jsonb,
  PRIMARY KEY (userid, banklabel, labelpath),
  CHECK (labelpath = 'box/' || label),          -- depth 1, for now
  CHECK (lifepath = '/' || lifeseq),            -- depth 1, for now
  CHECK ((am = 'a') = (sidecar IS NOT NULL) AND (am = 'a') = (box_key_wrapped IS NOT NULL) AND (am = 'a') = (whisper_ciphered IS NOT NULL))
  -- and big's CHECKs of each jsonb's shape
);
```

* **`safebyok_write_box(proposed, cited)`** is the gate's write function less the policies, returning
  `(ok, box, lifeseq_ok)`. It returns `capacity_ok` once the cap comes back.
* **The listing** is one SELECT on the primary key's range:
  `WHERE (userid, banklabel) = ($1, $2) AND labelpath >= 'box/' AND labelpath < 'box0' ORDER BY labelpath`.
  Only depth 1 is stored, so the range is the listing. With the tree it also filters on depth and on the outer box's
  lifepath.

## The models

* **`BoxRecord`**, in `safebyok/core` and at the front door, becomes the live `BoxThing`, the new core's own type in
  place of big's `BX.BoxRecord`.
* **`BoxAnte`**, what a seal starts from: the box's scope and label, what `ThingCited` names, its `born_at` while
  live, and the sidecar to write. Its check strips a live box's sealed fields, so the box in hand can be passed whole.
  For a box never stored, the ante is `ShellCited` with the scope.
* **`BoxWhisper.nextRevisionOf(ante)`** makes the next header: a new `revtok`, `revseq + 1`, `written_at` now; over a
  tombstone or the shell, the next lifeseq, its lifepath, and `born_at = written_at`. That is just what the write
  invariants demand, so a box fresh from the seal always passes `checkedWriteThingAsk`. The header step is one
  function, `nextThingRevisionOf(cited, am, now)` in `shapes-thing.ts`, beside the invariants it must meet; the
  tombstone below uses it, and the gate will when it moves onto its Thing.
* **`BoxWhisper.stampsOf(box)`** binds the box's `ThingSparse` and its two codec fields: its scope, label, `fmt`, life,
  revision, times and `am`. That is big's binding of every sparse field, under the Thing's names. The bank's stamp
  still comes first, so a box sealed under another life of the bank refuses to unseal. A security reviewer should
  see this change: it goes to `notes/security.md` through a `sonnet` subagent when it is built.
* **`boxTombstoneOf(box)`**: the box's next revision with `am: 'x'`, the next lifeseq, and its body cut to the codec
  fields. It needs no key, so it is a plain function, not a Bank method.
* **`bank.#demandOwnBox`** checks the box's `userid` and `banklabel` against the bank's; the box has no `bank_tok`
  left to check.
* **`BoxUnsealed`** is the live `BoxThing` less its sealed fields, with its whisper.

### The three box flows, end to end

```
put     const got    = await vaultDB.tryGetThing({ op: 'get', userid, banklabel, labelpath: 'box/openai', ifAbsent: 'nil' })
        const inHand = got.val ?? { ...ShellCited, userid, banklabel, labelpath: 'box/openai', label: 'openai' }
        const record = await bank.sealBox({ ...inHand, sidecar }, { whisper })
        await vaultDB.tryWriteThing({ op: 'write', userid, banklabel, labelpath: 'box/openai', cited: inHand, record, ifAbsent: 'add', ifPresent: 'repl' })

delete  const record = boxTombstoneOf(got.val)
        await vaultDB.tryWriteThing({ op: 'write', userid, banklabel, labelpath: 'box/openai', cited: got.val, record, ifAbsent: 'fail', ifPresent: 'repl' })

list    const listed = await vaultDB.tryListThings({ op: 'list', userid, banklabel, parentpath: 'box' })
```

## Guarantees loosened or dropped, against big

1. **No vault.** Its lifecycle and its acts (`vault_void`, `vault_gone`, `vault_reborn`) go, and a boxlabel is unique
   in the bank rather than in a vault. Nesting brings the grouping back, with a box as the vault.
2. **Storage no longer ties a box to its bank's life.** Big refused a box op in a bank not live under `bank_tok`, left
   rows of ended lives out of a listing, and deleted them with the bank. Here a box left from an earlier life of the
   bank would still be listed and written over. The new core cannot delete a bank yet, so nothing reaches this, and
   the seal still binds the bank's stamp, so such a box never unseals. It comes back with the Bank as a Thing.
3. **No box cap.** Big's soft cap and its `vault_full` go. design-vaultdb.md's `safebyok_capacity_ok` sketches the
   return.
4. **A box of another life of the bank** refused `record_conflict` at `bank.sealBox` and `bank.unsealBox`. Now
   `unsealBox` refuses `damaged_whisper`, from the unseal, and `sealBox` seals it into this life.
5. **No `tidyGone`.** Tombstones stay, and are listed.
6. **The sparse listing leaves out the codec fields**, which big's `BoxSparse` carried.

A box's life is sequential where `box_tok` was random, as already ruled for the gate.

## Building it

One PR, in this order:

1. Storage: the box kind, per-kind policies, `tryListThings`, the memory store; tests ported from big's box get,
   put, del and list cases that still apply, plus damaged rows in a listing and a policy named on a box.
2. Models: `BoxRecord` onto `BoxThing`, the sealer, `boxTombstoneOf`, the bank's guard; tests, and one test of the
   three flows above through `MemoryVaultDB`, unseal included.
3. design-vaultdb.md brought up to date: the box's labelpath, the third verb, *Where things stand*. The security note.

## Open questions

* **The box's labelpath**: `box/<label>`, dropping the vaultlabel, as above? I recommend it: boxes become their own
  vaults.
* **The listing's ask**: `parentpath: 'box'`, growing a parent lifepath with the tree? The name follows
  design-minder.md's `list(parentpath)`.
* **The sidecar in a listing**: left out, as in big and as a sparse form is? I recommend leaving it out. The cost: an
  app that shows each box's sidecar while the bank is locked gets each box.
* **The model side in this thread**: with storage alone, only test fixtures could write a box. I recommend both.
* **Where `nextThingRevisionOf` and `boxTombstoneOf` live**: `storage/shapes-thing.ts`, beside the invariants? Then
  `safebyok/core` imports the Thing's shapes from `storage/`, never its adapter. I recommend it, over moving the
  shapes to a folder of their own now.
* **`fmt` 5103** for the box's Thing?
