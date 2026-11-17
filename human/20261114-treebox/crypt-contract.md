# flat_crypts: the crypt contract

A draft, at shallow to medium depth, of the Coach's proposal (2026-11-13): replace the vault and
box tree with one kind of row, the **crypt**, addressed by a path within its bank, kept by the bank
in one flat list. The model is the plain key-value store's: a row per address, CAS on each row,
and "folders" that are only a prefix of the addresses below them.

Each part says whether it is the Coach's (**given**) or mine (**proposed**). Like every spec here
it is pseudo code: once code exists and disagrees, the code wins and this file is corrected.

**The aim is one thing to reason about per row.** A crypt has no listing of its own, no world, and
nothing hangs below it. Nothing is told anything down or up a tree: every change, a cascade
included, reaches the bank as rows, and the bank delivers each row to the one Crypt object for its
address. Where this draft seems to need more than that, it is wrong there.

## Names

Given: `crypt`, `idpath`, `folderpath`, `list`, `get`, `put`, `del`, `listChildren`, `getParent`,
`listParentage`, `life_tok`.

Given (proposed by me, "lgtm" from the Coach, 2026-11-13): `Crypt`, `CryptScope`, `CryptRecord`,
`CryptSparse`, `CryptTombstone`, `CryptStamp`; `cryptKey` and `crypt_key_wrapped` (today's boxKey
and `box_key_wrapped`); `parentpath`; `MaxCryptsPerBank`; the acts
`parent_void`, `parent_gone` and `bank_full`; the refusal `damaged_bank`, for `damaged_vault`.

Gone, if this lands: vault, box, `Vault`, `Box`, `VaultListing`, `BoxListing`, `vaultlabel`,
`boxlabel`, `vault_tok`, `box_tok`, `boxKey`, `VaultScope`, `Boxscope`, the acts `vault_void`,
`vault_gone`, `vault_reborn` and `vault_full`, the refusal `damaged_vault`, `tidyGone`, `lifeTokPathOf`, `vaultTokOfWorld`, and
the vault and box tables of `notes/answer-contract.md` (one crypt table takes their place).

Each new name goes into VOCABULARY.md in the thread that builds it.

## Addresses

Given, with the details proposed.

```text
CryptScope   { user_id, banklabel, idpath }

idpath       '/' label ( '/' label )*         any depth; at most MaxIdpathChars characters
             /main   /main/anthropic
folderpath   '/'  |  idpath '/'               the address of a crypt's children, or the bank's top
             /      /main/
parentpath   the idpath less its last label, or null at depth 1
scopepath    crypt^u1^acme^/main/anthropic
```

* **Each segment is a label** (`Patterns.label`: lowercase letters, digits and single underscores,
  2 to 40 characters). So no segment holds a `/`, a `^` or a `%`. A host percent-encodes any name
  of its own that falls outside, as now.
* **Depth is not bounded; only the idpath's length is** (given, the Coach, 2026-11-13):
  `MaxIdpathChars`, 400 proposed, ten levels of the longest label. The package does not design for
  deep trees: a deep one may be slower (a write vivifies, and a delete cascades, over more rows),
  never wrong.
* **A folderpath is `/`, or any idpath plus the slash.**
* **The bank is the top.** `/` is not an idpath and no crypt is stored there. A depth-1 crypt's
  parent is none: its `getParent()` answers null, and it reaches its bank by `crypt.bank`.

## The stored row

Proposed. One row kind takes the place of the vault row and the box row. The bank row and its gate
row are unchanged, so storage has three kinds of row, not four.

| Field | |
|---|---|
| `fmt` | 8001 |
| `user_id`, `banklabel`, `idpath` | its scope |
| `am` | `a`, `x` or `d`, as now |
| `bank_tok` | the life of the bank it belongs to: the only row above any crypt |
| `life_tok` | its own life, minted at its birth and at its delete, as `box_tok` is today |
| `revision_tok`, `revision_seq`, `registered_at`, `written_at` | as now |
| `whisper_codec`, `whisper_schema_version`, `sidecar`, `crypt_key_wrapped`, `whisper_ciphered` | as a box has them; a tombstone drops them as a box's tombstone does |

* **Every live crypt has a whisper** (proposed). A crypt used only as a folder seals `{}`. One shape
  of live row, not two; the cost is one seal at its birth.
* **A crypt carries no tok of its parent.** Today a box carries its vault's `vault_tok`, and a box
  under another is no row. Here a crypt cannot outlive its parent's life (*The parent rule* and
  *Delete cascades*), so there is nothing for such a tok to catch.
* **A row under another bank's `bank_tok` is of an ended life: it counts as no row**, as now.
* Postgres: `safebyok_crypts` keyed `(user_id, banklabel, idpath)`, with a stored `parentpath`
  column indexed beside the scope, for `list`. Its subtree is `parentpath = $idpath OR
  starts_with(idpath, $idpath || '/')`, never `LIKE`: a label's `_` is a `LIKE` wildcard.

