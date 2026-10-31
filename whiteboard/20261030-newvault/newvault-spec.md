# New Vault Machinery

We will create a radically simpler implementation of the library,
with clean stack traces, few functions, plain code documented in plain language
Limit your contact with the old code.
Guarantees will be loosened significantly in the first part of this sprint.
For example: activities are not interrupted by lock(); elimination of
consistency and timeliness checks. These will come back later.

## Vault

* #boxListing
* isLocked()
* lock()
* ensureUnlocked(): ensureTimely; if unlocked, return lease; otherwise, #unlock()
* _Built (thread 2):_ `ensureUnlocked(proofClosure?)` answers the lease in force; one held past its time locks first. `#unlock()` joins an unlock by proof in flight (`#unlocking`), else takes up the kept lease where one is in force (looked for whenever no lease is held, after `#leaseChores`; `#keptLookup` joins a look in flight), else hydrates a sparse vault, `this.gate.attemptProof(proofClosure, world)`, awaits `#leaseChores`, and `#setLease(await proving.makeLease(this, this.leaseDBFriend(), { leaseMillis }))`. No closure, no unlock in flight and no kept lease refuses 'vault_locked'. `leaseMillis` is the world's, default 14 days. `demandLease()` refuses 'vault_locked'; `takeUpLease(lease)` refuses 'bad_option' a lease of another vault or Vault object, and 'vault_locked' one not in force. `#setLease` lets a displaced lease go (`lease.letGo()`: autolock disposed, keys dropped, kept record left); a declined kept lease is let go too. The listing's `hello` takes up each vault's kept lease; its `goodbye` lets every vault's lease go and leaves the kept lease for the next load, where `lock()` erases it.
* lock(), synchronous: sets `#isLocked`, drops `#lease`, and queues on `#leaseChores` (a private promise chain whose refusals are told as bad news) the held lease's `letGo()` and the vault's own erase, `leaseDBFriend().tryDelLease()`, whether or not it held a lease, so `goodbye` then `lock()` leaves no kept lease. `#unlock` awaits the chain before granting, so an erase lands before the next put. _Built (thread 2; the erase without a held lease, thread 3)._
* #unlock(): proving = this.gate.attemptProof(); lease = proving.makeLease(); #setLease(lease). _Built (thread 2)._
* demandUnlocked, isUnlocked: this.isTimely && (!! lease). _Built (thread 2)_ as `isUnlocked` and `demandLease()`; no timeliness check.
* #setLease. _Built (thread 2)_; `#dropLease` folded into `lock()` (thread 3).
* autolock         Trigger. _Built (thread 2)_, on the lease: reset at every grant.
* passphrasePester Trigger

* revokePasskey(), replacePassphrase, addPasskey, ???

* vaultListing.build()
  - draft sparse vault record
  - gate = Gate.build()
  - make vault object
* _Built:_ `vaultListing.build(dna, proofClosure)` drafts the sparse record, builds the gate from the draft's stamp, `Gate.build(vaultStamp.parse(draft), proofClosure, world)`, and holds the vault with `{ ...draft, gate: gate.pickle() }`. Where the closure or the gate is refused, nothing is held, and `build` may be called again. `Gate` and `Proving` bind the `VaultStamp`, not the vault; `proving.makeLease(vault, dbfriend, opts)` takes the vault at the grant and refuses 'bad_option' one of another stamp.
* `vault.gate`: the `Gate` of the record in hand, made from its `gate` on first read and again when that changes; never null: a vault held sparse, or a tombstone, has none in hand and refuses 'bad_option' (hydrate first). The gate is stored with the vault record and nowhere else: no wayin table, no write of a wayin or gate in `models/` but the vault listing's put of the vault record (and the device cache's copy of it).
* the vault's world (`VaultWorld`): a `ListingWorld`, a `ProvingWorld` (`clock`, `keyDeriver`, `device_id`), `scope`, `logger`, `leaseMillis`, and `deviceDB`, the three lease verbs by scope; `vaultListingOpts` checks them. `vault.leaseDBFriend()` binds the verbs to the vault's scope. _Built._
* Bank.buildVault() vaultListing.build, vault.send

