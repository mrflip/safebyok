# Vocabulary

safebyok names each thing once, in plain words, and uses that one name in its API, its docs, its
stored records and its code. This page is the cast. You don't need to know any cryptography to
use safebyok. If you do, the *Standard term* column gives the usual term.

## What you handle

| Name           | What it is                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **whisper**    | The secret you store: always a plain object of JSON, such as `{ apiKey }` or `{ apiKey, orgId }`. safebyok never looks inside it.                                                                  |
| **box**        | Holds one whisper, encrypted, together with its `boxlabel` and a sidecar your UI may show while the vault is locked. It is a `Box` in code. What storage holds of it is its record, a `BoxRecord`. |
| **vault**      | One user's set of boxes, named by your app's `applabel`, the signed-in user and its own `vaultlabel`. The **Vault object** (`Vault`) is one life of it in this tab, for as long as the bank holds it. `bank.ensureVault({ vaultlabel })` answers the Vault object the bank lists for that scope. Where no vault is stored, it builds one through a `build_vault` gating. `vault.hello()` lists the vault's boxes and starts their watch. A Vault object stands for an absent vault only as a deleted one. It takes the tombstone, keeps its slot in the bank's listing, and refuses every call. A newer life of that scope replaces it, and a vacate disables it at once. A Vault object so replaced or vacated is let go for good, and refuses every later call. The bank holds a new Vault object for the next life. |
| **bank**       | The signed-in user's vaults in the app, one Vault object per scope, and what they share (`Bank`). They share the key deriver, the strength checker, the stores, the limits, `requestCleartext` and `onBadNews`. There is one bank per signed-in user, and its scope is `{ applabel, user_id }` (`BankScope`). The host drops it at sign-out. `Bank.make(opts)` checks its options and touches nothing. `bank.hello()` loads the libraries the vaults share and lists the vaults storage holds for the bank. `bank.ensureVault({ vaultlabel })` answers the vault it lists, or builds one. |
| **passphrase** | What the user types to unlock their vault. It is not their login password. safebyok never stores it or sends it anywhere. A vault has exactly one, its passphrase wayin. A `replace_passphrase` gating replaces it, and leaves the passkey wayin as it was. |
| **passkey**    | What the user touches to unlock instead of typing: a fingerprint, a face, a phone or a security key. It is a WebAuthn credential whose authenticator answers for the vault through the PRF extension. safebyok never holds its secret. The authenticator holds it, and answers only after the user's fingerprint, face or PIN. A vault has at most one, its passkey wayin, always beside the passphrase it was added under. An `add_passkey` gating adds it. `addPasskeyPrompt()` refuses while this vault's gate already holds one. The vaultDB's `addPasskey` refuses (`camped`) where storage holds one the gate did not show. A `revoke_passkey` gating removes it. |
| **wayin**      | One way into a vault: its passphrase or its passkey, as the vault knows it (`Wayin`). Each has a `wayinkind` (`passphrase` or `passkey`; `Wayinkind`). Each also carries its `registered_at`, and the `device_id` of the device that built it. A passkey's wayin also has the `credential_id` and `prf_salt_b64` to ask it with. A vault holds exactly one passphrase wayin and at most one passkey wayin, as its gate's `passphrase_wayin` and `passkey_wayin`. A wayin's **header** (`WayinHeader`) is all of it but its vaultKeyWayinWrapped. Every change to the wayins takes the current passphrase. *Encrypted forms* describes how a wayin is stored. |
| **cleartext**  | What the user hands a gating to show a wayin is theirs: a passphrase, as the text they typed, or a passkey's answer (`PasskeyAnswer`). Only a gating's attempt takes it. No vault call does. It unlocks as much as the wayin it belongs to. So the attempt makes it into a proving and drops it. The attempt zeroes a passkey's answer. The user sees it called "Vault unlocker" (the Coach, 2026-10-24). Text a user sees that names the passphrase and passkey together says "Vault unlocker". The code keeps `cleartext`. |
| **gating**     | One request for cleartext (`Gating`), raised by a vault call that needs the user. `ensureUnlocked()` raises one on a locked vault, after it tries the cached lease. `bank.ensureVault()` raises one for a vault not yet stored. `replacePassphrasePrompt()`, `addPasskeyPrompt()`, `revokePasskeyPrompt()` and `delVaultPrompt()` (or `del()`) each raise one. The bank hands it to the host's **requestCleartext** (`RequestCleartext`), the one place UI meets the vault. It is a union on its **gatingkind** (`Gatingkind`): `build_vault`, `unlock_vault`, `replace_passphrase`, `add_passkey`, `revoke_passkey` or `del_vault`. Each kind carries its one typed attempt beside `decline()` and `whenSettled`. An attempt runs its kind's whole chain. One gating is open per bank at a time. A second call that needs the user meanwhile refuses `already_asking`. A gating that has settled, been declined, or met a lock has **landed**. An attempt after it refuses. |
| **proving**    | Cleartext made into a wayinKey for one gating (`PassphraseProving`, `PasskeyProving`). It is built over a wayin's header: the current wayin's, to prove the gate in hand, or a fresh one, to become a new wayin. It holds the wayinKey non-extractable. It builds wayins (`proving.buildWayin()`) and leases (`proving.buildLease()`), and wraps and unwraps the vaultKey privately to do so. It never hands out a vaultKey. It lives for its gating alone. |
| **gate**       | The vault's current ways in: its passphrase wayin, its passkey wayin or none, and their `gate_epoch` (`Gate`). A gating's chain builds the next gate from the current one. It stores that gate over its base with one conditional call of the vaultDB: `putVault`, `replacePassphrase`, `addPasskey` or `revokePasskey`. Each call moves `gate_epoch` up by one. The first gate, a `build_vault`'s, is epoch 1 (`FirstGateEpoch`). Every stored vault has a gate. |
| **passkey answer** | What a passkey answers when asked for its vault (`PasskeyAnswer`, held as a `passkeyClear`): the credential's id, the salt it was asked with, and 32 secret bytes. The host gets one from `safebyok-react`'s `createPasskey` or `askPasskey`, which still run on the old design. The host hands it to a gating's attempt. The attempt makes it into a passkey's **proving** (`PasskeyProving`) and zeroes its bytes. |
| **lease**      | What lets this device unlock again without asking, for a while (`Lease`). A gating's proving builds it (`proving.buildLease()`). `ensureUnlocked()` takes up the lease cached on this device (`Lease.buildFromCache`), whichever tab cached it. It holds the leaseKey and the vaultKeyLeaseWrapped, and stays on the device. It lasts `leaseMillis` from its `proved_at`, as `autolockMinutes` sets. While the vault is unlocked, the Vault object holds its lease privately. No getter shows it. Boxes seal and unseal under it (`lease.sealWith`, `lease.unsealWith`). Each call unwraps the vaultKey for itself and keeps it no longer. An **evicted** lease (`lease.evict()`) drops its keys and leaves its cached row. A lock drops the lease and erases its cached row. A vacate drops the keys and uncaches the row. A lease that will not unwrap refuses `damaged_lease`. Its vault then locks, and the lease is evicted. A cached lease past autolock is never taken up, and its row stays until `bank.autolock()` or a lock erases it. A cached lease of another life, or another gate, is never taken up. |

