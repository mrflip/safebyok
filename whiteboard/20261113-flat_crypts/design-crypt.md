# flat_crypts: the crypt

2026-11-13. An exploration, not a plan: no thread is cut from this file until the Coach has ruled
on *Open matters*.

Each part says whether it is **given** (the Coach's sketch, below), **proposed** (mine, filling a
gap the sketch leaves) or **open** (a decision I could not make from the sketch). Like any spec
here this is pseudo code.

**Nothing here is meant to end up more complicated than what it replaces.** The crypt replaces
row kinds, verbs and classes, and adds no concurrency device. Where a part of this file seems to
ask for more machinery than the code has today, the file is wrong there.

## The sketch (given, the Coach, 2026-11-13)

> A crypt holds a whisper/sidecar, a revision, an idpath and a lifepath. It has a parent, children,
> a parentage (list of ancestor crypts starting with root; `[...parentage, self]` is your
> heritage); children (list of crypts) and descendants (legacy is self + descendants): these
> resolve sync.
>
> The idpath starts with a slash followed by one or more slash-joined idsegs (an idseg is lowercase
> `\w+`, starts with a letter, never a `__+` and no `_` at the end). Each crypt has a life_seq, an
> integer that increments by one on each deletion and on each creation. Your lifepath can be
> carried as a string with 10-character base-32 segments, slash joined.
>
> Crypts support CAS get/put/del with the same ifPresent/ifAbsent semantics; we will use the term
> "ensure" for put(ifAbsent: add, ifPresent: get).
>
> Bank offers list(listpath), where listpath has '/' as its first and last characters, with zero or
> more '/'-joined segments in between.
>
> Receiving a tombstone at Bank tombstones that crypt, and disables and delists every one below it
> in tree order.

The sketch says nothing of the bank row or the gate. This file's baseline leaves both as
bank_world built them, so the crypt takes the place of the vault row and the box row. *The bank
and its gate* proposes going one step further.

## The crypt in one picture

```text
bank  { user_id: 'u1', banklabel: 'acme' }

idpath              lifepath                              what it is today
/main               /0000000001                           the vault `main`
/main/anthropic     /0000000001/0000000001                the box `anthropic` in it
/main/openrouter    /0000000001/0000000003                a box deleted once and put again
/team               /0000000003                           a vault deleted once and put again
/team/shared        /0000000003/0000000001
/team/shared/groq   /0000000003/0000000001/0000000001     a third level, which today has no place
```

One kind of row, in one table, keyed by the bank's scope and the idpath. A crypt with crypts below
it does what a vault does today, and a crypt with none does what a box does. Nothing in the row
says which.

## Paths

* **idseg** (given). Lowercase letters, digits and underscores, starting with a letter, with no
  `__` and no `_` at the end.
* **idpath** (given). `/`, then one or more idsegs joined by `/`: `/main/anthropic`. It is a
  crypt's address within its bank, and the ckey of the bank's listing. A crypt's **depth** is its
  number of idsegs. A crypt of depth 1 is a **root**.
* **listpath** (given). `/` alone, or an idpath with `/` added: `/`, `/main/`. It names every
  crypt whose idpath begins with it, so `/` names every crypt of the bank and `/main/` names
  everything below `/main`, and never `/mainline`.
* **Tree order is plain string order** (proposed). `/` sorts below every character an idseg may
  contain, so idpaths sorted byte by byte put each crypt directly before the crypts below it.
  Everything a listpath names is then one unbroken range, which every datastore we have can ask
  for: `idpath >= '/main/' AND idpath < '/main0'`. On Postgres the column needs `COLLATE "C"`, or
  the server's locale decides the order.
* **An idseg is a `label`** (proposed, open matter 3). The sketch's rule is `Patterns.label`'s with
  one difference: a label is 2 to 40 characters, and the sketch allows one letter. With one rule
  there is one pattern, one phrase and one `maxLength` for a host's input.
* **Bounds** (proposed). An idpath has at most 8 idsegs (`MaxIdpathSegs`, a placeholder), so at
  most 328 characters. It is checked by splitting on `/` and checking each idseg as a label,
  because a pattern with a repeated group is what `Patterns` avoids.

## Lives

* **life_seq** (given). An integer, one more at each creation and each deletion of the crypt. A
  crypt never stored is at 0, which is what its shell cites. Its first life is 1, that life's
  tombstone 2, its second life 3.