## Keys, stamps and each ctx

Proposed. No primitive, wrap or derivation is new. What changes is the stamps a crypt's ctx
lists.

```text
CryptStamp   every sparse field of the revision sealed, idpath and life_tok among them     as a box's stamp today
```

| What is encrypted | Under | ctx today (bank_world) | ctx proposed |
|---|---|---|---|
| cryptKey, as `crypt_key_wrapped` | bankKey | `cipherCtx([bankStamp, vaultStamp, boxStamp], 'box_key_wrapped')` | `cipherCtx([bankStamp, cryptStamp], 'crypt_key_wrapped')` |
| whisper, as `whisper_ciphered` | cryptKey | `cipherCtx([bankStamp, vaultStamp, boxStamp], 'whisper_ciphered')` | `cipherCtx([bankStamp, cryptStamp], 'whisper_ciphered')` |

**This drops a binding.** Today a box's ciphertext deciphers only under its vault's life. Here a
crypt deciphers under its bank's life and its own revision, whatever its parent's life is. What
keeps a deleted crypt's whisper from being seen again under a parent made anew is storage keeping
*The parent rule* and *Delete cascades* atomically, not the cipher. A backend that breaks them on
purpose is rolling back, which no ctx here defends against either. This is a security reviewer's
decision (`notes/security.md`) and a Coach's before it is built.

**A tombstone is authenticated by nothing, today and here.** A box's revision (`revision_tok`,
`revision_seq`, `written_at`, every sparse field) is in its stamp, so it is bound into the ctx of
both ciphertexts; the boxKey itself is random and binds nothing. A tombstone has no ciphertext, so
nothing binds it: anyone who can put a row can forge one. What that buys is denial (a secret hidden,
a device locked by a bank tombstone), never disclosure.

**The Coach is not content with that** (2026-11-13): tombstones should be signed somehow, and
storage writing tombstones of its own needs thought. Open; nothing in this file settles it.

## Storage verbs

Proposed. The bankDB keeps its bank and gate verbs and `watch`. Its vault and box verbs, and
`tidyGone`, give way to four crypt verbs, each with its `try*` form. Every ask names its bank's
`bank_tok`, and every answer carries the bank row as its `parent`.

| Verb | Ask beside the scope | Answers |
|---|---|---|
| `listCrypts` | `folderpath` | every crypt row stored at `folderpath` + one label, live and tombstone, with `damaged_rows` |
| `getCrypt` | `idpath`, `ifAbsent` (`nil`, `fail`) | the row |
| `putCrypt` | `idpath`, `ifAbsent` (`add`, `fail`), `ifPresent` (`repl`, `get`, `fail`), `expected`, `record` | the row put, or found |
| `delCrypt` | `idpath`, `expected`, `record` (its tombstone) | the tombstone |

**Precedence**, first match wins: the one list of `notes/answer-contract.md`, *Operational
Checks*, with "vault" read as "bank" and two steps added for the parent:

1. Ask shape: `bad_record`.
2. Bank damaged: thrown, `damaged_bank`. Bank void, tombstoned, or live under another `bank_tok`:
   `bank_void`, `bank_gone`, `bank_reborn`. Every crypt verb judges the bank, and only the bank.
3. The crypt damaged: thrown, `damaged_row`.
4. `retcon`, then the revision comparison and its two exceptions, as now.
5. Revision matched, and the put would be `born` or `reborn`: its parent row, where it has one, is
   judged. Void refuses `parent_void`; a tombstone refuses `parent_gone`; damaged throws
   `damaged_row` with the parent's scope.
6. The flag picks the outcome, as now. `bank_full` may displace a `born`, as `vault_full` does.

A list's acts are `got` and `gotvoid`, a get's `gotlive`, `gotvoid` and `gotgone`, a put's `born`,
`reborn`, `replaced` and `passed`, a del's `deleted`: the same as a box's today, in one table.

### The parent rule

**A put that would make a crypt live, over nothing or over its tombstone, requires its parent to
be live**, judged in the same atomic unit the put stores in. A put never makes a parent, as a box
put never makes a vault today. A put that replaces a live crypt does not judge its parent: under
the cascade, a live crypt's parent is live already.

With *Delete cascades*, this keeps one invariant by construction: **every live crypt's ancestors
are live.** It is checked only at a birth, the one place it could be broken.

### Delete cascades

