# Vocabulary

safebyok names each thing once, in plain words, and uses that one name in its API, its docs, its
stored records and its code. This page is the cast. You don't need to know any cryptography to
use safebyok; if you do, the last column of each table gives the usual term.

## What you handle

| Name           | What it is                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **whisper**    | The secret you store: any JSON value (a string, number, boolean, array or plain object), such as an API key or `{ apiKey, orgId }`. safebyok never looks inside it.                                |
| **box**        | Holds one whisper, encrypted, together with its `boxlabel` and a sidecar your UI may show while the vault is locked. A `Box` in code; what storage holds of it is its record, a `BoxRecord` (`box.record`). |
| **vault**      | One user's set of boxes, named by your app's `applabel`, the signed-in user, and its own `vaultlabel`. The **Vault object** (`Vault`) is one life of it in this tab, for as long as the bank holds it: `bank.ensureVault({ vaultlabel })` births it from one read of storage and this device's store, and `vault.hello()` reads them again. A Vault object never stands for an absent vault: one never made is born `novel`. Once the vault is deleted, made anew, or let go by the bank, the Vault object is **gone**, for good, and the bank births the next. |
| **bank**       | The signed-in user's vaults in the app, one Vault object per scope, and what they share: the key deriver, the strength checker, the stores, the limits, `requestCleartext` and `onBadNews` (`Bank`). One per signed-in user, its scope `{ applabel, user_id }` (`BankScope`), dropped at sign-out. `Bank.make(opts)` checks its options and touches nothing; `bank.hello()` loads the libraries the vaults share; `bank.ensureVault({ vaultlabel })` births a vault's Vault object, or hands back the one it holds. |
| **passphrase** | What the user types to unlock their vault. It is not their login password, and safebyok never stores it or sends it anywhere. A vault has exactly one, its passphrase wayin (`putWayin('passphrase')` replaces it, and removes the passkey). |
| **passkey**    | What the user touches to unlock instead of typing: a fingerprint, a face, a phone or a security key, as a WebAuthn credential whose authenticator answers for the vault through the PRF extension. safebyok never holds its secret; the authenticator does, and answers only after the user's fingerprint, face or PIN. A vault has at most one, its passkey wayin (`putWayin('passkey')` puts or replaces it, `delWayin('passkey')` removes it, and so does a new passphrase), always beside the passphrase it was added under. |
| **wayin**      | One way into a vault: its passphrase or its passkey, as the vault knows it. Each has a `wayinkind` (`passphrase` or `passkey`; `WayinKind`) and the `registered_at` and `device_id` of its sealing; a passkey's also has the `credential_id` and `prf_salt_b64` to ask it with. A vault holds exactly one passphrase wayin and at most one passkey wayin, as two slots of its gate, named by their `slotlabel` (`'passphrase'` or `'passkey'`), which `putWayin` and `delWayin` take. The snapshot shows them, even while locked, as its `passphrase` and `passkey`, each a `WayinSummary` (`PassphraseWayinSummary`, `PasskeyWayinSummary`). Only the standing passphrase proves a change to them. Stored as described under *Encrypted forms*. |
| **cleartext**  | What the user hands a gating to show a wayin is theirs: a passphrase, as the text they typed, or a passkey's answer (`PasskeyAnswer`). Only a gating's attempt takes it: no vault call does. It is as good as the wayin it opens, so the attempt makes it a proving and drops it; a passkey's answer is zeroed. Shown to the user as "Vault unlocker" (the Coach, 2026-10-24): text a user sees that names the passphrase and passkey taken together says "Vault unlocker"; the code keeps `cleartext`. |
| **gating**     | One request for cleartext (`Gating`), raised by a vault call that needs the user: `ensureUnlocked()` on a locked or `novel` vault, `putWayin()`, `delWayin()` and `del()`. It is handed to the host's **requestCleartext** (`RequestCleartext`), the one place UI meets the vault, and is a union on its **gatingkind** (`GatingKind`): `initialize_gate`, `unlock_vault`, `change_passphrase`, `put_passkey`, `del_passkey` or `del_vault`, each carrying its one typed attempt beside `decline()` and `lockLanded`. An attempt runs its kind's whole chain. One gating stands per vault at a time; every call waiting on it hears how it settles. A gating that has settled, been declined, or met a lock has **landed**: an attempt after it refuses `gating_landed`. |
| **proving**    | Cleartext made into a wayinKey for one gating (`PassphraseProving`, `PasskeyProving`), sealed over a wayin's header: the current wayin's, to prove what stands, or a fresh one it mints, to become a new wayin. It holds the wayinKey non-extractable, wraps and unwraps the vaultKey (`wrappedWith`, `unwrap`), reseals wayins and grants the lease, and never hands out a vaultKey. It lives for its gating alone. |
| **gate**       | The vault's ways in as they stand: its passphrase wayin, its passkey wayin or none, and their `gate_epoch` (`Gate`). A gating's chain builds the next gate from the current one and stores it over its base with one conditional write (`putGate`), moving `gate_epoch` up by one; the first, an `initialize_gate`, is epoch 1. A vault with no gate yet is `novel`. |
| **passkey answer** | What a passkey answers when asked for its vault (`PasskeyAnswer`): the credential's id, the salt it was asked with, and 32 secret bytes. The host gets one from `safebyok-react`'s `createPasskey` or `askPasskey` and hands it to a gating's attempt, which seals it into a passkey's **proving** (`PasskeyProving`), zeroing its bytes. |
| **lease**      | What lets this device unlock again without asking, for a while (`Lease`): granted by a gating's proving (`proving.grantLease()`), and taken up at the vault's birth here, or by `ensureUnlocked()` from another tab's grant, until its `ask_passphrase_at`. It holds the leaseKey and the vaultKeyLeaseWrapped, and stays on the device. How long it lasts is `leaseHours`. While the vault is unlocked, the Vault object holds its lease privately -- no getter shows it -- and boxes seal and open under it (`lease.cipheredWith`, `lease.decipherWith`), each call unwrapping the vaultKey for itself and keeping it no longer. At its ask_passphrase_at it is dropped from memory, erasing nothing. A lock drops it and erases the record (the deviceDB's `delLease`); a lease that will not unwrap is `damaged_lease`, dropped and erased. A stored lease of another life, or another gate, is never taken up. |
| **mask**       | A function from `safebyok/utils` that shows a best-effort whiff of each end of a whisper, one plain line safe for a log or a reminder, so your UI can tell which API key a box holds without revealing it. It is not a faithful copy: marks, invisible characters, bidirectional controls and spaces are dropped, though right-to-left letters are kept and may reorder their neighbours in a display. `mask` is intended for plain text; calling it with arbitrary blobs may give unusual behavior. Stripping every mark costs the vowels of scripts that write them as marks (Hindi `नमस्ते` comes out as `नमसत`); an API key is ASCII, and is untouched. Its result is public: show it, never trust it to hide more than it does. `mask(whisper, { head: 0, tail: 0 })` hides everything but the length. |