* **lifepath** (given). The life_seq of each crypt of the heritage, root first, each as 10
  characters of base 32, joined by `/`.
* **It counts within one life of the crypt above** (proposed). When `/team` is deleted and put
  again, a crypt put at `/team/shared` starts again at 1. Its lifepath is still new, because the
  segment for `/team` is.
* **A row is of the current life when every row above it agrees** (proposed). Each prefix of its
  lifepath must be the stored lifepath of the live row above, level by level. A row that fails this
  is of an ended life: it counts as no row, as a box row under another `vault_tok` counts as no row
  today. A put over it cites the shell.
* **Encoding** (proposed). The digits `0-9a-v`, which is what `n.toString(32)` writes and
  `parseInt(seg, 32)` reads, padded to 10 with `0`. No codec is written, and a lifepath sorts in
  the order of its numbers. Ten characters count to 2^50, inside a JavaScript safe integer.
* **A leading slash** (proposed), so segment *i* of a lifepath pairs with idseg *i* of the idpath
  and one split serves both.
* **The row stores `lifepath` alone** (proposed). `life_seq` is its last segment, a getter on the
  model. An adapter may keep it as a column of its own for its SQL.

The lifepath takes the place of `vault_tok`, `box_tok` and the pair `${bank_tok}/${vault_tok}`.
It also settles the item bank_world left as *watched for, not built* (`life_tok` in every row):
one stored name says the crypt's own life and the life of everything above it.

What changes when a life is counted, not minted at random:

| | Random tok today | life_seq |
|---|---|---|
| Two lives compared | different, and nothing more | which is the later |
| A put's or del's record | "new: neither the expected tok nor the void one" | the expected life_seq, or one more where liveness changes |
| Odd or even | | odd is live, even is gone. It follows from the count. `am` stays the tag, and nothing reads liveness off the number |
| What keeps two lives apart | the mint | the tombstone staying where it is |

The last row is the cost. If a tombstone's row is removed from under a live crypt, the count there
starts again and a lifepath can repeat. No primitive does that, and `tidyGone` must not: it removes
rows of ended lives, never a tombstone that is itself of a current life. A raw delete can. What still tells two rows apart then is what tells two revisions apart now: `revision_tok` is
random at every put and del, and `registered_at` is in the stamp. This is open matter 2.

## The stored row

```text
CryptRecord                                     fmt proposed 8001
  fmt
  user_id, banklabel, idpath                    its address
  bank_tok                                      its bank's life, as a vault row has now (baseline only)
  lifepath
  am                                            'a'
  revision_tok, revision_seq                    as now: a new tok and seq + 1 at every put and del
  registered_at, written_at                     as now
  sidecar                                       as now: unencrypted, bound by no ctx, {} for none
  whisper_codec, whisper_schema_version         as a box's now
  whisper_key_wrapped, whisper_ciphered         a box's box_key_wrapped and whisper_ciphered

CryptTombstone                                  am 'x', the sparse fields, as a box's tombstone now
CryptSparse                                     as a box's sparse form now
CryptScope                                      { user_id, banklabel, idpath }
```

* **Every live crypt is sealed** (proposed, open matter 5). A crypt put with no whisper seals `{}`,
  as one put with no sidecar stores `{}`. There is then one record shape and no crypt that is
  half a box. The cost is a key, a wrap and a cipher for a crypt used only as a folder. A put
  already needs the bank unlocked (R4), so no new call asks the user.
* **No `am: 'd'` and no `damaged_rows`** (proposed, open matter 6), following the Coach's "damage
  is an agent obsession I thought I'd ruled out" (`notes/design-vaultdb.md`, *Areas of Concern*).
* Postgres: `safebyok_crypts` keyed `(user_id, banklabel, idpath)`, in place of `safebyok_vaults`
  and `safebyok_boxes`.

## The tree, resolved sync

All given. Each is a getter on a `Crypt`, and each reads the bank's listing and never storage.

| Getter | Answers |
|---|---|
| `parent` | the crypt one idseg up, or null for a root |
| `parentage` | every crypt above, root first |
| `heritage` | `[...parentage, self]` |
| `children` | the listed crypts one idseg below, in tree order |
| `descendants` | every listed crypt below, in tree order |
| `legacy` | `[self, ...descendants]` |

