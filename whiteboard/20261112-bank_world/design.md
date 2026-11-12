# bank_world: the design

What the threads of `threads.md` build to. Each part says whether it is **ruled** (the Coach,
2026-11-12, recorded in `rulings.md`) or **proposed** (mine, following from the rulings). Nothing in it is open; what the Coach put off is listed at the end.

**Nothing here is meant to end up more complicated than what it replaces.** The design moves
facilities the code has today from the vault to the bank and adds none: no concurrency device
(counter, timer, abort controller, join, queue, lock, retry) that is not in the code now. A race
or an edge case is handled where today's code handles its counterpart, and otherwise reported, not
solved (`threads.md`, ground rules 1 to 3). Where a part of this file seems to ask for more, the
file is wrong there. Like any spec here this is pseudo code: where it and the code disagree once the code
exists, the code wins and this file is corrected.

## Names

Ruled: `banklabel`, `bank_tok`, `gate_tok`, `gatelabel` (`main`), `wayinlabel` (`main` for the
passphrase wayin, `passkey0` for the passkey wayin), `bankKey`, `bank_key_wayin_wrapped`,
`bank_key_lease_wrapped`, `bank.maingate`, `BankDB`, `ensureBank`, `vault.beginWatch`, the gate's
`auth`, `sigs` and `meta` bags, the gatingkinds `build_bank`, `unlock_bank`, `replace_passphrase`, `add_passkey`,
`revoke_passkey` and `del_bank`, the refusal `bank_locked`, and `parent` for the row above on an
answer.

Proposed: `BankStamp`, `GateStamp`; `BankRecord`, `GateRecord` and their tombstones and rows; the
storage verbs `buildBank` and `delBank`; the acts `bank_void`, `bank_gone` and `bank_reborn`; the
wayin purposes `bank_key_passphrase_wrapped` and `bank_key_passkey_wrapped`.

Gone: `applabel`, `gate_epoch` and `FirstGateEpoch`, `passphrase_wayin` and `passkey_wayin` as
slots, `world` as the word for what a vault or a box is handed, `vaultKey`, `vault_key_wayin_wrapped`, `vault_key_lease_wrapped`,
`build_vault`, `unlock_vault`, `del_vault`, `vault_locked`, `vault.hello`, `listVaults`.

## Scopes

```text
BankScope    { user_id, banklabel }
GateScope    { user_id, banklabel, gatelabel }             gatelabel is lit('main')
VaultScope   { user_id, banklabel, vaultlabel }
Boxscope     { user_id, banklabel, vaultlabel, boxlabel }

scopepath    bank^u1^acme     gate^u1^acme^main     vault^u1^acme^main     box^u1^acme^main^anthropic
lease        [user_id, banklabel]                            LeaseScopepath, two strings
```

## Stored rows

Every row has `fmt`, its scope, `am`, `revision_tok`, `revision_seq`, `registered_at` and
`written_at`, as now. Each row also carries the life tok of the row above it and one of its own.
Format numbers are proposed: the renames of threads 1 and 2 move box, vault and lease to 5002, 6002
and 7002, and a shape changed after that moves once more.

| Row | `fmt` | Row above | Its toks | Beside those |
|---|---|---|---|---|
| bank | 3001 | none | `bank_tok` | nothing |
| gate | 4001 | bank | `bank_tok`, `gate_tok` | `wayins`, `auth`, `sigs`, `meta` |
| vault | 6003 | bank | `bank_tok`, `vault_tok` | nothing |
| box | 5003 | vault, and the bank | `bank_tok`, `vault_tok`, `box_tok` | `whisper_codec`, `whisper_schema_version`, `sidecar`, `box_key_wrapped`, `whisper_ciphered` |
| lease (device) | 7003 | | `bank_tok`, `gate_tok`, `gate_revision_tok` | the bank's `registered_at`, `gatelabel`, `proved_at`, `wayinkind`, `lease_key`, `bank_key_lease_wrapped` |
| device row (device; today its "bank row") | none | | | `device_tok` (today `device_id`) |