## Keys

safebyok has five keys. Each is a 256-bit AES-GCM key, named for whose it is, and none ever leaves the
user's device unencrypted. There are no public or private keys: everything is symmetric. (A
passkey has a key pair of its own inside its authenticator; safebyok never uses it, only the PRF
answer beside it.)

| Name               | What it is                                                                                                                                                         | Standard term                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **passphraseKey**  | Made from a passphrase and its wayin's passphraseSalt by the key deriver. Its only job is to wrap the vaultKey, as that wayin's wayinKey.                          | passphrase-derived KEK              |
| **passkeyKey**     | Made from a passkey's PRF answer by HKDF-SHA256, its `info` the same ctx its wrap is bound to: the vault, the purpose and the wayin. Its only job is to wrap the vaultKey, as that wayin's wayinKey. | PRF-derived KEK                     |
| **wayinKey**       | Not a sixth key: the passphraseKey or passkeyKey of one wayin, named for its role once it acts on the vaultKey. The code that makes it keeps the specific name; the code that wraps and unwraps the vaultKey calls it the wayinKey, and need not know which kind of wayin made it. | KEK                                 |
| **vaultKey**       | The vault's random master key. It wraps every boxKey, and stays the same when a wayin is added, deleted or changed, so none of those rewrites a box. Nothing replaces it: a rotation is not built yet.  | key-encryption key (KEK)            |
| **boxKey**         | A random key for one box, made fresh every time a whisper is stored. It encrypts that whisper.                                                                 | data-encryption key (DEK)           |
| **leaseKey**       | Kept by this browser, and impossible to export from it. It wraps a copy of the vaultKey so that a lease can unlock without asking. It holds nothing about the device itself. | non-extractable, device-bound KEK |