* **The bank has one listing** (proposed): a map from idpath to `Crypt`. That is the "flat" of the
  thread's name. A crypt keeps no pointer to its parent or its children, so there is no second
  copy of the tree to keep in step. Each getter works its answer out from the map when called.
* **A listed crypt's parentage is listed** (proposed), so `parent` is null only for a root. It
  holds because every answer carries the rows above the one asked for, and the bank receives those
  first, root first, as a box listing delivers its vault's row first today.
* **`children` and `descendants` are what the bank has listed**, no more. A crypt that no list or
  get has fetched yet is not among them. `bank.list(listpath)` is how a host makes them whole.

## Storage verbs

Given: get, put and del by compare-and-swap, with today's `ifAbsent` and `ifPresent`, and a list by
listpath. Proposed: their names and what follows.

| Verb | Acts on | Answers |
|---|---|---|
| `getCrypt` | the row at an idpath | the row |
| `putCrypt` | the same | the row put, or the live one found (`passed`) |
| `delCrypt` | the same | its tombstone |
| `listCrypts` | every row a listpath names | the sparse rows of a current life, in tree order |

They take the place of `getVault`, `putVault`, `delVault`, `listBoxes`, `getBox`, `putBox` and
`delBox`: seven verbs become four. `watch` and `tidyGone` stay.

* **The ask** is today's with one address: `{ op, user_id, banklabel, idpath, lifepath, ifAbsent,
  ifPresent, expected, record }`. `expected` is the row the caller has, or the shell: its revision,
  its `am` and its lifepath. The acts and their precedence are `notes/answer-contract.md`'s box
  table, with the lifepath where a life tok is compared.
* **ensure** (given) is `putCrypt` with `ifAbsent: 'add'` and `ifPresent: 'get'`. It answers
  `born`, `reborn` or `passed`.
* **The rows above** (proposed). A verb fetches the row at each prefix of its idpath in the step
  that fetches its own: one lookup by primary key per level. They are judged root first, and the
  first that fails refuses the verb with the row asked for unchecked:

  | A row above is | Refuses | Takes the place of |
  |---|---|---|
  | none, or of an ended life | `parentage_void` | `vault_void` |
  | a tombstone | `parentage_gone` | `vault_gone` |
  | live, at another life_seq than the ask's lifepath cites | `parentage_reborn` | `vault_reborn` |

  In the baseline a root's row above is the bank row, judged first as now (`bank_void`,
  `bank_gone`, `bank_reborn`).
* **A put makes one crypt** (proposed). `putCrypt` at `/team/shared/groq` with no `/team/shared`
  refuses `parentage_void`. The host ensures each level.
* **An answer's `parentage`** (proposed) has the rows above, root first, where an answer has
  `parent` now.
* **`delCrypt` stores one tombstone** (proposed). Every row below is then of an ended life by the
  rule under *Lives*, whether or not storage has touched it. The adapter also removes the rows the
  crypt's listpath names in the same step where the datastore can, because a deleted crypt's
  sidecars should not stay readable in storage. No check depends on that removal.
* **`listCrypts` answers the whole range** (proposed, open matter 4): every crypt below the
  listpath, at every depth, not the next level alone. `listCrypts('/')` is then the one call that
  brings a bank's tree up.
* `vault_full`, the soft cap on a vault's boxes, has no place yet (open matter 4).

## Receiving

Given: a tombstone received at the bank tombstones that crypt, and disables and delists every
crypt below it in tree order. Proposed: the rest.

* The bank receives every row: from an answer, its `parentage`, or a notice of the watch. Rows
  above are received first.
* **A `Crypt` object stands for its idpath through its own lives, within one life of its
  parentage** (my reading of "tombstones that crypt", open matter 7). The crypt at the deleted
  idpath adopts the tombstone and keeps its place in the listing, as a deleted vault does now. A
  later life at that idpath is received into the same object.
* **A crypt whose life_seq changes ends everything listed below it.** That covers the tombstone,
  and also a later life whose tombstone this device never saw. Each crypt of its `descendants` is
  disabled and delisted, in tree order, in one synchronous pass before any listener is told.
* **A disabled crypt is disabled for good.** It refuses every call. It drops any whisper it has
  exposed, by the same `alignLock()` call bank_world's design says a redesign must keep.
* Which of two rows is the newer is judged by `revision_seq`, as `cmpRevisions` does now.
* There is one watch, on the bank's scope (proposed). `vault.beginWatch()` goes.

## Keys, stamps and each ctx

No primitive, wrap or derivation is new, and the rule is unchanged: a thing binds its own stamp
and the stamps of whatever contains it. What contains a crypt is its bank and its parentage.

```text
CryptStamp     { user_id, banklabel, idpath, lifepath, registered_at }     fixed for one life of the crypt; VaultStamp's place
sealed stamp   every sparse field of the revision sealed                   as a box's now

