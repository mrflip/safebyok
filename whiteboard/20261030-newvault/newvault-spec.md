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
* lock(), synchronous: sets `#isLocked`, drops `#lease`, and queues `lease.forget()` (its keys dropped, its record erased from the deviceDB) on `#leaseChores`, a private promise chain whose refusals are told as bad news. `#unlock` will await the chain before granting, so an erase lands before the next put. _Built._
* #unlock(): proving = this.gate.attemptProof(); lease = proving.grantLease(); #setLease(lease)
* demandUnlocked, isUnlocked: this.isTimely && (!! lease)
* #dropLease, #setLease,
* autolock         Trigger
* passphrasePester Trigger

* revokePasskey(), replacePassphrase, addPasskey, ???

* vaultListing.build()
  - draft sparse vault record
  - gate = Gate.build()
  - make vault object
* Bank.buildVault() vaultListing.build, vault.send

### Gate

My picture is that there's a

* build(vaultRecord, proofClosure):
  - prompt for #novelProvings (passphraseProving and optional passkeyProving)
  - make wayins: `passphraseProving.makeWayin(NOVEL)`, then `passkeyProving.makeWayin(passphraseProving)`
  - make the lease: `passphraseProving.makeLease(friend, opts)`
  - make gate object
* props: `passphrase_wayin`, `passkey_wayin` (null without one): each wayin's pickle, as the vault record will store them
* adorn'ed (hidden props): `ppWayin`, `pkWayin`, `vault`
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

### Lease

* vault, etc
* loads lease using a private friend, bound to the vault's scope so no verb takes one: `Lease.get(vault, vault.leaseDBFriend())` throws, `Lease.tryGet` answers an Outcome. Arrow functions, so `this` stays the vault:
  `leaseDBFriend() { const scope = this.scope; return { logger: this.logger, tryGetLease: () => this.#deviceDB.tryGetLease(scope), tryPutLease: (record) => this.#deviceDB.tryPutLease(record), tryDelLease: () => this.#deviceDB.tryDelLease(scope) } }`
  (not yet on the Vault: the world carries no deviceDB)
* grant(vault, dbfriend, vaultKey, opts): a put the deviceDB refuses is warned of, not thrown, as the deviceDB is a cache; forget() drops the keys and erases the record (`vault.lock()` queues it); isInForce
* autolockTrigger: a Trigger (helpers/trigger.ts) scheduled at `autolock_at` (was `ask_passphrase_at`), whose launch is `vault.lock()`; disposed by forget(). The passphrase-pester trigger is the gate's, not the lease's.
* sealWith(serializedWhisper, boxKeyStamp, whisperStamp), unsealWith(sealed, boxKeyStamp, whisperStamp): the box hands in its two stamps, flat bags of its own fields; the lease binds each under the vault's stamp and its own purpose (`box_key_wrapped`, `whisper_ciphered`). No wrapKey/unwrapKey: a key handle never leaves the lease, and the purposes never leave it either (the Coach, 2026-10-31)

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

### Remove

* the many checks for consistency, timeliness, and lock state. We will re-introduce those.
* the thing where a method name is passed down a chain and then invoked on an object holy hell you guys
* standalone functions that act as or call checkers -- just star-import the checkers and use them directly.

### Implementation hints


## !! DO NOT FOLLOW THE IMPLEMENTATION OF THESE !!

* vault.delWayIn holy shit...