Which key opens which:

```text
passphrase + passphraseSalt ──key deriver──> passphraseKey      one per passphrase wayin
passkey + prfSalt ──PRF, then HKDF──> passkeyKey                  one per passkey wayin

wayinKey    wraps    vaultKey    →  vaultKeyWayinWrapped   one per wayin, synced to every device
leaseKey    wraps    vaultKey    →  vaultKeyLeaseWrapped   this device only
vaultKey    wraps    boxKey      →  boxKeyWrapped          one per box
boxKey      ciphers  whisper     →  whisperCiphered        one per box
```

## Encrypted forms

A key that has been encrypted is **Wrapped**; a whisper that has been encrypted is **Ciphered**.
The verbs come in like-for-like pairs: a lease's `cipheredWith` / `decipherWith` turn serialized
bytes into a ciphertext bound to the visible fields and back, and a proving's `wrappedWith` /
`unwrap` do the same for a key. Where one thing becomes another, the verb is `extract`:
`box.extractWhisper()`.
Each is a pair: its cipherIv and its ciphertext. safebyok exports the pair's one shape as the
**`Ciphered`** type -- `{ cipher_iv_b64, ciphertext_b64 }`, each half base64url text (the `_b64`
suffix) -- so every encrypted field in a stored record is plain JSON any storage layer can hold
as-is.

| Name                          | What it is                                                                                         | Standard term       |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ------------------- |
| **whisperCiphered**           | The whisper, encrypted under its boxKey.                                                           | ciphertext          |
| **boxKeyWrapped**             | The boxKey, encrypted under the vaultKey and stored beside its whisperCiphered.                    | wrapped DEK         |
| **vaultKeyWayinWrapped**      | The vaultKey, encrypted under one wayin's wayinKey: that wayin's `vault_key_wayin_wrapped`. Synced to every device through your storage. | wrapped KEK |
| **wayin**, as stored          | One wayin as the vault record's gate holds it, in its `passphrase` or `passkey` slot (`WayinRecord`: a `PassphraseWayinRecord` or a `PasskeyWayinRecord`, told apart by `wayinkind`; the vault hands each out as a `Wayin`, a `PassphraseWayin` or a `PasskeyWayin`, made from it by `Wayin.make`): the visible fields its kind needs (a passphrase's `key_deriver_label` and `salt_b64`; a passkey's `credential_id` and `prf_salt_b64`), the vaultKeyWayinWrapped, and the deviceId and time (`registered_at`) of the device that sealed it. Both wrap the one vaultKey. | key slot |
| **vaultKeyLeaseWrapped**      | The vaultKey, encrypted under the leaseKey: a lease's `vault_key_lease_wrapped`. Never leaves this device. | device-wrapped KEK  |

## Ingredients and contexts

None of these is secret. Each is stored in the clear or rebuilt when needed, and if any one is
wrong or has been tampered with, decryption fails.

