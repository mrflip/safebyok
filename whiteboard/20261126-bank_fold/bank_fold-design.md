# bank_fold: design

2026-11-26 · from a design talk between the Coach and the agent. Built on one branch,
`claude/bank-table-refactor-fr1ycq`, stacked on the vault_manifest line's tip
(`20261126-graphql_manifest`, 1323380). Every thread reads this whole.

## The change

The bank stops being a stored Thing. Its presence in the vaultDB is its gate's record, which is
stored at the bank's own label and carries what the bank row carried (`lifetok`). The umbrella
object every model runs through, `World`, takes the name `Bank`.

The Coach: "the bank 'exists' (unrecorded in the db) as soon as it is labelled. It can't seal or
unlock or be saved until its authentication record is baked."

## Rulings (the Coach, 2026-11-26, in chat)

* The gate's labelpath is its bank's banklabel: "For banklabel 'bob', at 'bob'."
* "It's possible that in places (eg the react query query key) the root key being the modelkind is
  assumed; we'll introduce the modelkind as a scope honestly as needed."
* `device.bank` is always there: the bank exists once labelled. What `tryGetWorld` answers "will
  become bank, virtually assembled as it is now".
* A second gate: admit neither `gate/<label>` nor anything under the gate, yet.
* The `banktok` is unused, and known to be: carry it as it is.
* One branch, threads in order.

## What is stored

| | before | after |
|---|---|---|
| kinds of Thing | `bank`, `gate`, `box` | `gate`, `box` |
| the gate | at `gate`, never a tombstone | at `<banklabel>`, label `<banklabel>`, with `lifetok`; live, or a tombstone with every wayin place null, which ends the bank |
| the root box | at `box` | at `box` (unchanged) |
| a box | at `box/<label>` | unchanged |
| a bank's roots | bank, gate, root box | gate, root box |

* **A labelpath** is one label (a gate's, equal to its banklabel), `box`, or `box/<label>`.
* **A Thing's kind is stated, never read from its labelpath** (thread 8, thing_kind; the Coach, 2026-11-26 and 27).
  Every Thing carries a stored `modelkind`, `gate` or `box`, a Thing field beside its scope, which each kind's record
  fixes: "ok add a modelkind property to thing, including a column". The core reads a Thing's kind from its own
  `modelkind`, an ask's `modelkind`, or the table a row was read from. Each kind has one labelpath rule, picked by the
  stated kind: a gate's labelpath is its banklabel; a box's is `box` or `box/<label>`. A bank may be labelled `box`: its
  gate and its root box then share a labelpath, and differ by kind.
* **A Thing's scope is `modelkind, userid, banklabel, labelpath`, kind first, and names one Thing** (thread 10,
  kinded_scope; the Coach, 2026-11-27, superseding his earlier "Don't change how scope works across the database"):
  "After thinking about it more this feels like it should be the new ThingScope: modelkind, userid, banklabel,
  labelpath -- not having two scopes everywhere. In the RQ queryKeys it means that per-type differences -- say, gcTime
  -- are set once. It's how Postgres already did it: two different tables with different columns." `KindedScope` is
  gone. A bank's own scope (`BankScope`, `ThingWatchScope`: `userid, banklabel`) is not a Thing's. `TableScope`
  (`modelkind, userid, banklabel`) is a table of one bank. What is keyed by a scope puts the kind first: IndexedDB's
  key is `[modelkind, userid, banklabel, labelpath]` in its one store (whether it becomes two object stores is before
  the Coach), and every React Query key that names a Thing or a listing starts `['sok', modelkind, userid, banklabel]`.
  Memory, Postgres and Convex keep a table per kind: "There should not be a fine-grained rule conditioning the name
  and a flat table."
* **A gate's record is live or a tombstone, each with its own shape** (thread 9, gate_end; the Coach, 2026-11-27: "it
  is a tombstone -- am = x with an odd parity lifeseq -- or it is live -- even parity lifeseq and a wayin->'main' and
  ..."). Live: `am: 'a'`, an even lifeseq, `wayins.main` a wayin and `passkey0` a wayin or null. Tombstone: `am: 'x'`,
  an odd lifeseq, and `wayins: { main: null, passkey0: null }`: no wrapped key, salt or credential id survives the
  bank's end.