### Gate

My picture is that there's a

* build(stamp, proofClosure, world):
  - prompt for #novelProvings (passphraseProving and optional passkeyProving)
  - make wayins: `passphraseProving.makeWayin(NOVEL)`, then `passkeyProving.makeWayin(passphraseProving)`
  - make gate object, and answer `{ gate, proving }`: the passphrase proving beside the gate. The gate holds no proving; `VaultListing.build` grants the first lease, `proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis })`, once it holds the vault. _Built (thread 2)._
* attemptProof(proofClosure, world): `Proving.attempt(this.stamp, this.pickle(), proofClosure, world)`. _Built (thread 2)._
* props: `passphrase_wayin`, `passkey_wayin` (null without one): each wayin's pickle, as the vault record will store them
* adorn'ed (hidden props): `ppWayin`, `pkWayin`, `stamp` (the vault's stamp, parsed)
* #novelProvings -- prompt user and get a proving pair
*
* revokePasskey(), replacePassphrase(), addPasskey()

### Proving

Proving:
* static makeProvingPair(vault, proofClosure, world)
  invoke closure to get a raw cleartext passphrase and optionally a PRF answer (the `cleartexts`);
  `PassphraseProving.make(vault, world, passphrase)` and `PasskeyProving.make(vault, world, passkeyAnswer)` each mint
  a header and derive their wayinKey; the PRF bytes are zeroed in a `finally` whatever happens.
* makeWayin(NOVEL | proving): on `NOVEL` (a unique symbol) fabricates a vaultKey; on a proving, takes the vaultKey that
  proving unwraps from the wayin it made. **The vaultKey never leaves a proving function**: it moves proving to
  proving through `#unwrapVaultKey()` and `#wrapVaultKey()`, and Gate holds no key.
* makeLease(friend, opts): `Lease.grant(vault, friend, vaultKey, opts)` from inside the proving. On every proving, not
  the passphrase's alone: a passkey unlock grants a lease too.
* world: `{ clock, keyDeriver, device_id }` for now; `device_id` on the world is provisional.
* static attempt(stamp, gate, proofClosure, world): the proving of the stored wayin the proof opens, the passphrase's where one is handed, else the passkey's; a label of another deriver refuses 'unknown_key_deriver', another credential or salt 'wrong_passkey', a wrap that will not open 'wrong_passphrase' or 'wrong_passkey'. One wayin per proving: a second `makeWayin`, or a source of another vault, refuses. _Built (thread 2)._

### Lease

* vault, etc
* loads lease using a private friend, bound to the vault's scope so no verb takes one: `Lease.get(vault, vault.leaseDBFriend())` throws, `Lease.tryGet` answers an Outcome. Arrow functions, so `this` stays the vault:
  `leaseDBFriend() { const scope = this.scope; return { logger: this.logger, tryGetLease: () => this.#deviceDB.tryGetLease(scope), tryPutLease: (record) => this.#deviceDB.tryPutLease(record), tryDelLease: () => this.#deviceDB.tryDelLease(scope) } }`
  (not yet on the Vault: the world carries no deviceDB)