## Keys

safebyok has five keys. Each is a 256-bit AES-GCM key, named for whose it is. None ever leaves the
user's device unencrypted. There are no public or private keys: everything is symmetric. (A
passkey has a key pair of its own inside its authenticator. safebyok never uses it, only the PRF
answer beside it.)

| Name               | What it is                                                                                                                                                         | Standard term                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **passphraseKey**  | Made from a passphrase and its wayin's passphraseSalt by the key deriver. Its only job is to wrap the vaultKey, as that wayin's wayinKey.                          | passphrase-derived KEK              |
| **passkeyKey**     | Made from a passkey's PRF answer by HKDF-SHA256. Its `info` is the ctx its wrap is bound to: the vault, the purpose and the wayin. Its only job is to wrap the vaultKey, as that wayin's wayinKey. | PRF-derived KEK                     |
| **wayinKey**       | Not a sixth key: the passphraseKey or passkeyKey of one wayin, named for its role once it acts on the vaultKey. The code that makes it keeps the specific name. The code that wraps and unwraps the vaultKey calls it the wayinKey, and need not know which kind of wayin made it. | KEK                                 |
| **vaultKey**       | The vault's random master key. It wraps every boxKey. It stays the same when a wayin is added, revoked or replaced, so none of those rewrites a box. Nothing replaces it, because rotation is not built yet. | key-encryption key (KEK)            |
| **boxKey**         | A random key for one box, made fresh every time a box is sealed. It ciphers that box's whisper.                                                                 | data-encryption key (DEK)           |
| **leaseKey**       | Kept by this browser, which cannot export it. It wraps a copy of the vaultKey so that a lease can unlock without asking. It holds nothing about the device itself. | non-extractable, device-bound KEK |

Which key wraps or ciphers which:

```text
passphrase + passphraseSalt ──key deriver──> passphraseKey      one per passphrase wayin
passkey + prfSalt ──PRF, then HKDF──> passkeyKey                  one per passkey wayin

wayinKey    wraps    vaultKey    →  vaultKeyWayinWrapped   one per wayin, synced to every device
leaseKey    wraps    vaultKey    →  vaultKeyLeaseWrapped   this device only
vaultKey    wraps    boxKey      →  boxKeyWrapped          one per box
boxKey      ciphers  whisper     →  whisperCiphered        one per box
```

