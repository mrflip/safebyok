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
  - make lease key with passphraseProving
  - make wayins with each proving.makeWayin
  - make gate object
* props: `passphrase_wayin`, ... (correct these pleased)
* adorn'ed (hidden props): `ppWayin`, `pkWayin`, `vault`
* #novelProvings -- prompt user and get a proving pair
*
* revokePasskey(), replacePassphrase(), addPasskey()

### Proving

Proving:
* static makeProvingPair(vaultRecord, proofClosure)
  invoke closure to get a raw cleartext passphrase and optionally a PRF answer;
  from those we get a proving pair
  and from those, wayins, each with wrapped vault key (the passphraseProving makes the vault key and wraps it)
* #wrapVaultKey()
* makeWayin(proving | NOVEL) // on Symbol('NOVEL'), will fabricate a vault key
PassphraseProving:
* makeLease()dd

### Lease

* vault, etc
* loads lease using private friend: `Lease.tryGet(this.#scope, this.leaseDBFriend())` with `vault.leaseDBFriend() { return { logger: this.#logger, tryGetLease(scope) { return this.#deviceDB.tryGetLease(scope) } } }`
* sealWith(serializedWhisper, stampCtx), unsealWith(sealedWhisper, stampCtx)
* wrap, unwrap

* rename methods: `#tryVaultKey/#vaultKey` instead of vaultKeyOrNull.
* `decipherWith` and all its descendents can be about 8 lines each, with a couple helpers
* get rid of KeptLease.
* get rid of dropDamaged and just call this.vault.lock()
* get rid of #demand, anything mentioning box. The weird try/catch cascades. Simplify and un-DRY the monstrous boxCtxOf dance
* the methods you keep should not be calling back and forth to assemble stamps (additional data): those should be the parameters, zod-validated

### Wayin

* props: wayinkind, key_deriver_label, salt_b64, device_id, registered_at, vault_key_wayin_wrapped
* pickle, toJSON
* _get rid of_ ~~storing in separate table; isDamaged (use zod on self at end of constructor). Keyderiver lives on world not every wayin.~~

### Vault Friends
Each friend gets logger and scope
* LeaseCachingFriend: `this.#deviceDB.tryGetLease(scope)`
* Gate: ` `

### Terms

* `pickle` (not `frozenRecord`)
* VaultRecord: vaultRecord.gate_props (also own props of vault), not vaultRecord.gate

### Remove

* the many checks for consistency, timeliness, and lock state. We will re-introduce those.
* the thing where a method name is passed down a chain and then invoked on an object holy hell you guys
* standalone functions that act as or call checkers -- just star-import the checkers and use them directly.

### Implementation hints


## !! DO NOT FOLLOW THE IMPLEMENTATION OF THESE !!

* vault.delWayIn holy shit...