* grant(vault, dbfriend, vaultKey, opts): a put the deviceDB refuses is warned of, not thrown, as the deviceDB is a cache; forget() drops the keys and erases the record (`vault.lock()` queues it); isInForce
* autolockTrigger: a Trigger (helpers/trigger.ts) scheduled at `autolock_at` (was `ask_passphrase_at`), whose launch is `vault.lock()`; disposed by forget(). The passphrase-pester trigger is the gate's, not the lease's.
* _Built (thread 2):_ a lease past `autolock_at`, or forgotten, refuses 'vault_locked' from `#vaultKey`; `Lease.get` answers null for a kept lease past `autolock_at` and erases its record; a lease that will not open is dropped, locks its vault, erases its record, and refuses 'damaged_lease'.
* sealWith(serializedWhisper, boxKeyStamp, whisperStamp), unsealWith(sealed, boxKeyStamp, whisperStamp): the box hands in its two stamps, flat bags of its own fields; the lease binds each under the vault's stamp and its own purpose (`box_key_wrapped`, `whisper_ciphered`). No wrapKey/unwrapKey: a key handle never leaves the lease, and the purposes never leave it either (the Coach, 2026-10-31)
* _Built (thread 3):_ the box seals and unseals through `vault.demandLease()`, taken per call and never kept (`BoxWorld.demandLease`). One function in `box.ts`, `boxStampOf`, makes the box's stamp, every sparse field and the sidecar as stable JSON, and the box hands it in as both stamps; `sealedRecordOf` serializes the `{ val }` holder as json_v1 for `sealWith`, for `BoxListing.draftOf` and `Box.makeStaged` alike; `#unseal` decodes what `unsealWith` answers, zeroes the bytes, and holds it to `whisperHolder` ('damaged_box' otherwise). `stubSeal` is gone.

* rename methods: `#tryVaultKey/#vaultKey` instead of vaultKeyOrNull.
* `decipherWith` and all its descendents can be about 8 lines each, with a couple helpers
* get rid of KeptLease.
* get rid of dropDamaged and just call this.vault.lock()
* get rid of #demand, anything mentioning box. The weird try/catch cascades. Simplify and un-DRY the monstrous boxCtxOf dance
* the methods you keep should not be calling back and forth to assemble stamps (additional data): those should be the parameters, zod-validated

### Wayin

* props: wayinkind, key_deriver_label, salt_b64, device_id, registered_at, vault_key_wayin_wrapped (passkey: credential_id, prf_salt_b64 instead of the deriver's two). The stored `prf_salt_b64` is checked for length by `FX.prfSalt`; the old vault record's field keeps its shape-only check, as its length was a `damaged_wayin` at use
* pickle, toJSON
* _get rid of_ ~~storing in separate table; isDamaged (use zod on self at end of constructor). Keyderiver lives on world not every wayin.~~

### Vault Friends
Each friend gets logger and scope
* LeaseCachingFriend: `this.#deviceDB.tryGetLease(scope)`
* Gate: ` `

### Terms

* `pickle` (not `frozenRecord`)
* every `try` method answers an Outcome `{ ok, val, err }`; the plain verb throws
* errors are thrown through small factory functions (`damagedLease()`), as in storable; no catch-and-relabel until the rich refusal kinds land. The two host functions that hear the passphrase (closure, keyDeriver) are the exception: what they throw is replaced (guarantees G1, G8)
* checkers and the types made from them live in `models-shapes.ts`; a model file is code
* the vault's stamp: scope, `vault_tok`, `registered_at` (`vaultStamp`); no `format`, so a new vault format leaves wayins and leases open
* VaultRecord: vaultRecord.gate_props (also own props of vault), not vaultRecord.gate
* Only `Proving` and `Lease` touch cryptography. They alone import a key maker, `wrapKeyUnder`, `unwrapKeyUnder`, `cipherBytes` or `decipherBytes`. An unwrapped key, a handle included, never leaves a local variable: no field, no return, no argument across a class boundary. The two exceptions are by design: the vaultKey moves proving to proving inside `Proving` (`makeWayin(source)`), and `Proving.makeLease` hands it to `Lease.grant` as an argument. `Gate`, `Vault`, `Box` and the listings hold no key, ever. (The Coach, 2026-10-31; guarantees G3, G5, G9.)
* A ctx is built once, by its owner, in one small function. No helper that takes a purpose and a method name and walks a chain; never pass a function or method name around to be invoked on another instance.

### Remove

* the many checks for consistency, timeliness, and lock state. We will re-introduce those.
* the thing where a method name is passed down a chain and then invoked on an object holy hell you guys
* standalone functions that act as or call checkers -- just star-import the checkers and use them directly.

### Implementation hints


## !! DO NOT FOLLOW THE IMPLEMENTATION OF THESE !!

* vault.delWayIn holy shit...