## Encrypted forms

A key that has been encrypted is **Wrapped**. A whisper that has been encrypted is **Ciphered**.
A box whose whisper is ciphered and whose boxKey is wrapped is **sealed**. Each verb has its
reverse:

* **wrap** and **unwrap** act on a key: a proving wraps the vaultKey under its wayinKey, and a
  lease unwraps it from under the leaseKey.
* **cipher** and **decipher** act on a whisper's serialized bytes: they become a ciphertext bound
  to the box's visible fields, and back.
* **seal** and **unseal** act on a box. Sealing makes a fresh boxKey, ciphers the whisper under
  it, and wraps the boxKey under the vaultKey, each bound to the box's stamp and its vault's. The lease seals
  (`lease.sealWith`) and unseals (`lease.unsealWith`). Unsealing unwraps the boxKey and
  deciphers the whisper. Only a box is sealed: a wayin or a lease is built.
* **extract** names one thing taken out of another: `box.extractWhisper()` unseals the box and
  answers its whisper, and keeps nothing on the box.

Each encrypted form is a pair: its cipherIv and its ciphertext. The core names the pair's one
shape **`Ciphered`**: `{ cipher_iv_b64, ciphertext_b64 }`. Each half is base64url text (the `_b64`
suffix). So every encrypted field in a stored record is plain JSON any storage layer can hold
as-is.

| Name                          | What it is                                                                                         | Standard term       |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ------------------- |
| **whisperCiphered**           | The whisper, ciphered under its boxKey: a box's `whisper_ciphered`.                                | ciphertext          |
| **boxKeyWrapped**             | The boxKey, wrapped under the vaultKey: a box's `box_key_wrapped`, stored beside its whisperCiphered. | wrapped DEK         |
| **vaultKeyWayinWrapped**      | The vaultKey, wrapped under one wayin's wayinKey: that wayin's `vault_key_wayin_wrapped`. Your storage syncs it to every device. | wrapped KEK |
| **wayin**, as stored          | One wayin as the vault record's gate holds it, as its `passphrase_wayin` or `passkey_wayin` (`WayinRecord`). It is a `PassphraseWayinRecord` or a `PasskeyWayinRecord`, told apart by `wayinkind`. It holds the visible fields its kind needs: a passphrase's `key_deriver_label` and `salt_b64`, or a passkey's `credential_id` and `prf_salt_b64`. It also holds its vaultKeyWayinWrapped, its `registered_at`, and the `device_id` of the device that built it. Both wayins wrap the one vaultKey. | key slot |
| **vaultKeyLeaseWrapped**      | The vaultKey, wrapped under the leaseKey: a lease's `vault_key_lease_wrapped`. It never leaves this device. | device-wrapped KEK  |

## Ingredients and contexts

None of these is secret. Each is stored in the clear or rebuilt when needed. If any one is wrong or
has been tampered with, decryption fails.