* **The bank has a row** (ruled, over my recommendation; `rulings.md`, R11). It has the bank's scope,
  `bank_tok`, a revision, the bank's `registered_at`, and nothing encrypted, as a vault row has
  nothing encrypted. Gate rows and vault rows join on it, are checked against it, and are deleted
  with it.
* **A live bank row has a live `main` gate row.** `buildBank` puts both in one step, and nothing
  deletes the `main` gate but `delBank`. A bank row without one is damage, not a state.
* **A box row carries `bank_tok` as well as `vault_tok`** (the Coach, 2026-11-12): "treat their
  concatenation as a virtual parent_tok life token (join with '/' to use as a string; in SQL
  you'll set separate predicates)". A box's parent life is `${bank_tok}/${vault_tok}`, compared with
  the vault row's own, so a box verb also sees a vault row left from an ended bank.
* **A tombstone** keeps the row's sparse fields under a new life tok of its own, as now. Only the
  bank row leaves one at `delBank`: its gate, vault and box rows are deleted in that step.
* **A gate's wayins are a bag by `wayinlabel`** (ruled): `wayins: { main, passkey0? }`, `main` a
  passphrase wayin and `passkey0` a passkey wayin, each with its own `wayinlabel` field. A wayin is
  otherwise as now, with `bank_key_wayin_wrapped` for `vault_key_wayin_wrapped`, and has no other
  new field.
* **`auth`, `sigs` and `meta`** (ruled) are on the gate row alone, each checked as an empty bag,
  `{}`. None is bound: they are in no stamp and no ctx. They are places kept for later (a carrier
  for an authorization, and what authenticates it), and nothing reads them.
* **A vault row has nothing encrypted**, so its record and its sparse form are the same fields and
  a vault is never partly loaded.
* Postgres: `safebyok_banks` keyed `(user_id, banklabel)`; `safebyok_gates` keyed
  `(user_id, banklabel, gatelabel)` and `safebyok_vaults` keyed `(user_id, banklabel, vaultlabel)`,
  each with a foreign key to the bank; `safebyok_boxes` as now under the new names.

## Keys, stamps and each ctx

Ruled (R1): one random master key per bank, `bankKey`, wrapping each boxKey. No primitive, wrap or
derivation is new. What moves is which stamps a ctx lists and which fields a stamp has. The last
column is ruled ("lgtm", 2026-11-12), with the caution under *Which token changes when*.

```text
BankStamp    { user_id, banklabel, bank_tok, registered_at }                  the bank row's; fixed for the bank's life
GateStamp    { user_id, banklabel, gatelabel, gate_tok, registered_at }       the gate row's; fixed for the gate's life
VaultStamp   { user_id, banklabel, vaultlabel, vault_tok, registered_at }     as now, banklabel for applabel
LeaseStamp   { fmt, ...BankStamp, gatelabel, gate_tok, gate_revision_tok, proved_at, wayinkind }   all of the lease but its key material
box stamp    every sparse field of the revision sealed                        as now
```

| What is encrypted | Under | ctx today | ctx proposed |
|---|---|---|---|
| bankKey, as a wayin's `bank_key_wayin_wrapped` | wayinKey | `cipherCtx(vaultStamp, purpose, header)` | `cipherCtx([bankStamp, gateStamp], purpose, header)`, the header now with `wayinlabel` |
| passkeyKey's HKDF `info` | | the same ctx | the same ctx |
| bankKey, as `bank_key_lease_wrapped` | leaseKey | `cipherCtx([vaultStamp, leaseStamp], 'vault_key_lease_wrapped')` | `cipherCtx([bankStamp, leaseStamp], 'bank_key_lease_wrapped')` |
| boxKey, as `box_key_wrapped` | bankKey | `cipherCtx([vaultStamp, boxStamp], 'box_key_wrapped')` | `cipherCtx([bankStamp, vaultStamp, boxStamp], 'box_key_wrapped')` |
| whisper, as `whisper_ciphered` | boxKey | `cipherCtx([vaultStamp, boxStamp], 'whisper_ciphered')` | `cipherCtx([bankStamp, vaultStamp, boxStamp], 'whisper_ciphered')` |

The one rule, followed a level further each way: a thing binds its own stamp and the stamps of
whatever contains it. A wayin is in a gate in a bank; a box is in a vault in a bank.

### Which token changes when: a best guess

The Coach, 2026-11-12: when the gate's tok rotates "keeps being confusing"; write the best guess
down, and **when tests start failing, remember there are three candidates to rotate on: the gate's
`gate_tok`, the gate row's `revision_tok`, and the bank row's `revision_tok`.** A failing lease or
ctx test in this line is first read against this table, before anything is changed.

| Event | `bank_tok` | bank row's `revision_tok` | `gate_tok` | gate row's `revision_tok` |
|---|---|---|---|---|
| `buildBank` | new | new | new | new |
| `replacePassphrase`, `addPasskey`, `revokePasskey` | kept | kept | kept | **new** |
| `putVault`, `delVault`, any box verb | kept | kept | kept | kept |
| `delBank` | new, on the tombstone | new | the row is deleted | the row is deleted |

| What | Cites or binds | So it stops working at |
|---|---|---|
| a box's two ciphertexts, a wayin's wrap, a lease's wrap | `bank_tok`, through the bank's stamp | `delBank` |
| a wayin's wrap | `gate_tok`, through the gate's stamp | the gate's delete; never a gate verb, or every wayin would be wrapped again at each |
| a cached lease | `gate_tok` and `gate_revision_tok` | any gate verb, on any device: the other devices prove again, as `gate_epoch` made them |
| a vault row; a box row | `bank_tok`; `vault_tok` | `delBank`; `delVault` |
| any put or del | the `revision_tok` of the row it expects to find | another put or del of that row |

Two of the four columns are twins today, which is where the confusion comes from. The bank row is
put by `buildBank` and `delBank` alone, so its `revision_tok` changes exactly when `bank_tok` does.
The `main` gate is built and deleted with its bank, so its `gate_tok` does too. They come apart
only when something else puts the bank row, or a gate that is not `main` is built or deleted.

Whether a wayin change should go on making other devices prove again is **put off to the end of
the sprint** (the Coach: "yeah probably"). Until then the lease is built to keep that behaviour, by
`gate_revision_tok`: one field for `gate_epoch`, so the tests of it keep their meaning. Dropping
it later changes a device's cache row and nothing in storage.

## BankDB

Fourteen verbs and `watch`, each with its `try*` form, against `VaultDB`'s twelve.

| Verb | Acts on | Answers | `parent` |
|---|---|---|---|
| `ensureBank` | the bank row | the gate rows named in `gates`, the vault rows, the damaged rows | the bank row |
| `buildBank` | the bank row and its `main` gate row, in one step | the gate row put, or the live one found (`passed`) | the bank row |
| `replacePassphrase`, `addPasskey`, `revokePasskey` | the gate row | the row put | the bank row |
| `delBank` | the bank row, and every gate, vault and box row under it | the bank's tombstone | none |
| `getVault`, `putVault`, `delVault` | a vault row | the row | the bank row |
| `listBoxes`, `getBox`, `putBox`, `delBox` | box rows | the rows | the vault row |
| `tidyGone` | the vault and box rows of an ended life, under the bank | a count of the rows deleted | none |
| `watch` | a bank scope, or a vault scope | notices of bank, gate and vault rows, or of box rows | |

`ensureBank`'s ask is `{ op, user_id, banklabel, gates: ['main'] }`, and `gates` must be exactly
that (ruled). There is no `getGate` and no `listVaults`: a bank that wants its gate or its vaults
again asks `ensureBank` again. As a storage verb it fetches, and where no bank is stored it answers
no rows: only `buildBank`, behind its gating, puts a bank. Which model call makes that an ensure
is *The startup gap*.

### The row above

Each verb fetches the row above in the step that fetches its own, and it is judged first:

| Row above | A gate or vault verb refuses | A box verb refuses |
|---|---|---|
| none | `bank_void` | `vault_void` |
| a tombstone | `bank_gone` | `vault_gone` |
| live, under another life tok than the ask cites | `bank_reborn` | `vault_reborn` |

A row whose tok for the row above is not that row's own is of an ended life: it is no row, as a
box row under another `vault_tok` is no row today.

### The gate verbs' policy

Ruled (R3): shared policy, not shared code. This table is the policy. The device checks it before
the call, and storage checks it in the step that puts the row, best as a stored procedure of the
database's own. The two may look nothing alike; each answers to these rows. They are today's
`replacePassphraseActOf`, `addPasskeyActOf` and `revokePasskeyActOf`, with the birth and the delete
added.

| Verb | Refused as `gate_issue` unless | Answers without putting | Puts |
|---|---|---|---|
| `buildBank` | the bank record's `bank_tok` is new; the gate record's `gatelabel` is `main`, its `bank_tok` the bank record's, its `gate_tok` new, its `wayins` a `main` and at most a `passkey0`, its `auth`, `sigs` and `meta` empty | `passed`, with the live rows found | both rows, over none (`born`) or the bank's tombstone (`reborn`) |
| `replacePassphrase` | `registered_at`, `bank_tok` and `gate_tok` are the row's; every wayin but `main` is the row's; `auth`, `sigs` and `meta` are empty | | `replaced` |
| `addPasskey` | the same three; every wayin but `passkey0` is the row's | `camped`, where the row has a `passkey0` | `replaced` |
| `revokePasskey` | the same three; every wayin but `passkey0` is the row's, and the record has none | `passed`, where the row has no `passkey0` | `replaced` |
| `delBank` | the tombstone's `bank_tok` is new | | `deleted`, with the cascade |

Each also passes the revision rules every put and del passes (`notes/answer-contract.md`,
*Revisions*): the row it expected is the row found, or it refuses `stale` and its kin.

## The models

### The startup gap: the Device (ruled: suggested by me, named by the Coach)

The Coach, 2026-11-12: the ordering of startup is put off; first build what makes starting up
easy. "Having Bank, the master center of the universe, possess nullable fields just to serve a
startup gap is a high cost." Three candidates were offered: a transient `BankFactory` that stands
in for a bank through the first gating; props only until there is a DNA; a `World` that owns the
bank and the options and can duck as a bank.

**A `Device`, with a narrow surface of its own, that does not duck as a bank.**

```text
Device                                          from Device.make to sign-out
  user_id, banklabel, bankDB, deviceDB, every option, the host's functions, guarded
  bank: Bank | null                             the one nullable in the design: null while no bank row is in hand
  openGating                                    the one gating open, a build_bank among them
  ensureBank(): Promise<Bank>                   its device row ensured; then the bank in hand, else fetched, else built through a build_bank gating
  sweep(), vacate(), isEnabled                  the only two discards, and the only enabled flag
  snapshot                                      stage, err, openGating, and the bank's snapshot or null

Bank extends Storable                           made only from a bank record and its main gate record
  bank_tok, registered_at, the revision         never void; bank_tok and the stamp fixed: one Bank object is one life of the bank
  maingate: Gate                                never null
  ...                                           the rest as under *Bank*, below
```

* **It is the pattern the code already has, one level down.** "A vault not yet stored has no Vault
  object": the vault listing has the slot (`at(scope)` answers a Vault or null), launches the birth
  gating with `vault: null`, and makes the Vault once a record exists. The Device is that for the
  bank. `safebyok-react` already has the shape too: its context is `{ bank: Bank | null }`
  (`Bankless`), so every hook already handles no bank.
* **Why not the factory.** The gap comes back. `del_bank`, or a bank's tombstone delivered from
  another device, returns to "no bank", and a transient factory is gone by then. And a dialog
  would subscribe to the factory for the first gating and to the bank for every later one. Made to
  last, the factory is the Device.
* **Why not props only.** Something must own the gap while it lasts: the gating a dialog renders,
  a sweep that ends a startup under way (React's StrictMode unmounts in the middle of one), and a
  vacate at a sign-out that comes before any bank. With props only, each host writes that owner,
  and `BankProvider` becomes the Device.
* **Why not ducking as a bank.** A Device that answers every member of `Bank` must say what each
  does with no bank, which is the nullable fields again, moved up a level. With a narrow surface
  the gap is one field, on the object whose job is the gap.
* **`ensureBank` is then an ensure in the vocabulary's sense**, as `ensureVault` is: return the
  thing, or make it so. Whether the Device also offers the fetch without the build (so that a page
  can load without asking a first-time user for a passphrase) is the ordering put off.
* **One Bank object is one life of the bank.** Its `bank_tok` and its stamp never change, which is
  what a lease and every ctx below it want. A bank deleted, here or by a tombstone delivered, is
  disabled for good and the Device's `bank` is null; a bank built again is a new object. `Vault`
  loses that property (R6) and `Bank` gains it, where the lease now is.
* **Not a `Listing`** itself: it has the one slot, `bank`, and makes the stub `BankListing` its
  Bank is constructed with.
* **The name: `Device`** (the Coach proposed `Device` or `User` for my `World`, 2026-11-12).
  `Device`, for three reasons. Its count is already the `device_id`'s: the deviceDB mints one
  `device_id` per bank scope, and there is one of these objects per bank scope. VOCABULARY already
  calls its row in the deviceDB the "device record". And it is what a vacate ends: "sign out on
  this device". Against `User`: a user with two banks would have two `User` objects, and nearly
  every host already has a `User` of its own to collide with on import. Against `World`: the word
  is being retired from 2,200 places in the same line, and says nothing of what the thing is.
* **A rename it asks for.** Storage now has a bank row (R11), so the deviceDB's "bank row" names two
  different rows. With a `Device` it is the device row: `ensureCachedDevice`, `forgetDevice`,
  `listRawDevices`, `DeviceRow` (118 references in 15 files today).
* **The Device ensures its own row, and its id is a tok** (ruled). `ensureBank` begins with
  `deviceDB.ensureCachedDevice`, so a host fetches nothing before `Device.make`, and
  `safebyok-react`'s `useDeviceId` goes. What was `device_id` is `device_tok`: it is minted for one
  life of the device row, a vacate ends that life, and it is only ever compared. The Bank is handed
  it as it is made, and each wayin records it as now.

### Bank

Ruled: a `Storable`, of the bank row, with a stub listing (see *Gate*). The outline assumes
the Device above; without it, the first three lines are where the nullable fields would be.

```text
Bank extends Storable<BankScope, BankRecord, BankSparse, BankSnapshot>
  user_id, banklabel, bank_tok, the revision and times          the bank row in hand
  maingate: Gate                                                bank.maingate
  #lease, #vaults                                               the one lease, the vault listing

  beginWatch()                                  the watch on the bank's scope
  ensureUnlocked(), unlock()                    the cached lease, else an unlock_bank gating, proving against maingate
  lock(), autolock()                            the lease dropped and its row forgotten; every box drops what it has exposed
  delPrompt()                                   del_bank gating
  ensureVault(scope), vaultAt(scope)            putVault with ifAbsent 'add', ifPresent 'get'; asks nobody (R4)
  isEnabled, isLocked                           the device is enabled and this is its bank; no lease
```

* `autolock` peeks the bank's one lease row. A vacate forgets that row and the device row.
  Neither lists leases.
* The snapshot gains `isLocked` and `maingate` as a dialog needs it (its wayins' headers, by
  `wayinlabel`). A vault's and a box's snapshots lose `isLocked`.
* A bank tombstone delivered drops the lease and lets the gate and the vaults go, where
  `Vault.adopt` revokes the lease and vacates the boxes today.

### Gate

Ruled: a `Storable`, of the gate row, with a stub listing.

```text
Gate extends Storable<GateScope, GateRecord, GateSparse, GateSnapshot>         bank.maingate
  gatelabel, bank_tok, gate_tok, the revision and times
  main, passkey0                                the wayins, by wayinlabel: Record<'main' | 'passkey0', Wayin>
  replacePassphrasePrompt(), addPasskeyPrompt(), revokePasskeyPrompt()         each a gating
  stamp, pickle()                                                              as now
```

* The gate verbs are issued here. Each prompt launches its gating; the gating's act proves against
  this gate, builds the next wayin, calls the BankDB verb, and the gate receives the row answered.
* **`BankListing` and `GateListing` are stubs** (ruled). `Storable` wants a listing, so a bank
  and a gate each have a class for one, and use what `Listing` already gives: a row is delivered
  to a bank or a gate by its listing, which judges newer from older as it does for a vault.
  Nothing in the design contemplates extending either. There is no `bank.gates` and no
  `device.banks`, and a member `Listing` leaves for the concrete class is written as plainly as
  it can be. The Coach's fallback, if the stubs give trouble, is a subclass `Listable` of
  `Storable`, for `Vault` and `Box`.
* `Storable`'s base prop `vault_tok` moves down to `Vault` and `Box`.

### Vault, Box and the listings

* A vault listing and a box listing are handed the bank. A box listing is also handed its vault,
  the thing above it. `world`, `ListingWorld`, `VaultWorld`, `BoxWorld` and `BankFriend` go.
* `Storable` has no enabled flag, `sweep` or `vacate` of its own: the bank's are the only ones.
  Every call starts with `bank.demandEnabled()`; a put or a del then needs `bank.isLocked` false
  (R4). `lock()` stays, as the one duty a thing has at a discard: drop what it has of secrets.
* A Vault object stands for its scope through its lives (R6). A record of a new life is received
  into it, and its box listing is made again under the new `vault_tok`. A Box the host kept from
  the earlier life refuses where its `vault_tok` is no longer its vault's.
* `vault.beginWatch()` lists the vault's boxes and starts their watch, as `vault.hello()` does
  today. `vault.del()` is `Storable`'s, with no override (R5).
* The vault listing's `doTryList` is `ensureBank`: it delivers the bank row it answers to the bank,
  the gate row to `maingate`, then its own rows, as a box listing delivers its vault's row first.

### Gating

One open per bank, launched on the bank or its gate; its `vault` prop goes, its outcome is the
bank's, and its snapshot is a `BankScope` with the kind and the token. `judgeStrength` is handed
the bank's scope. `notes/guarantees.md`'s chain for a passphrase (G1) is the same chain, starting
at the bank.

## What a host writes

Assuming the Device, and with the ordering of startup still put off:

```ts
const device = Device.make({ user_id, banklabel: 'acme', bankDB, deviceDB, keyDeriver, gates: ['main'] })
const bank  = await device.ensureBank()               // its device row; then fetched, or asks: build_bank
await bank.beginWatch()
await bank.ensureUnlocked()                           // the cached lease, or asks: unlock_bank
const vault = await bank.ensureVault({ vaultlabel: 'main' })   // asks nobody
await vault.beginWatch()
await vault.putBox({ boxlabel: 'anthropic', whisper: { apiKey } })
await bank.maingate.addPasskeyPrompt()                // asks: add_passkey
```

## Watched for, not built

* **`life_tok` in every stored row** (the Coach, 2026-11-12: "don't make the change, but watch for
  it"). Each storable row would have its own life tok under one stored name, `life_tok`, and the
  model would offer `bank_tok`, `gate_tok`, `vault_tok` or `box_tok` as a frozen own prop. What
  would argue for it: the members that exist only to say which field is the life tok
  (`lifeTokPathOf`, `vaultTokOfWorld`, and the `box_tok: makeLifeTok()` and `vault_tok:
  makeLifeTok()` of each `tombstoneOver`), about twenty lines of the core today, and two more
  kinds of row arriving. What would argue against: a row also carries the tok of the row above
  it, which then wants a second general name, and a join reads better as
  `boxes.vault_tok = vaults.vault_tok` than under two general names. Each thread of this line
  reports what it met of either.

## Put off by the Coach

* **To the end of the sprint**: whether a wayin change goes on making other devices prove again.
  Built meanwhile to keep doing so, by `gate_revision_tok` on the lease (*Which token changes when*).
* **Until asked**: the ordering of startup, and so whether a page can load without asking a
  first-time user for a passphrase. `device.ensureBank()` is the one startup call until then.

Names the Coach has not objected to, which stand: `buildBank`, `delBank`, `bank.beginWatch()`,
`bank.delPrompt()`, `gate_revision_tok`, `ensureCachedDevice` and its kin, the format numbers,
`bank_void`, `bank_gone`, `bank_reborn`.