| Name                     | What it is                                                                                                                                                           | Standard term        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **passphraseSalt**       | Random bytes (16 under the supplied keyDeriverSpec) fed to the key deriver with the passphrase: one per passphrase wayin (`salt_b64`), never shared, and replaced whenever that passphrase changes.                            | salt                 |
| **prfSalt**              | 32 random bytes a passkey's authenticator is asked to evaluate its PRF over: one per passkey wayin (`prf_salt_b64`), fresh when the passkey is added. Visible; the authenticator's answer to it is the secret. | PRF salt, hmac-secret salt |
| **keyDeriverSpec**       | The recipe that turns a passphrase into the passphraseKey: Argon2id's parameters under a keyDeriverLabel. safebyok supplies one, `Argon2idWebV1`: 64 MiB of memory, 3 passes, 1 lane, a 16-byte salt and a 32-byte result. A host may choose its own. | KDF parameters       |
| **keyDeriverLabel**      | The keyDeriverSpec's name (`argon2id_web_v1` for the supplied one), stored with each passphrase wayin so that the vault says how it was made. A label always means the same parameters. Labels beginning `argon2id_web_` are reserved for the specs safebyok supplies. | KDF identifier       |
| **key deriver**          | What makes the passphraseKey under a keyDeriverSpec: `argon2idWebV1Deriver` for the supplied one, `argon2idDeriver(spec)` for a host's own. One standing in for a supplied spec carries its parameters, or the vault refuses it. | KDF                  |
| **cipherIv**             | 12 random bytes, fresh for every encryption, stored beside the ciphertext it opens.                                                                                  | IV, nonce            |
| **ctx**                  | The context an encryption is bound to: the props and metadata the ciphertext's tag proves unchanged. It names which app, user and vault, which field it is, and every other field its record writes. Each record has its own: a box's `boxCtx` (its label, revision, whisper codec and schema version, sidecar and times), a wayin's `wayinCtx` (its whole header), a lease's `leaseCtx` (its epoch and deadline). `cipherCtx` joins a ctx from its parts (`CipherCtxPart`), and every function that ciphers or wraps takes it as `ctx`. It is rebuilt rather than stored, so ciphertext copied anywhere else, or under an altered field, will not open. | associated data (AAD) |
| **ciphertext**           | The encrypted bytes, with their authentication tag on the end.                                                                                                       | ciphertext           |
| **vaultTok**             | A random token that changes on every life of the vault (`vault_tok`): minted when the vault is made for its scope, and never changed within that life. The scope finds the vault; the token tells one **life** of that scope from the next, so a vault deleted and made anew is never taken for the old one. Part of every ctx, and compared in every expectation. Same scope with another `vault_tok` means a new life: the Vault object holding the old one is gone (`vault_remade`). | --                   |
| **vaultEpoch**           | A counter on the vault that the store moves, never a writer: up by one on every write of the vault record and on `delVault`, and carried by the tombstone into the next life (`vault_epoch`). This device keeps the highest it has seen in its device record, and refuses a vault served below it as `vault_behind`. | rollback counter     |
| **revisionTok**          | A fresh token for each write of a box (`revision_tok`). It is part of the boxCtx; storage refuses (`stale_write`) a write made from a stale read.              | version, CAS token   |
| **gateEpoch**            | A counter that goes up whenever the vault's wayins change -- the passphrase changed, the passkey added, replaced or removed -- so other devices and leases know to ask again (`gate_epoch`). | key epoch            |
| **deviceId**             | A random id one device mints for one vault's scope the first time it reads or makes it (`device_id`), kept in its device record across the vault's lives. Each wayin carries the deviceId of the device that sealed it. It is never drawn from anything about the device, and is one per vault, so it links nothing the vault does not already link. | installation id (scoped) |

**An `_id` is a hard identifier; a `_tok` is only compared.** A stored field ending `_id` names one
thing for good and is what a record is found by (`device_id`, and the `credential_id` and
`user_id` that come from outside). A random token that is checked and never looked up by is a
`_tok`, and changes on every life of what it marks: `revision_tok` turns on every write of a box,
`vault_tok` on every life of a vault in its scope. In code they are `vaultTok` and `revisionTok`.