| Name                     | What it is                                                                                                                                                           | Standard term        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **passphraseSalt**       | Random bytes fed to the key deriver with the passphrase (`salt_b64`): 16 of them under the supplied keyDeriverSpec. Each passphrase wayin has its own, never shared. It is replaced whenever that passphrase changes. | salt                 |
| **prfSalt**              | 32 random bytes over which a passkey's authenticator is asked to evaluate its PRF (`prf_salt_b64`). Each passkey wayin has its own, made fresh when the passkey is added. It is visible. The authenticator's answer to it is the secret. | PRF salt, hmac-secret salt |
| **keyDeriverSpec**       | The recipe that turns a passphrase into the passphraseKey: Argon2id's parameters under a keyDeriverLabel. safebyok supplies one, `Argon2idWebV1`: 64 MiB of memory, 3 passes, 1 lane, a 16-byte salt and a 32-byte result. A host may choose its own. | KDF parameters       |
| **keyDeriverLabel**      | The keyDeriverSpec's name (`argon2id_web_v1` for the supplied one). Each passphrase wayin stores it, so the vault says how its passphraseKey was made. A label always means the same parameters. Labels beginning `argon2id_web_` are reserved for the specs safebyok supplies. | KDF identifier       |
| **key deriver**          | What makes the passphraseKey under a keyDeriverSpec: `argon2idWebV1Deriver` for the supplied spec, `argon2idDeriver(spec)` for a host's own. A deriver that bears a supplied spec's label must carry that spec's parameters, or it is refused. | KDF                  |
| **cipherIv**             | 12 random bytes, fresh for every encryption, stored beside their ciphertext.                                                                                          | IV, nonce            |
| **ctx**                  | The context an encryption is bound to. Its tag proves the context unchanged. A ctx holds the **stamp** of what it seals or wraps, and its purpose, which names the field. A wayin's ctx (`wayinCtxOf`) holds its vault's stamp (`VaultStamp`) and the wayin's header. A box's ctx holds its vault's stamp and the box's own. A lease's ctx holds its vault's stamp and the lease's own (`LeaseStamp`). `cipherCtx(stamps, purpose, header)` makes one, taking a list of stamps where a thing binds the stamp of what it lies in beside its own. Every function that ciphers or wraps takes it as `ctx`. It is rebuilt rather than stored. So ciphertext copied anywhere else, or under an altered field, will not decipher or unwrap. | associated data (AAD) |
| **ciphertext**           | The encrypted bytes, with their authentication tag on the end.                                                                                                       | ciphertext           |
| **vaultTok**             | A random token that changes on every life of the vault (`vault_tok`). It is minted when the vault is made for its scope, and never changes within that life. The scope finds the vault. The token tells one **life** of that scope from the next, so a vault deleted and made anew is never taken for the old one. Every ctx binds it. Every vaultDB call on a box or a gate checks it against the vault stored. A live vault under the same scope with another `vault_tok` is a new life, and a call made under the old one refuses. | --                   |
| **boxTok**               | A random token that changes on every life of a box under its boxlabel (`box_tok`). It is minted at the box's birth, and every later revision of that life keeps it. A box's life is its vault's and its own, `vault_tok` and `box_tok`. So a box deleted and made anew elsewhere is told from the one this device held. vaultTok and boxTok are the **life toks**, made by `makeLifeTok`. | --                   |
| **revisionTok**          | A fresh token for each put or del of a record, vault or box (`revision_tok`). Its `revision_seq` counts up beside it, and the higher seq is the newer. Both are part of the box's stamp. Storage refuses a put made from a stale fetch (`stale_write`).              | version, CAS token   |
| **gateEpoch**            | A counter that goes up whenever the vault's wayins change (`gate_epoch`). A passphrase replaced, a passkey added and a passkey revoked each move it, so other devices and leases know to ask again. | key epoch            |
| **deviceId**             | The host's id for this device in a bank's scope (`device_id`), a label, which `Bank.make` requires. safebyok mints none and keeps no record of it. Each wayin carries the deviceId of the device that built it, visible in storage. A random id the host keeps per device is best: one drawn from anything about the device would link what the vault does not. The `device_id` and `user_id` are provided in the options. If the `user_id` holds sensitive data please hash it first: `user_id: await mash(email)`. | installation id (scoped) |
| **mash**                 | The SHA-256 of a text as 64 lowercase hex characters (`mash(text)`), a one-way stand-in for an id a host would rather not hand over. To mash an email is to hash it, unsalted. It is `safebyok/utils`'s, which holds the small helpers for the app around a vault. | hash |
| **mask**                 | The outline of a secret text that is safe to show (`mask(whisper.apiKey)`): a whiff of each end with stars between, one plain line for a log or a reminder, so a UI can tell which API key a box holds without revealing it. It is not a faithful copy: marks, invisible characters, bidirectional controls and spaces are dropped, though right-to-left letters are kept and may reorder their neighbours in a display. It is intended for plain text; arbitrary blobs may give unusual behavior. Stripping every mark costs the vowels of scripts that write them as marks (Hindi `नमस्ते` comes out as `नमसत`); an API key is ASCII, and is untouched. Its result is public: it gives away the text's ends and, up to `maxLen`, its length. `mask(text, { head: 0, tail: 0 })` shows only the length. It is `safebyok/utils`'s. | redact |

**An `_id` is a hard identifier. A `_tok` is only compared.** A stored field ending `_id` names one
thing for good, and a record is found by it (`device_id`, and the `credential_id` and `user_id`
that come from outside). A random token that is checked and never looked up by is a `_tok`. It
changes on every life of what it marks. `revision_tok` turns on every put or del of a record. `vault_tok`
turns on every life of a vault in its scope. `box_tok` turns on every life of a box under its
boxlabel. In code they are `vaultTok`, `boxTok` and `revisionTok`.

**The stamp** is the fields a thing's ctx binds its ciphertext to, so that it deciphers under that
thing and no other. A vault's stamp is fixed for its life. `VaultStamp` is the vault's scope,
`vault_tok` and `registered_at`. A lease's stamp is fixed for the lease. `LeaseStamp` is its
`fmt`, its vault's stamp, its `gate_epoch`, `proved_at` and `wayinkind`: all of the lease record
but its key material. A box's stamp is not fixed for its life. It is every sparse field of the one
revision it seals, `revision_tok`, `revision_seq`, `written_at` and the sidecar included. So a
whisper deciphers only under the very revision it was sealed in. Nothing storage splices together
deciphers at all. That is why every edit of a box seals it anew. No code moves a sealed box to another
revision without sealing it again. A thing binds its own stamp and the stamps of what it lies in.
A vault's stamp carries no `fmt`, so its boxes and leases still unseal and unwrap under a new vault
format. Say "stamp" for the bound fields, never "the binding" or "the authentics".