whisperKey, as whisper_key_wrapped   under bankKey      cipherCtx([bankStamp, ...parentage's CryptStamps, sealed stamp], 'whisper_key_wrapped')
whisper, as whisper_ciphered         under whisperKey   the same stamps, 'whisper_ciphered'
```

* The wayins, the lease and the bankKey are as bank_world left them. Nothing about them moves in
  the baseline.
* **`boxKey` needs a name** (open matter 8). I propose `whisperKey`: a key is named for its role,
  and this one ciphers the whisper. `cryptKey` reads as "some cryptographic key".
* **For the security reviewer**: the life a ctx binds becomes a count where it was a random token.
  The cost is under *Lives*. Once ruled it goes to `notes/security.md`.
* `notes/guarantees.md`: no secret moves. The same keys are in the same handles, made and dropped
  in the same places. The files it names change when this is built, and each thread checks its
  section then.

## The bank and its gate (open matter 1)

**Baseline: both stay as bank_world built them.** The bank row, its `main` gate row, `bank_tok`,
`gate_tok`, `ensureBank`, `buildBank`, `delBank`, the three gate verbs, `Device`, `Bank`, `Gate`,
`Gating`, `Proving` and `Lease` are untouched. A crypt row has `bank_tok`, and a root's row above
is the bank row. Storage has three kinds of row and eleven verbs, where it has four and fourteen
(`tidyGone` counted in both).

**Proposed, one step further: the gate is the root crypt, and the bank has no row.**

```text
/main                 the gate: its sidecar is { wayins, auth, sigs, meta }, and it has no whisper
/main/keys            what was the vault `keys`
/main/keys/anthropic
```

| Today | Becomes |
|---|---|
| the bank row and the gate row | the root crypt |
| `bank_tok` and `gate_tok` | the root's lifepath, `/0000000001` |
| `gate_revision_tok` on a lease | the root's `revision_tok` |
| `buildBank` | `putCrypt` of the root, as an ensure |
| `replacePassphrase`, `addPasskey`, `revokePasskey` | `putCrypt` of the root, `ifPresent: 'repl'` (plain puts already, since #692) |
| `delBank`, and its cascade | `delCrypt` of the root: everything below is of an ended life |
| `ensureBank` | `listCrypts('/')` |
| `BankListing` and `GateListing`, the stubs | nothing: the root is in the bank's one listing |

Storage then has one kind of row and five verbs (the four, and `tidyGone`), and no verb's answer
depends on changing more than one row in its step.

What argues for it:

* **The twins go.** bank_world's *Which token changes when* has four columns of which two pairs
  always change together, "which is where the confusion comes from". A root crypt has one life
  and one revision.
* **It answers most of R11**, the ruling that gave the bank a row. Things join on the root and are
  deleted with it. There is no second absent state, because there is one row. The root has a
  `registered_at` of its own.
* **`Bank` has no row, so it has no fields waiting on one.** "No bank yet" becomes "the root is
  not listed yet", which is how every crypt starts. Whether `device.bank` can then stop being
  nullable is not designed here.

What it costs:

* **It reverses R11 in one case**: a second gate onto the same crypts. R11 named a second gate,
  and wanted it and every vault checked against the bank row, not against a sibling. Here a second
  gate is a second root with its own bankKey and its own tree. If two gates must unlock the same
  crypts, this proposal is wrong and the baseline is right.
* **The root is a second shape of the one row**, told apart by its depth. Its sidecar is the
  core's, not the host's; it has no whisper; a host's put at depth 1 refuses, and only a gating
  puts it.
* Every idpath a host writes begins `/main/`.
* A verb on a depth-2 crypt fetches the gate row above it, wayins and all, where a vault verb
  fetches the small bank row today.

**My recommendation**: take the further step if a second gate onto the same crypts is not wanted,
and stay with the baseline if it is. I cannot tell which from the sketch or from R11.

## What goes, in the baseline

* Models: `Vault`, `Box`, `VaultListing` and `BoxListing` become `Crypt` and the bank's one
  listing. `Storable` and `Listing` then each have one user (two with the stubs), which is the
  moment to ask whether either is still a base class.
* Storage: seven verbs become four; the vault table, the box table and their two families of
  "row above" acts become one table and one family.
* Names: `vault_tok`, `box_tok`, `vaultlabel`, `boxlabel`, `VaultScope`, `Boxscope`, `boxKey`,
  `box_key_wrapped`, `vault_void`, `vault_gone`, `vault_reborn`, `vault.beginWatch`, `ensureVault`,
  `putBox`, `getBox`, `fetchBox`, `delBox`.
* VOCABULARY: **crypt**, **idseg**, **idpath**, **listpath**, **life_seq**, **lifepath**,
  **parentage**, **heritage**, **legacy** come in. Whether **vault** and **box** stay, as the
  words for a crypt with crypts below it and one with none, is open matter 8. `crypt` is also
  the start of `crypto`: search for it as `rg -w crypt`.
* Before 1.0 nothing binds backward: a stored vault or box row fails the crypt's check and reads
  as absent. The changeset says so.

## What a host writes

Baseline. With the further step every idpath gains `/main` in front.

```ts
const device = Device.make({ user_id, banklabel: 'acme', bankDB, deviceDB, keyDeriver, gates: ['main'] })
const bank   = await device.ensureBank()                    // as now
await bank.beginWatch()                                     // the one watch
await bank.ensureUnlocked()                                 // as now
await bank.list('/')                                        // every crypt of the bank, sparse

const keys   = await bank.ensure('/keys')                   // put with ifAbsent 'add', ifPresent 'get'
const crypt  = await bank.put('/keys/anthropic', { whisper: { apiKey }, sidecar: { team: 'research' } })

keys.children                                               // [crypt], sync
crypt.parentage                                             // [keys]
bank.at('/keys/anthropic')                                  // crypt, sync, or null
await crypt.extractWhisper()                                // { apiKey }
await keys.del()                                            // keys is a tombstone; crypt is disabled and delisted
```

The bank has `get`, `put`, `ensure`, `del` and `list` by idpath or listpath, and `at` for what is
listed. A crypt has `get`, `put`, `del` and `extractWhisper` on itself.

## Open matters

| # | Matter | My recommendation |
|---|---|---|
| 1 | Do the bank row and the gate row stay, or does the gate become the root crypt? It turns on whether a second gate must unlock the same crypts. | The root crypt, unless that second gate is wanted. |
| 2 | A life bound into a ctx becomes a count, not a random token. A tombstone removed by hand lets a lifepath repeat. | Accept it: `revision_tok` stays random and stays in the sealed stamp, and `tidyGone` is written to keep the tombstones that carry a count. A Coach's yes is needed before it is built. |
| 3 | Is an idseg exactly a `label` (2 to 40 characters), or may it be one letter? How deep may an idpath go? | A label. Eight idsegs, until someone needs more. |
| 4 | Does `list` answer everything below the listpath or the next level only? Where does the soft cap (`vault_full`) go: on a crypt's children, or on the bank's crypts? | Everything below: it is the range a listpath already is. A cap on the bank's crypts, counted at a `born`. No paging until a bank is shown to need it. |
| 5 | Is every live crypt sealed (`{}` for no whisper), or may a crypt have no whisper? | Sealed, for one record shape. The further step of matter 1 makes the root the one exception. |
| 6 | With no `am: 'd'` and no `damaged_rows`, what does a list do with a row that fails its checks? | Leave it out and report it through `onBadNews`, which exists. A get, put or del at it throws `damaged_row`. |
| 7 | Is one `Crypt` object one life, or its idpath through its own lives? | Through its own lives, within one life of its parentage: the sketch tombstones the crypt and disables only those below. |
| 8 | Names: `whisperKey` for `boxKey`? Do **vault** and **box** leave the vocabulary? | `whisperKey`. Both leave the code and the stored fields; a host's own docs may keep them. |

## Not designed

* Moving or renaming a crypt. An idpath is its address, and the sealed stamp binds it, so a move
  is a put at the new idpath and a del at the old.
* A watch narrower than the bank.
* A gate anywhere but at a root.
* `safebyok-react`'s hooks over a tree.
* The threads. This file is cut into them once the open matters are ruled.