**`delCrypt` at an idpath tombstones that crypt and every live crypt below it, in one atomic
unit.** Its `expected` is compared with that crypt's row alone. Each crypt below takes a
tombstone without a comparison, written by storage, under a fresh `life_tok` and a revision of
seq + 1 that storage mints, its whisper removed. A crypt already a tombstone is left as it is.
This is the first place storage mints a token: today the device mints every one and storage
compares them. Today a tombstone is authenticated by nothing (*Keys, stamps and each ctx*), so one
storage writes is no weaker than today's; that today's is unsigned is itself open, and storage
writing them needs thought (the Coach, 2026-11-13).

* **Tombstones, not removal, below.** Another device that holds `/main/anthropic` and puts it then
  meets a tombstone and refuses `stale`, an expected refusal it can act on. Were the rows removed,
  it would meet nothing under a seq of its own, which is `ahead`, the impossible class.
* **What it deletes unseen is the caller's choice to make**, as `delVault` today ends boxes that the
  caller never fetched.
* **The answer is the tombstone alone, and it carries the imperative** (given, the Coach,
  2026-11-13): a bank that receives a crypt's tombstone tombstones every crypt it has below it.
  Open: the crossings of that with rows and notices that arrive out of order.
* **Its size is bounded by the soft cap**: a bank holds at most `MaxCryptsPerBank` rows, live and
  tombstone together. On a datastore with a cap on a transaction's writes, such as DynamoDB's 100,
  the adapter's cap is at most that.
* `delBank` is unchanged: it leaves the bank's tombstone and removes the gate row and every crypt
  row in one step.

## The models

Proposed. Device and Gate are unchanged. The bank keeps the one flat listing of crypts, and a
Crypt is a Storable of one row.

```text
Bank                                                    as in bank_world, less the vault listing
  #crypts: CryptListing                                 every Crypt this bank has met, by scopepath
  list({ folderpath, ...ask }): Promise<Crypt[]>        listCrypts; delivers each row
  get({ idpath, ...ask }): Promise<Crypt | null>        getCrypt, unless the one in hand is timely
  put({ idpath, whisper, sidecar?, ...ask }): Promise<Crypt>       sealed under the bank's lease; putCrypt
  del({ idpath, ...ask }): Promise<Crypt>               delCrypt; delivers the tombstone, which tombstones each crypt below
  cryptAt({ idpath }): Crypt | null                     what is in hand, without asking storage
  lock(), autolock(), sweep(), vacate(), delPrompt()    as a whole: each runs over #crypts once

Crypt extends Storable<CryptScope, CryptRecord, CryptSparse, CryptSnapshot>
  bank, idpath, depth, label, parentpath, folderpath
  life_tok, bank_tok, the revision and times, sidecar
  whisper, exposure ...                                 as a Box has them today
  get(), put({ whisper?, sidecar?, ...ask }), del()     each the bank's, at its own idpath
  listChildren(): Promise<Crypt[]>                      bank.list({ folderpath })
  getParent(): Promise<Crypt | null>                    bank.get({ idpath: parentpath }); null at depth 1
  listParentage(): Promise<Array<Crypt | null>>         each ancestor as bank.get answers it, the top first
```

* **One Crypt object per idpath, through its lives**, as a Box is today. A tombstone stays listed,
  `isPresent` false, and a put over it makes the same object live again under a new `life_tok`. A
  Vault through its lives was trouble because it carried a box listing and a watch that had to be
  remade at each life (Closer Look E5, 1.5). A Crypt carries neither.
* **Parent and children are lookups by path, never references.** A Crypt holds no Crypt. A
  delivered tombstone of `/main` changes the Crypt for `/main`, and the bank then tombstones each
  Crypt it lists below `/main/`: one pass over one flat list, not a message down a tree.
* **No Crypt has an enabled flag, a sweep or a vacate.** Each verb starts with
  `bank.demandEnabled()`; a put or a del then needs the bank unlocked. `crypt.lock()` stays, as the
  one duty at a discard: drop the exposed whisper.
* **One watch, the bank's.** `bank.beginWatch()` notices every crypt row of the bank, and each is
  delivered like an answer's row. No watch belongs to a crypt or a folder.
* **The bank's snapshot lists its present crypts flat**, sorted by idpath. A host that draws a tree
  draws it from the paths.

## What a host writes

```ts
const bank = await device.ensureBank()
await bank.beginWatch()
await bank.ensureUnlocked()
await bank.put({ idpath: '/main', whisper: {}, ifAbsent: 'add', ifPresent: 'get' })
const crypt = await bank.put({ idpath: '/main/anthropic', whisper: { apiKey }, ifAbsent: 'add' })
const siblings = await bank.list({ folderpath: '/main/' })
await bank.del({ idpath: '/main' })                    // /main/anthropic is tombstoned with it
```

## Before 1.0

A new row kind with a new `fmt`, so no stored vault or box reads as a crypt. A host's existing
vaults and boxes read as absent: its users see an empty bank, and must enter their secrets again
unless the host copies them over with code of its own. The changeset says so.