## Names, records and times

How a vault is addressed, what the storage layer holds, and when. A label (`label`) is lowercase
words of letters and digits joined by single underscores, such as `anthropic_api_key`. It starts
with a letter, and runs 2 to 40 characters (`LabelPattern`, `MaxLabelChars`). The name rules are
the package's own. A host never checks a name by a rule of its own: it percent-encodes (RFC 3986)
a name outside them.

| Name                            | What it is                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **applabel**                    | Your app's own label, so several apps can share one backend without colliding. It is stored as `applabel`.                                                                  |
| **vaultlabel**                  | The label of one of a user's vaults, such as `main`. It is stored as `vaultlabel`.                                                                                          |
| **boxlabel**                    | The label of a box within its vault: what you pass to `putBox`, `getBox`, `fetchBox`, `delBox` and `tryDelDamagedBox`. It is stored as `boxlabel`.                          |
| **user_id**                     | The signed-in user's stable, opaque id from your own auth. It is the one name in a scope that is not a label: 1 to 100 ASCII letters, digits and `-_.~:@+\|%`, never dots alone (`UserIdPattern`, `MaxUserIdChars`). It is never an email or a handle, which can change. It is spelled `user_id` everywhere, in an option, a prop and storage alike. |
| **scope**                       | An applabel, a user_id and a vaultlabel together: it names one vault (`VaultScope`).                                                                                         |
| **visible**                     | Said of a stored field that is both unencrypted and authenticated. A visible field is in a stamp, or a wayin's header, that a ctx binds. A change to it in storage makes the record refuse to unseal or unwrap. Anyone who can read the database can read it. Visible fields are the vault's stamp (its scope, `vault_tok` and `registered_at`), every sparse field of a box and its sidecar, and each wayin's header. A wayin's header is its `wayinkind`, `key_deriver_label` or `credential_id`, salt, `device_id` and `registered_at`. Every field of a box or a wayin is visible but the encrypted ones. A visible field is never secret. Say "visible" only of a field that is authenticated. Say "visible in storage" where a sentence could be read as screen visibility. |
| **unencrypted**                 | Said of a stored field that is not encrypted, and nothing more: it may be authenticated or it may not. The vault record's `fmt`, revision fields, `written_at`, `am` and `gate_epoch` are unencrypted. No wayin's ctx binds them. Whether its gate holds a passkey wayin is unencrypted too. Say "unencrypted" in a record-general or backend-general sentence ("ciphertext and unencrypted fields"). Say "visible" of a field known to be authenticated. |
| **sidecar**                     | A box's sidecar: your app's own data that rides beside the whisper (`sidecar` at `putBox()` and in the snapshot; `Sidecar`). Its trust class is **visible** (see that entry). The box's stamp holds it, so a change in storage makes the box refuse to unseal. It is never encrypted, and anyone who can read the database can read it. It is guaranteed unchanged once the box is unsealed. Until then the snapshot shows it as storage holds it. It is a JSON object of any JSON values. It holds what an app wants searchable server-side, or shown while the vault is locked. Examples are a team, a rotation reminder, or a count of the calls the app made to OpenRouter with this whisper. It is never secret material. safebyok never looks inside it, and your app checks its shape. It is stored as the JSON object it is (`sidecar`; a `jsonb` column on Postgres). It is bound with its ckeys sorted, and always written (`{}` when there is none). It counts with the whisper toward what storage holds in one record (`box_too_large`). |
| **whisper codec**, **whisper schema version** | How a box's whisper became the bytes it ciphers, and which generation of the whisper's own shape it holds. `whisper_codec` is `json_v1`: its JSON with ckeys sorted, as UTF-8. `whisper_schema_version` is 1. Both are stored, and both are in the box's stamp. Neither is anything to set yet. |
| **damaged**                     | Said of a stored row that fails its checks on the way out. Such a row refuses `damaged_row`, or `newer_format` where its `fmt` is newer, and its listing sets it aside (`am` `d`) with a `damagekind`. The damagekind is `format_mismatch` for a row of a newer format, and `damaged_row` otherwise. A vault's fetch lists its damaged box rows in `damaged_rows` (`DamagedBox`), never among its sound `boxes`, under whatever boxlabel storage holds. A box stored under a name the label rule refuses is listed so. `getBox()` and `delBox()` read a damaged box as missing. `vault.tryDelDamagedBox()` is the only verb that deletes one. A box that will not unseal under the vault's own vaultKey, or unseals to no whisper, refuses `damaged_box`. The bank's fetch reports each damaged vault row as bad news. |
| **vault record**                | The one record per vault that every device syncs (`VaultRecord`, `fmt` 6001). It holds the vault's scope, `vault_tok`, `registered_at` and `written_at`, its revision (`revision_tok`, `revision_seq`) and its `am`. It also holds its **gate**, nested: `gate_epoch`, `passphrase_wayin`, and `passkey_wayin` or null. Nothing in it unwraps without a passphrase or passkey. Its `vault_tok` names its life for good. It is random, and never reused. Its shapes are sliced from it: `VaultSparse` (all but the gate), `VaultStamp` (the stamp), `VaultScope`, and what `delVault` leaves, `VaultTombstone`. |
| **lease**, as cached            | What a device caches to unlock without asking (`LeaseRecord`, `fmt` 7001). The vault holds it as a `Lease`, made from it. It holds the leaseKey, the vaultKeyLeaseWrapped and the lease's stamp: the vault's stamp, the `gate_epoch` it was proved at, `proved_at` and `wayinkind`. It stays on the device. The deviceDB caches it (`cache`), answers it (`peek`) and uncaches it (`vacate`). Only `peek` answers a lease's leaseKey. No code but a `Lease`, a proving and the deviceDB holds the record. |
| **device record**               | None is kept. The deviceDB holds leases only, and a bank's deviceId is the `device_id` the host hands `Bank.make`. A store's device-record rows from before are no longer read. |
| **lockState**                   | Whether a Vault object holds a lease in force (`'unlocked'`) or none (`'locked'`), as its snapshot's `lockState`. A vault not yet stored has no Vault object, and its first gating is `build_vault`. |
| **timely**                      | Said of a thing whose record in hand was refreshed recently enough to trust (`isTimely`). The bank's `vaultRefreshMinutes` and `boxRefreshMinutes` set how recently, 5 minutes by default. A caller may name its own age (`maxMillisSinceRefresh`). `fetchBox` refreshes always. |
| **stage**                       | Where the bank stands in its life, as its snapshot's `stage` (`BankStage`). It is `made` until a `hello()` answers, and again after a sweep or a vacate. It is `ready` once `hello()` has loaded the libraries its vaults share and listed them. It is `refused` when that load failed. The snapshot's `err` then says why, and the next hello loads again. |
| **the bank's listing**          | The vaults the bank holds (`bank.vaultListing`), a deleted one among them until a newer life replaces it. The bank's snapshot lists the present ones as `vaults`, one `VaultSnapshot` each. `bank.vaultAt({ vaultlabel })` answers the Vault object listed for a scope, a deleted one included, or null. |
| **rotation**                    | Replacing a vault's vaultKey with a new one and sealing every box anew under it, so that a wayin revoked beforehand unwraps nothing written afterwards. It is not built yet. When it is, it adds an epoch to the vault record, each wayin and each box, saying which vaultKey each stands for, with the format bumps that go with it (TODO.md, *Which wayins a rotation keeps*). Until then the vaultKey never changes. A vault made anew has a new vaultTok, which voids every box. |
| **get**, **put**, **del**       | The three verbs of the vault and the vaultDB, each on what it holds. The vault has `getBox`, `putBox` and `delBox`. The vaultDB has `getVault`, `putVault` and `delVault`, and `getBox`, `putBox` and `delBox`. `del` means gone, for good. What is deleted leaves a tombstone of its sparse fields (`am` `x`), and its whisper or gate goes. `del()` deletes the whole vault. The deviceDB's verbs for a lease are `cache`, `peek` and `vacate`. |
| **ensure**                      | Have it, or make it so, and hand it back, so that a second call costs nothing (`bank.ensureVault`, `vault.ensureUnlocked`). An `ensure` is the async third of a check's triplet (STYLE.md, *Naming*). `isUnlocked` asks, `demandUnlocked` refuses, and `ensureUnlocked` makes it so. A function that only checks, and refuses, is a `check` or a `demand`. |
| **read**, **write**             | Umbrella words for any get, or any put or del: `stale_write`, `written_at`, "a write made from a stale read". Neither is ever a verb of the API. |
| **vaultDB**                     | The storage plug-in for what syncs (`VaultDB`): vault records and boxes, ciphertext only. The core supplies `MemoryVaultDB`. The adapters, `convexVaultDB` among them, still run on the old design. `listVaults` lists the bank's vaults. `getVault` fetches a vault record alone. `listBoxes` lists a vault's boxes, with its record, in one call. `getBox` fetches one box. `putVault`, `putBox`, the gate verbs and the `del` verbs store. Each is one transaction, and each answers what is now stored. `tidyGone` removes the box rows of tombstoned or vanished vaults, for hosts. |
| **act**, **world**, **dbhas**   | What a vaultDB verb's answer carries beside its `val` (`GoodAnswer`, `BadAnswer`). The **act** says what happened. A put's act is `born`, `reborn`, `replaced` or `declined`. A del's is `deleted`, `gone` or `void`. A get's is `got`, `gotvoid` or `gotgone`. A thing's **world** is what it is listed under: a bank for vaults, a vault for boxes. A box answer's `world` field carries its vault's row as fetched in the same step, from which the vault refreshes. **dbhas** is the row the call found in its way, null where none stood. A refusal's `meta` holds the same `world` and `dbhas`, so an answer and an error read alike. |
| **am**                          | The stored tag of a record's liveness (`am`). It is `a` for alive. It is `d` for damaged: the row failed its check, and its listing sets it aside in `damaged_rows`. It is `x` for gone, a tombstone. A tombstone never carries `a`. |
| **camped**                      | The refusal of a put told not to replace (`ifPresent: 'fail'`) where a live record already stands. `addPasskey` refuses it where a passkey wayin already stands. It holds the `world` and the `dbhas` that camped there. With `ifPresent: 'get'` the put answers the `declined` act with the record instead. |
| **deviceDB**                    | The storage plug-in for this device's leases (`DeviceDB`). The core supplies `MemoryDeviceDB`. A lease goes through `cache`, `peek` and `vacate`. `leasesProvedBefore(cutoff)` lists the cached leases past a cutoff. One scope's calls land in the order made. |
| **pantry**                      | The part of this device's store that holds what the vault may use but never see: its keys, kept as WebCrypto handles the page cannot export. It holds the leaseKey, and the vaultKey wrapped under it, as the lease. An operation under them runs inside the browser's keystore and hands back its result, never the key's bytes. Unwrapping the vaultKey from a lease, wrapping or unwrapping a boxKey, and ciphering a whisper are such operations. The `Lease` holds such a handle in a field. A proving holds its wayinKey only for its gating. The rest of the vault asks them, and no other class sees a key. The deviceDB reaches the pantry, through IndexedDB where a browser keeps it. Nothing in the pantry unlocks the vault off this device. |
| **registered_at**, **written_at** | `registered_at` is when this life of a record began, its birthday: the `written_at` of the put that made it, or remade it over a tombstone. Every later revision of that life keeps it. `written_at` is when the record was last written, by any put, whether or not its whisper changed. On a tombstone it is when the record was deleted. A vault record and a box each have both. Each wayin has a `registered_at`, when it was added. They are spelt so in storage and in code alike. |
| **proved_at**                   | When a gating's proving built a lease, spelt so on the lease. A cached lease is past autolock once more than `leaseMillis` has passed since its `proved_at`. Then it is never taken up again. |
| **autolockMinutes**             | The `Bank.make` option for how long a lease lasts after its proving, in minutes. The default is 14 days (`DefaultLeaseMillis`), and `Infinity` means until it is locked. The bank reports it as `autolockMinutes`, and hands it to its vaults as `leaseMillis`. `bank.autolock()` locks each listed vault whose cached lease is past it. The host calls it after `hello()` and on its own timer. |
| **strengthChecker**      | The `Bank.make` option that checks each new passphrase before it becomes a wayin (`StrengthChecker`). It checks the passphrase a vault is built with and each replacement, never one typed to unlock. It answers a verdict (`PassphraseVerdict`): `{ strong: true }` or `{ strong: false, reason }`. A weak passphrase is refused as `weak_passphrase`. The verdict's `reason` is the refusal's message. Anything the checker throws is replaced by a refusal. Its optional `load` runs at each bank's `hello()`. It is optional. Left out, it is `DefaultStrengthChecker`, which refuses every new passphrase as too weak. The refusal's message says one must be chosen (the core's CUSTOMIZATION.md). |
| **EpochMillis**                 | Every time safebyok keeps: whole UTC milliseconds since 1970, from `FarPast` (1981) to `FarFuture` (2255). The bounds catch seconds and microseconds passed by mistake.      |
| **fmt**                         | The number that heads every stored record and names its format: `6001` for a vault (`VaultFormat`), `5001` for a box (`BoxFormat`), `7001` for a lease (`LeaseFormat`). A box's stamp holds its `fmt`, and a lease's stamp holds the lease's. A box and a lease bind their vault's stamp, which has no `fmt`, so a new vault format still unseals them. Any change to what a record may hold moves its format on. A row of a newer format is set aside as damaged (`format_mismatch`). A stored vault or a fetched box row of a newer format refuses `newer_format`. |
| **scopepath**                   | The kind of a thing, then its scope's names in order, joined on `^`, which no name may contain: `vault^acme^u1^main`, `box^acme^u1^main^anthropic`. A listing finds each thing it holds by its scopepath. |
| **ckey**                        | A generic map key: an entry's name in a map, or an index in an array. It is never a storage address, which is a scopepath. |
| **clock**, **logger**           | Two options your app may pass to `Bank.make`. The clock is a source of the time (`Clock`). The logger is where the vault says what it has no one to throw to (`VaultLogger`).          |
| **story**                       | A controlled record of what is happening, suitable for logs or refusals (`Story`). A validator's `parse(val, story?)` takes one, `{ where, advice }`. `where` says where the input was judged, before the failures it names. `advice` says what to do, after them. Neither quotes the input. |

## Shapes

Each main type (vault, box, lease and the rest) has a small, fixed set of shapes. Each shape is
named for its purpose and prefixed with the type (`VaultStamp`, `BoxSparse`; never a bare
`Stamp`). Each is built from the record's own validator, so a reader learns one record and a
handful of named subtractions (STYLE.md, *Shapes and duck typing*).

| Shape         | What it is                                                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **record**    | The fields stored and sent over a wire, as one object (`VaultRecord`, `BoxRecord`).                                                                                         |
| **sparse**    | A subset of the record's own fields, minus the heavy and sensitive ones, as a list or a log shows it (`VaultSparse`, `BoxSparse`). It is the shape wherever the whole record is not needed. An associate, such as a vault's gate or its boxes, is never in it. Never call it "listing" or "listed", which read as the list or what holds it. |
| **stamp**     | The fields bound into a thing's cryptography (`VaultStamp`, `LeaseStamp`; see *The stamp*, above). A vault's and a lease's are fixed for the thing's life. A box's is the one revision it seals. |
| **scope**     | The composite id: the names its scopepath is made of (`VaultScope`, `BankScope`, and `Boxscope`, the one that smushes its two words).                                     |
| **dna**       | The partial duck of a type's required and optional props, along with those under the factory's control, which are ignored. It is what a caller hands `create`. Its validator is the type's duckish, below. |
| **tombstone** | What a deletion leaves (`VaultTombstone`, `BoxTombstone`).                                                                                                                  |
| **snapshot**  | For a stateful thing, what a host renders: its sparse shape and what changes beside it (`VaultSnapshot`). It is frozen plain data that keeps its identity until something changes. |

The **duckish** of a type is the validator that lets you round-trip an object of it, or
`{ ...spread, and, ...override }` one:

* you must give the required props;
* you may give the optional props, and every optional prop missing or explicitly undefined
  receives its default, or null;
* you may give, or omit, certain allowed-but-ignored extra props (the ones the factory controls),
  and those given must pass validation;
* the duckish validator strips those ignored props.

## Other credentials

| Name             | What it is                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **API key**      | A user's credential for some other service, and the usual thing a whisper holds. safebyok never names or inspects it.      |
| **access token** | Your app's own login credential, which your storage adapter may send to your backend. It never goes into a vault.       |

## Words between Coach and agent

* **fingerpaint.** Comments or edits a Coach leaves in a code file to show a change they want,
  rather than make it. Where the intent is clear, carry it out, and take the fingerpaint away
  with the change. A question inside one is an `#earnest-question`, not a directive: give your answer and
  recommendation. If you reach a confident conclusion of your own that relates to work under way, act on
  it in the same turn: add it to the plan, or include it in that turn's work.

## Words safebyok does not use

* **key, alone.** A key is always one of the five above, by name, or a wayinKey. An entry's name
  in a map is a `ckey`. A storage address is a scopepath.
* **data, contents, payload.** The secret is a whisper. Encrypted, it is a whisperCiphered.
* **open, as a verb on a key, a whisper or a box.** Name the operation instead. A key is
  unwrapped (`unwrap`). A whisper is deciphered (`decipher`). A box is unsealed (`unseal`). A
  whisper is taken out of its box by `extract`. A sentence the user sees may still say "open".
* **unlock, as a noun.** A way in is a wayin. What a device caches is a lease. `ensureUnlocked()`
  is the verb, and `unlock_vault` the gating.
* **proof; ask, as a noun.** What the user hands in is cleartext. Made into a key, it is a proving. The
  request for it is a gating.
* **device key.** The key behind a lease is the leaseKey.
* **public, plain, server-readable, of a stored field.** A field is visible (unencrypted and
  authenticated) or unencrypted (and possibly not authenticated). There are no public keys here.
  The `'plain'` field class in `safebyok-graphql`'s `src/fields.ts` keeps its name as a code
  identifier.
* **KEK, DEK, KDF, AAD.** They appear above only so a security reviewer can map safebyok's names
  onto the usual ones. Nothing in safebyok's API asks you to learn them.

Stored records spell every name in underbar_case: `whisper_ciphered`, `key_deriver_label`.

The names the reform of October 2026 retired, and the old design's names the new core does not
have, are in `notes/old_vocabulary.md`, for reading older code and records. Nothing in the core
uses them.