**The stamp** is what a thing was made under: `{ applabel, user_id, vaultlabel, vault_tok,
vault_epoch, gate_epoch }`, frozen (`Stamp`; `vault.stamp` is the vault's own, now). Every Box,
Lease, Gate and Proving carries one, and `vault.demandConsistentWith(thing)` compares it with the
vault's: the vault gone (`vault_gone`), another life (`vault_remade`), another gate
(`gate_moved`).

## Names, records and times

How a vault is addressed, what the storage layer holds, and when. A label (`label`) is lowercase
words of letters and digits joined by single underscores, 2 to 40 characters, such as
`anthropic_api_key`. The name rules are the package's own: a name outside them is
percent-encoded (RFC 3986), never checked by a host's own rule.

| Name                            | What it is                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **applabel**                    | Your app's own label, so several apps can share one backend without colliding. Stored as `applabel`.                                                                        |
| **vaultlabel**                  | The label of one of a user's vaults, such as `main`. Stored as `vaultlabel`.                                                                                                |
| **boxlabel**                    | The label of a box within its vault: what you pass to `putBox`, `getBox`, `getWhisper`, `useWhisper` and `delBox`. Stored as `boxlabel`.                                            |
| **user_id**                     | The signed-in user's stable, opaque id from your own auth, the one name in a scope that is not a label: 1 to 100 ASCII letters, digits and `-_.~:@+\|%`, never dots alone (`UserId`). Never an email or a handle, which can change. Spelled `user_id` everywhere, in an option, a prop and storage alike. |
| **scope**                       | An applabel, a user_id and a vaultlabel together: it names one vault (`VaultScope`).                                                                                         |
| **visible**                     | Said of a stored field that is both unencrypted and authenticated: bound into its record's ctx, so a change in storage makes the record refuse to open, and readable by anyone who can read the database. It covers a box's `boxlabel`, `revision_tok`, codec and schema version, times and sidecar, and each wayin's header (its `wayinkind`, `key_deriver_label` or `credential_id`, salt, `device_id` and `registered_at`): every field of those records but the ciphered ones. A visible field is never secret. Say "visible" only of a field that is authenticated, and "visible in storage" where a sentence could be read as screen visibility. |
| **unencrypted**                 | Said of a stored field that is not encrypted, and nothing more: it may be authenticated or it may not. The vault record's `gate_epoch`, its `registered_at` and which wayins fill its gate's two slots are unencrypted and bound into no ctx (each wayin's own fields, and the record's scope and `vault_tok`, are bound, and so visible). Say "unencrypted" of a record-general or backend-general sentence ("ciphertext and unencrypted fields"), and "visible" of a field known to be authenticated. |
| **sidecar**                     | A box's sidecar: your app's own data that rides beside the whisper (`sidecar` at `putBox()` and in the snapshot; `Sidecar`). Its trust class is **visible** (see that entry): authenticated (bound into the box's boxCtx, so a change in storage makes the box refuse to open) but never encrypted, readable by anyone who can read the database. It is guaranteed unchanged once `getWhisper()` opens the box: until then the snapshot shows it as storage holds it. A JSON object of any JSON values -- what an app wants searchable server-side (a team, a rotation reminder, a count of the calls the app made to OpenRouter with this whisper), shown while the vault is locked. Never secret material. safebyok never looks inside it; your app checks its shape. Stored as the JSON object it is (`sidecar`; a `jsonb` column on Postgres), bound with its keys sorted, and always written (`{}` when there is none). Its size counts toward `maxWhisperBytes` with the whisper's. |
| **whisper codec**, **whisper schema version** | How a box's whisper became the bytes it ciphers (`whisper_codec`: `json_v1`, its JSON with keys sorted, as UTF-8), and which generation of the whisper's own shape it holds (`whisper_schema_version`: 1). Both are stored and bound; neither is anything to set yet. |
| **damaged**                     | Said of a stored record that does not read back as what it should be, and told by the kind of refusal each earns. A **box** is damaged (`damaged_box`) when its record does not read back as one; so is one sealed under a vaultKey the vault does not hold. A **wayin** is damaged (`damaged_wayin`) when it is stored in a form this package never writes, so it cannot be tried; the other wayins still can be. The **vault record** is damaged (`damaged_vault`) when it fails its checks or names another vault, so no wayin can be tried at all, and `hello()` refuses. For a box, the snapshot lists it as `{ boxlabel, damaged: true, revision_tok }` (`DamagedBox`, its revision null when the record holds none as text) beside the sound ones; `delBox()` removes it, `putBox()` writes a fresh box over it, and `getBox()` refuses it. A box stored under a name the vault's validators refuse is not damaged: it lists and reads as any other, and only `putBox()` refuses the name. |
| **vault record**                | The one record per vault that every device syncs (`VaultRecord`, format `safebyok-vault-v6`): its stamp (the format, the scope, the vaultTok and `registered_at`), the vaultEpoch, the gateEpoch, and its **gate** (`GateRecord`: its `passphrase` and its `passkey` or null), nested, null while `novel`; the gateEpoch is 0 exactly then. Nothing in it opens without a passphrase or passkey. Its `vault_tok` names it for good: random, and never reused. Its shapes are sliced from it: `VaultSparse` (all but the gate), `VaultStamp` (the stamp), `VaultScope`, and what `delVault` leaves, `VaultTombstone`. Formerly the vault props. |
| **lease**, as kept              | What a device keeps to unlock without asking (`LeaseRecord`, format `safebyok-lease-v1`; the vault holds it as a `Lease`, made from it): the leaseKey, the vaultKeyLeaseWrapped, the vaultTok, the gateEpoch it was granted at and the ask_passphrase_at. It stays on the device. |
| **device record**               | What a device keeps of a vault's scope, locked or not, across the vault's lives there (`DeviceRecord`, format `safebyok-device-v1`): its own deviceId for the scope, and the highest vaultEpoch it has seen. Nothing in it is secret; it stays on the device. It is raised at every read and every write of this device's own (`raiseDeviceRecord`, a store-side max), never lowered; `lock()` and `del()` leave it, and `bank.clearCachedVault` erases it. |
| **behind**                      | Said of a vault storage serves at a lower vaultEpoch than this device's record has seen in its scope. The vault refuses it (kind `vault_behind`), taking nothing from it and writing nothing, and locks, or is not born. |
| **novel**                       | Said of a vault stored with no gate yet: its `gate_epoch` 0, its `passphrase` and `passkey` null. Every Vault object's `state` is `novel`, `locked` or `unlocked`. A novel vault's first gating is `initialize_gate`. |
| **freshness**                   | How far to trust a Vault object's picture of storage (`VaultFreshness`): `timely` (read within `staleMinutes`), `aged` (read longer ago; the next hello reads), or `refused` (the last read failed). |
| **rotation**                    | Replacing a vault's vaultKey with a new one and sealing every box anew under it, so that a wayin deleted beforehand opens nothing written afterwards. Not built yet: when it is, it adds an epoch to the vault record, each wayin and each box saying which vaultKey each stands for, with the format bumps that go with it (TODO.md, *Which wayins a rotation keeps*). Until then the vaultKey never changes, and a vault made anew has a new vaultTok, which voids every box. |
| **get**, **put**, **del**       | The three verbs of every layer -- the vault, the vaultDB and the deviceDB -- each on what it holds: `getBox`, `putBox` and `delBox`; `getVault`, `putVaultProps` and `delVault`; `getLease`, `putLease` and `delLease`. `del` means gone, for good, and nothing of what is deleted is kept: `delBox` a box, `delWayin` a way in, `del()` the whole vault (and, on a VaultDB, `delBox` under a `BoxDelExpectation`, naming the revision read, and resolving a `BoxDeletion` that says what it removed -- `deleted`, `deleted_other` or `absent`; `delVault` and `delDamagedVault` under a `VaultDelExpectation`). |
| **ensure**                      | Have it, or make it so, and hand it back, so that a second call costs nothing (`bank.ensureVault`, `vaultDB.ensureVault`, `vault.ensureUnlocked`). The async third of a check's triplet (STYLE.md, *Naming*): `consistentWith` asks, `demandConsistentWith` refuses, an `ensure` makes it so. A function that only checks, and refuses, is a `check` or a `demand`. |
| **read**, **write**             | Umbrella words for any get, or any put or del: `stale_write`, `written_at`, "a write made from a stale read". Never a verb of the API. |
| **vaultDB**                     | The storage plug-in for what syncs: vault records and boxes, ciphertext only (`VaultDB`; `localVaultDB`, `idbVaultDB` and `convexVaultDB` are supplied). It reads them with `getVault` (the vault record and the box listing in one read) and `getBox`, and writes them with `ensureVault`, `putVaultProps`, `putBox` and the `del` verbs, each one transaction with an expectation, resolving what now stands. |
| **deviceDB**                    | The storage plug-in for this device's lease and device record (`DeviceDB`; `memoryDeviceDB` and `idbDeviceDB` are supplied): the lease through `getLease`, `putLease` and `delLease`, the record through `getDeviceRecord`, `raiseDeviceRecord` and `delDeviceRecord`. One scope's calls land in the order made. |
| **pantry**                      | The part of this device's store that holds what the vault may use but never see: its keys, kept as WebCrypto handles the page cannot export -- the leaseKey, and the vaultKey wrapped under it, as the lease. An operation under them -- opening a lease, wrapping or unwrapping a boxKey, ciphering a whisper -- runs inside the browser's keystore and hands back its result, never the key's bytes. The `Lease` holds such a handle in a field, and a proving holds its wayinKey only for its gating; the rest of the vault asks them, and no other class sees a key. The deviceDB is how the pantry is reached, IndexedDB where a browser keeps it. Nothing in the pantry opens the vault off this device. |
| **change bell**                 | How a write to a store in this browser tells every listener, in this tab and in every other of the origin, to read again (`ChangeBell`, from `safebyok/idb`): a BroadcastChannel, and a bell inside the tab. It carries nothing but the news that something changed. `idbDeviceDB` and `safebyok-indexeddb` ring it after each write; a string store keeps a bell of its own, inside the tab. |
| **registeredAt**, **writtenAt** | When a box was first stored, and when it was last written -- by any store, whether or not its whisper changed; the vault record has a registeredAt too, when the vault was made, and so does each wayin, when it was added. Stored as `registered_at` and `written_at`. |
| **ask_passphrase_at**           | The instant from which a device stops honoring its lease and asks again, spelt so on the lease record and the snapshot alike: then the lease is dropped, by a timer, and the vault locks. It moves only when a gating's attempt unlocks the vault, or a passphrase proves a change to its wayins. An instant within a minute of `FarFuture` (`>= FarFuture - MinuteMillis`) means "until it is locked". |
| **leaseHours**                  | The `Bank.make` option for how long a lease lasts after a gating unlocks. The default is 168 (`LeaseHours`), the most 588 (`MaxLeaseHours`, 24.5 days); `Infinity` means until it is locked. A vault reports the lease it was made with as `leaseMillis`, in milliseconds; `Infinity` reads as `ForeverMillis`. |
| **strengthChecker**      | The `Bank.make` option that checks each new passphrase before it becomes a wayin: the one a vault is created with, and each one `putWayin` sets, never one typed to unlock. A function (`StrengthChecker`) from the passphrase and the vault's scope to a verdict (`PassphraseVerdict`), `{ strong: true }` or `{ strong: false, reason }`, never a throw; a weak one is refused as `weak_passphrase`, the reason its message. Optional: left out, every new passphrase is refused as too weak, the refusal's message saying that one must be chosen (the core's CUSTOMIZATION.md). `browserOpts()` supplies `zxcvbnStrengthChecker`, which asks for at least `MinPassphraseChars` (12) characters and a zxcvbn score of 3, turning away common passwords, patterns and the vault's own names. |
| **EpochMillis**                 | Every time safebyok keeps: whole UTC milliseconds since 1970, from `FarPast` (1981) to `FarFuture` (2255). The bounds catch seconds and microseconds passed by mistake.      |
| **format**                      | The tag at the head of every stored record (`safebyok-vault-v6`, `safebyok-box-v8`, `safebyok-lease-v1`, `safebyok-device-v1`, and a deleted vault's `safebyok-tombstone-v1`). It is also the first part of the ctx, and bound there once. Any change to what a record may hold moves its format on; a test keeps each format's schema and fails when one changes under the same format. |
| **ckey**                        | Where a key-value store files a row: its kind and names joined on `^` (`box^acme^u1^main^anthropic`, from `Ckeys`), which no name may contain. |
| **clock**, **logger**           | Two options your app may pass to `Bank.make`: a source of the time (`Clock`), and a place for the vault to say what it has no one to throw to (`VaultLogger`).          |

## Other credentials

| Name             | What it is                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **API key**      | A user's credential for some other service, and the usual thing a whisper holds. safebyok never names or inspects it.      |
| **access token** | Your app's own login credential, which your storage adapter may send to your backend. It never goes into a vault.       |

## Words safebyok does not use

* **key, alone.** A key is always one of the five above, by name, or a wayinKey. An entry's name
  in a map or a storage address is a `ckey`.
* **data, contents, payload.** The secret is a whisper; encrypted, it is a whisperCiphered.
* **unlock, as a noun.** A way in is a wayin; what a device keeps is a lease. `ensureUnlocked()`
  is the verb, and `unlock_vault` the gating.
* **proof, ask.** What the user hands in is cleartext; made into a key, a proving; the request
  for it, a gating.
* **device key.** The key behind a lease is the leaseKey.
* **public, plain, server-readable, of a stored field.** A field is visible (unencrypted and
  authenticated) or unencrypted (and possibly not authenticated). There are no public keys here.
  The `'plain'` field class in `safebyok-graphql`'s `src/fields.ts` keeps its name as a code
  identifier.
* **KEK, DEK, KDF, AAD.** They appear above only so a security reviewer can map safebyok's names
  onto the usual ones. Nothing in safebyok's API asks you to learn them.

Stored records spell every name in underbar_case: `whisper_ciphered`, `key_deriver_label`.

The names the reform of October 2026 retired are in `notes/old_vocabulary.md`, for reading older
code and records. Nothing current uses them.