* **`banktok`** is a stored field of every Thing (thread 12, one_stamp; the Coach, 2026-11-27: "banktok will be bound
  into everything too"; "agreed"). The gate's, once named `lifetok`, is minted at each birth, a first birth and one over
  a tombstone alike, and kept by every write of that life, the tombstone that ends it included (the Coach, 2026-11-27:
  "I think I'm wrong about the banktok being constant: it should change with each ¿birth? with that, the box sees the
  tombstone, and is invisible on a new life"). So `BanktokMoved` refuses a write over the live gate that changes it, and
  the `banktok_cmp` tag is `'moot'` over a tombstone or no row, where a write may carry any banktok. A box stores the
  banktok of the gate it was sealed under, copied at each seal; no datastore compares it with the gate's yet (the next
  sprint's: "the boxes become shadowed when the bank (gate) is tombstoned").
* **The banktok** of a step is the banktok of the gate's row, live or a tombstone, the void banktok for none: an ended
  bank's is the banktok of the life its tombstone ends (the Coach: "the banktok should carry onto the tombstone").
* **A birth** is two puts in one step, each judged as any put is (the Coach: "A gate tombstone should not block a
  birth"). Each root's put cites that root as the device found it, the shell or its tombstone, and writes its first
  revision or its next life. Both are written where both are writable, by the ordinary write predicate, else neither.
  The gate's put answers `passed` over a live gate; the root box's refuses over a live one. A live gate with no root
  box stored is what `bankRootsMissing` refuses.
* **Unborn**: no live gate, and no live root box. A gate tombstone beside a live root box (half-ended) is broken roots.
* **`track`, `tracked`**: two entries, `gate` and `root`, the keys of the roots everywhere.

## The stamps (thread 12, one_stamp)

The constructions do not change (`Crypto.cipherCtx`, AES-GCM additional data, HKDF info, the wrap helpers). What
changes is which fields each stamp holds, and that a ctx lists **one stamp**: `cipherCtx(stamp, purpose, header?)`.
`BankStamp` is gone from every ctx (the Coach, 2026-11-27: "there's no reason to double-count properties tht are forced
to be equal").

* **A Thing's stamp**, a gate's and a box's alike: `modelkind, userid, banklabel, labelpath, banktok, fmt, am,
  lifepath, revtok, revseq, born_at, written_at`. `label` and `lifeseq` are off it, the last segments of the labelpath
  and lifepath (the Coach: "duplicated (not on stamp): label, lifeseq"; "independent: wayins, auth, sigs, meta").
* **A wayin's stamp**: `modelkind: 'wayin', userid, banklabel, labelpath, lifepath, born_at` (its gate's), `label` (its
  own), `banktok`. Its ctx's header is the rest of the wayin, without `label`. The gate's revision is off it, so a gate
  verb rewraps no other wayin.
* **A lease's stamp**: `modelkind: 'lease', userid, banklabel, banktok, gate_labelpath, gate_lifepath, gate_born_at,
  gate_revtok, fmt, born_at, proved_at, wayinkind`. Its own revision is off it: a softlock writes the next revision
  keeping the wrapped bankKey.
* **The virtual bank's properties** are its gate's `{ banktok, userid, banklabel, lifeseq, born_at }`, bound into
  nothing by themselves.
* **Uniform scope**: a lease's scope is `{ modelkind: 'lease', userid, banklabel, labelpath }`, and its record carries
  its modelkind.
* `ThingFormat` moves once for the line, with `LeaseFormat` and the root shelf's version.

## What does not change

* What a working vaultDB answers for a box.
* `safebyok-big`.

## The models

* The `Bank` Thing class goes. `World` becomes `Bank` (`models/bank.ts`) and keeps the members
  hosts called on the old `Bank`: `Bank.birth`, `Bank.birthGating`, `gate`, `rootBox`,
  `ensureUnlocked`, `dismissUnlock`, `lock`, the guards, `scope`, `stamp`, `lifetok`.
* `device.bank` is that one object from `Device.make` on, never null. Its snapshot's `stage` says
  whether it is signed out, unborn, locked or unlocked.

## Threads

1. **core_fold**: `packages/safebyok` whole (shapes, storage, minding, models, tests and the
   vaultDB battery), and `notes/vault-adapter-contract.md`. The class `World` becomes `Bank`; every
   other `World` name waits for thread 6.
2. **postgres_fold**, 3. **idb_fold**, 4. **convex_fold**, 5. **graphql_fold**: each adapter onto
   the two-root contract.
6. **world_names**: `tryGetWorld`, `GetWorldAsk`, `WorldRoots`, `WorldSnapshot` and the rest
   become bank names; `safebyok-react`, the demos and e2e follow.
7. **fold_docs**: VOCABULARY.md, READMEs, `notes/wontfix.md`, the security note, the changeset.
8. **thing_kind**: every Thing carries a stored `modelkind`; the kind is read from where it is stated; the banklabel
   `box` is allowed; the gate and box stamps carry `modelkind`.
9. **gate_end**: a gate's record is live or a tombstone, each with its own shape; a birth is two ordinary puts, citing
   what the device found; each birth mints a new lifetok, which its tombstone keeps; the roots' keys are `gate` and `root`
   everywhere; `vault.bank` always answers.
10. **kinded_scope**: `ThingScope` takes the modelkind, first, and `KindedScope` folds into it; IndexedDB's key and the
   React Query keys put the kind first; what addressed a Thing by a labelpath alone takes its scope.
11. **birth_answer**: a birth's answer and its refusals.
12. **one_stamp**: one stamp per ctx; `banktok` stored on every Thing and bound into every stamp; the lease's uniform
   scope; the Postgres notice's bank part; the line's one format bump.

## Open, for the Coach

* What a bank's end writes (a gate tombstone, and what of the root box). Nothing in the new core writes one yet.
