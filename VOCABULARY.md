# Vocabulary

safebyok names each thing once, in plain words, and uses that one name in its API, its docs, its
stored records and its code. This page is the cast. You don't need to know any cryptography to
use safebyok. If you do, the *Standard term* column gives the usual term.

## What you handle

| Name           | What it is                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **whisper**    | The secret you put in a box. It is always a plain JSON object, such as `{ apiKey }` or `{ apiKey, orgId }`. safebyok never looks inside it.                                                                  |
| **box**        | Contains one encrypted whisper, together with its `boxlabel` and a sidecar your UI may show while the vault is locked. It is a `Box` in code. Its stored form is its record, a `BoxRecord`. |
| **vault**      | One user's set of boxes, named by your app's `applabel`, the signed-in user and its own `vaultlabel`. The **Vault object** (`Vault`) represents one life of the vault in this tab, for as long as the bank has it enlisted. `bank.ensureVault({ vaultlabel })` returns the Vault object the bank lists for that scope. If no vault is stored, it builds one through a `build_vault` gating. `vault.hello()` lists the vault's boxes and starts watching them. The only absent vault a Vault object can represent is a deleted one: it adopts the tombstone, keeps its slot in the bank's listing, and refuses every call. A newer life of that scope replaces it, and a vacate disables it at once. A Vault object that has been replaced or vacated is discarded for good, and refuses every later call. The bank enlists a new Vault object for the next life. |
| **bank**       | The signed-in user's vaults in the app, one Vault object per scope, and what they share (`Bank`). They share the key deriver, the strength checker, the vaultDB and deviceDB, the limits, `requestCleartext` and `onBadNews`. There is one bank per signed-in user, and its scope is `{ applabel, user_id }` (`BankScope`). The host discards it at sign-out. `Bank.make(opts)` checks its options and does nothing else. `bank.hello()` loads the libraries the vaults share and lists the vaults stored for the bank. `bank.ensureVault({ vaultlabel })` returns the vault the bank lists for that scope, or builds one. |
| **passphrase** | What the user types to unlock their vault. It is not their login password. safebyok never writes it or sends it anywhere. A vault has exactly one, its passphrase wayin. A `replace_passphrase` gating replaces it, and leaves the passkey wayin as it was. |
| **passkey**    | What the user touches to unlock instead of typing: a fingerprint, a face, a phone or a security key. It is a WebAuthn credential, and its authenticator produces the secret bytes for the vault through the PRF extension. safebyok never has the passkey's own secret. The authenticator has it, and responds only after the user's fingerprint, face or PIN. A vault has at most one, its passkey wayin, which always exists alongside the passphrase wayin it was added under. An `add_passkey` gating adds it. `addPasskeyPrompt()` refuses while this vault's gate already has one. The vaultDB's `addPasskey` refuses with `camped` when storage already has one that the gate did not show. A `revoke_passkey` gating removes it. |
| **wayin**      | One way into a vault: its passphrase or its passkey, as the vault records it (`Wayin`). Each has a `wayinkind` (`passphrase` or `passkey`; `Wayinkind`). Each also has its `registered_at`, and the `device_id` of the device that built it. A passkey's wayin also has the `credential_id` and `prf_salt_b64` needed to ask the passkey. A vault has exactly one passphrase wayin and at most one passkey wayin. They are its gate's `passphrase_wayin` and `passkey_wayin`. A wayin's **header** (`WayinHeader`) is every field of it except its vaultKeyWayinWrapped. Every change to the wayins requires the current passphrase. *Encrypted forms* describes how a wayin is stored. |
| **cleartext**  | What the user gives a gating to prove that a wayin is theirs: a passphrase, as the text they typed, or a passkey answer (`PasskeyAnswer`). Only a gating's attempt accepts it, and no vault call does. It can unlock as much as the wayin it belongs to, so the attempt turns it into a proving and then discards it. The attempt also zeroes a passkey answer's bytes. In text the user sees, it is called "Vault unlocker" (the Coach, 2026-10-24): any user-facing text that names the passphrase and passkey together says "Vault unlocker". The code keeps `cleartext`. |
| **gating**     | A single request for cleartext (`Gating`), launched by a vault call that needs the user. `ensureUnlocked()` launches one on a locked vault, after it tries the cached lease. `bank.ensureVault()` launches one for a vault not yet stored. `replacePassphrasePrompt()`, `addPasskeyPrompt()`, `revokePasskeyPrompt()` and `delVaultPrompt()` (or `del()`) each launch one. The bank passes it to the host's **requestCleartext** (`RequestCleartext`), which is the only place where UI meets the vault. It is a union discriminated by its **gatingkind** (`Gatingkind`): `build_vault`, `unlock_vault`, `replace_passphrase`, `add_passkey`, `revoke_passkey` or `del_vault`. Each kind has one attempt, typed for that kind, along with `dismiss()` and `whenConcluded`. An attempt runs its kind's whole chain. Only one gating is open per bank at a time, and a second call that needs the user while one is open refuses. A gating that has concluded has **landed**, and any later attempt on it refuses. |
| **proving**    | Cleartext turned into a wayinKey for one gating (`PassphraseProving`, `PasskeyProving`). It is built from a wayin's header: either the current wayin's header, to prove the vault's current gate, or a fresh header, which becomes a new wayin. Its wayinKey is non-extractable. It builds wayins (`proving.buildWayin()`) and leases (`proving.buildLease()`), wrapping and unwrapping the vaultKey privately to do so. It never gives a vaultKey to its caller. It lasts only as long as its gating. |
| **gate**       | The vault's current wayins: its passphrase wayin, its passkey wayin if it has one, and their `gate_epoch` (`Gate`). A gating's chain builds the next gate from the current one. It stores that gate in place of the one it was built from, with one conditional call of the vaultDB: `putVault`, `replacePassphrase`, `addPasskey` or `revokePasskey`. Each call increments `gate_epoch` by one. The first gate, built by a `build_vault` gating, has epoch 1 (`FirstGateEpoch`). Every stored vault has a gate. |
| **passkey answer** | The response a passkey gives when it is asked for its vault (`PasskeyAnswer`, kept as a `passkeyClear`): the credential's id, the salt it was asked with, and 32 secret bytes. The host gets one from `safebyok-react`'s `createPasskey` or `askPasskey`, and passes it to a gating's attempt. The attempt turns it into a passkey **proving** (`PasskeyProving`) and zeroes its bytes. |
| **lease**      | A grant that lets this device unlock again for a while without asking the user (`Lease`). A gating's proving builds it (`proving.buildLease()`). `ensureUnlocked()` attaches the lease cached on this device (`Lease.buildFromCache`), whichever tab cached it. It has the leaseKey and the vaultKeyLeaseWrapped, and never leaves the device. It lasts `leaseMillis` from its `proved_at`, which `autolockMinutes` sets. While the vault is unlocked, its lease is granted to the Vault object, which keeps it private: no getter exposes it. Boxes are sealed and unsealed with it (`lease.sealWith`, `lease.unsealWith`). Each of those calls unwraps the vaultKey for its own use and does not keep it afterwards. An **evicted** lease (`lease.evict()`) drops its keys but leaves its cached row in place. A lock drops the lease and forgets its cached row. A vacate drops the keys and forgets the row. A lease that fails to unwrap refuses with `damaged_lease`; its vault then locks, and the lease is evicted. A cached lease past autolock is never attached, and its row stays until `bank.autolock()` or a lock forgets it. A cached lease from another life of the vault, or from another gate, is never attached. |

## Keys

safebyok has five keys. Each is a 256-bit AES-GCM key, named for what it belongs to. None ever
leaves the user's device unencrypted. There are no public or private keys: everything is symmetric.
(A passkey has a key pair of its own inside its authenticator. safebyok never uses it, only the PRF
answer the authenticator produces alongside it.)

| Name               | What it is                                                                                                                                                         | Standard term                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **passphraseKey**  | Made from a passphrase and its wayin's passphraseSalt by the key deriver. Its only job is to wrap the vaultKey, as that wayin's wayinKey.                          | passphrase-derived KEK              |
| **passkeyKey**     | Made from a passkey's PRF answer by HKDF-SHA256. The HKDF `info` is the ctx that its wrap is bound to: the vault, the purpose and the wayin. Its only job is to wrap the vaultKey, as that wayin's wayinKey. | PRF-derived KEK                     |
| **wayinKey**       | Not a sixth key: the passphraseKey or passkeyKey of one wayin, named for its role once it acts on the vaultKey. The code that makes it keeps the specific name. The code that wraps and unwraps the vaultKey calls it the wayinKey, and does not need to know which kind of wayin made it. | KEK                                 |
| **vaultKey**       | The vault's random master key. It wraps every boxKey. It stays the same when a wayin is added, revoked or replaced, so none of those rewrites a box. Nothing replaces it, because rotation is not built yet. | key-encryption key (KEK)            |
| **boxKey**         | A random key for one box, made fresh every time a box is sealed. It ciphers that box's whisper.                                                                 | data-encryption key (DEK)           |
| **leaseKey**       | Kept in this browser, which cannot export it. It wraps a copy of the vaultKey so that a lease can unlock without asking. It contains nothing about the device itself. | non-extractable, device-bound KEK |

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
* **extract** means taking one thing out of another: `box.extractWhisper()` unseals the box and
  returns its whisper, and stores nothing on the box.

Each encrypted form is a pair: its cipherIv and its ciphertext. The core has one shape for the
pair, **`Ciphered`**: `{ cipher_iv_b64, ciphertext_b64 }`. Each half is base64url text (the `_b64`
suffix). So every encrypted field in a stored record is plain JSON that any storage layer can
accept as-is.

| Name                          | What it is                                                                                         | Standard term       |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ------------------- |
| **whisperCiphered**           | The whisper, ciphered under its boxKey: a box's `whisper_ciphered`.                                | ciphertext          |
| **boxKeyWrapped**             | The boxKey, wrapped under the vaultKey: a box's `box_key_wrapped`, stored beside its whisperCiphered. | wrapped DEK         |
| **vaultKeyWayinWrapped**      | The vaultKey, wrapped under one wayin's wayinKey: that wayin's `vault_key_wayin_wrapped`. Your storage syncs it to every device. | wrapped KEK |
| **wayin**, as stored          | A wayin as it is stored in the vault record's gate, as `passphrase_wayin` or `passkey_wayin` (`WayinRecord`). It is a `PassphraseWayinRecord` or a `PasskeyWayinRecord`, distinguished by `wayinkind`. It has the visible fields its kind needs: a passphrase's `key_deriver_label` and `salt_b64`, or a passkey's `credential_id` and `prf_salt_b64`. It also has its vaultKeyWayinWrapped, its `registered_at`, and the `device_id` of the device that built it. Both wayins wrap the same vaultKey. | key slot |
| **vaultKeyLeaseWrapped**      | The vaultKey, wrapped under the leaseKey: a lease's `vault_key_lease_wrapped`. It never leaves this device. | device-wrapped KEK  |

## Ingredients and contexts

None of these is secret. Each is stored in the clear or rebuilt when needed. If any one is wrong or
has been tampered with, decryption fails.

| Name                     | What it is                                                                                                                                                           | Standard term        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **passphraseSalt**       | Random bytes given to the key deriver along with the passphrase (`salt_b64`): 16 of them under the supplied keyDeriverSpec. Each passphrase wayin has its own, never shared. It is replaced whenever that passphrase changes. | salt                 |
| **prfSalt**              | 32 random bytes that a passkey's authenticator is asked to evaluate its PRF on (`prf_salt_b64`). Each passkey wayin has its own, made fresh when the passkey is added. It is visible. The authenticator's answer to it is the secret. | PRF salt, hmac-secret salt |
| **keyDeriverSpec**       | The recipe that turns a passphrase into the passphraseKey: Argon2id's parameters under a keyDeriverLabel. safebyok supplies one, `Argon2idWebV1`: 64 MiB of memory, 3 passes, 1 lane, a 16-byte salt and a 32-byte result. A host may choose its own. | KDF parameters       |
| **keyDeriverLabel**      | The keyDeriverSpec's name (`argon2id_web_v1` for the supplied one). Each passphrase wayin records it, so the vault records how its passphraseKey was made. A label always means the same parameters. Labels beginning `argon2id_web_` are reserved for the specs safebyok supplies. | KDF identifier       |
| **key deriver**          | The function that makes the passphraseKey, following a keyDeriverSpec: `argon2idWebV1Deriver` for the supplied spec, `argon2idDeriver(spec)` for a host's own. A deriver that uses a supplied spec's label must have that spec's parameters, or it is refused. | KDF                  |
| **cipherIv**             | 12 random bytes, fresh for every encryption, stored beside their ciphertext.                                                                                          | IV, nonce            |
| **ctx**                  | The context that an encryption is bound to. The encryption's tag proves that the context is unchanged. A ctx consists of the **stamp** of the thing it seals or wraps, and its purpose, which names the field. A wayin's ctx (`wayinCtxOf`) has its vault's stamp (`VaultStamp`) and the wayin's header. A box's ctx has its vault's stamp and the box's own. A lease's ctx has its vault's stamp and the lease's own (`LeaseStamp`). `cipherCtx(stamps, purpose, header)` makes one. It takes a list of stamps because a thing binds the stamp of whatever contains it as well as its own. Every function that ciphers or wraps takes it as `ctx`. It is rebuilt when needed rather than stored. So ciphertext copied anywhere else, or kept under an altered field, will not decipher or unwrap. | associated data (AAD) |
| **ciphertext**           | The encrypted bytes, with their authentication tag on the end.                                                                                                       | ciphertext           |
| **vaultTok**             | A random token that changes on every life of the vault (`vault_tok`). It is minted when the vault is made for its scope, and never changes within that life. The scope identifies the vault. The token distinguishes one **life** of that scope from the next, so a vault that was deleted and made again is never mistaken for the old one. Every ctx binds it. Every vaultDB call on a box or a gate checks it against the stored vault. A live vault under the same scope with a different `vault_tok` is a new life, and a call made with the old token refuses. | --                   |
| **boxTok**               | A random token that changes on every life of a box under its boxlabel (`box_tok`). It is minted when the box is first made, and every later revision in that life keeps it. A box's life is identified by its vault's token and its own, `vault_tok` and `box_tok`. So a box that was deleted and made again elsewhere can be distinguished from the one this device had. vaultTok and boxTok are the **life toks**, made by `makeLifeTok`. | --                   |
| **revisionTok**          | A fresh token for each put or del of a record, vault or box (`revision_tok`). Its `revision_seq` counts up alongside it, and a higher seq is newer. Both are part of the box's stamp. Storage refuses a put made from a stale fetch (`stale_write`).              | version, CAS token   |
| **gateEpoch**            | A counter that goes up whenever the vault's wayins change (`gate_epoch`). Replacing the passphrase, adding a passkey and revoking a passkey each increment it, so other devices and leases know to ask again. | key epoch            |
| **deviceId**             | The host's id for this device in a bank's scope (`device_id`), a UUID such as the one `crypto.randomUUID()` makes. `Bank.make` requires it and does not mint one: `deviceDB.ensureCachedBank` mints one per bank scope and keeps it in the deviceDB's bank row. Each wayin records the deviceId of the device that built it, visible in storage. A random id that the host keeps per device is best: an id derived from anything about the device would link records that the vault itself does not link. The `device_id` and `user_id` are provided in the options. If the `user_id` contains sensitive data please hash it first: `user_id: await mash(email)`. | installation id (scoped) |
| **mash**                 | The SHA-256 of a text as 43 characters of unpadded base64url (`mash(text)`), the same encoding as every stored `_b64` field. It is a one-way substitute for an id a host would rather not hand over. Mashing an email hashes it, unsalted. It is exported from `safebyok/utils`, which has the small helpers for the app around a vault. | hash |
| **mask**                 | The outline of a secret text that is safe to show (`mask(whisper.apiKey)`): a few characters from each end with stars between, as one plain line for a log or a reminder, so a UI can tell which API key a box has without revealing it. It is not a faithful copy: marks, invisible characters, bidirectional controls and spaces are dropped, though right-to-left letters are kept and may reorder their neighbours in a display. It is intended for plain text; arbitrary blobs may give unusual behavior. Stripping every mark removes the vowels of scripts that write vowels as marks (Hindi `नमस्ते` comes out as `नमसत`); an API key is ASCII, and is untouched. Its result is public: it gives away the text's ends and, up to `maxLen`, its length. `mask(text, { head: 0, tail: 0 })` shows only the length. It is exported from `safebyok/utils`. | redact |

**An `_id` is a hard identifier. A `_tok` is only compared.** A stored field ending `_id` names one
thing permanently, and a record is looked up by it (`device_id`, and the `credential_id` and
`user_id` that come from outside). A random token that is checked, and never used to look anything
up, is a `_tok`. It changes on every life of the thing it marks. `revision_tok` changes on every put
or del of a record. `vault_tok` changes on every life of a vault in its scope. `box_tok` changes on
every life of a box under its boxlabel. In code they are `vaultTok`, `boxTok` and `revisionTok`.

**The stamp** is the set of fields that a thing's ctx binds its ciphertext to, so that the
ciphertext deciphers only as part of that thing. A vault's stamp is fixed for its life. `VaultStamp`
is the vault's scope, `vault_tok` and `registered_at`. A lease's stamp is fixed for the lease.
`LeaseStamp` is its `fmt`, its vault's stamp, its `gate_epoch`, `proved_at` and `wayinkind`: all of
the lease record except its key material. A box's stamp is not fixed for its life. It is every
sparse field of the single revision it seals, including `revision_tok`, `revision_seq`, `written_at`
and the sidecar. So a whisper deciphers only within the exact revision it was sealed in, and a
record that storage has spliced together from different revisions does not decipher at all. That is
why every edit of a box seals it again. No code moves a sealed box to another revision without
sealing it again. A thing binds its own stamp and the stamps of whatever contains it. A vault's
stamp has no `fmt`, so its boxes and leases still unseal and unwrap under a new vault format. Say
"stamp" for the bound fields, never "the binding" or "the authentics".

## Names, records and times

The names that address a vault, the records that are stored, and the times they carry. A label
(`label`) is lowercase words of letters and digits joined by single underscores, such as
`anthropic_api_key`. It starts with a letter, and is 2 to 40 characters long (`Patterns.label`,
`MaxLabelChars`). The name rules are the package's own. A host never checks a name against a rule of
its own: it percent-encodes (RFC 3986) any name that falls outside the package's rules.

| Name                            | What it is                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **applabel**                    | Your app's own label, so several apps can share one backend without colliding. It is stored as `applabel`.                                                                  |
| **vaultlabel**                  | The label of one of a user's vaults, such as `main`. It is stored as `vaultlabel`.                                                                                          |
| **boxlabel**                    | The label of a box within its vault: what you pass to `putBox`, `getBox`, `fetchBox` and `delBox`. It is stored as `boxlabel`.                                                 |
| **user_id**                     | The signed-in user's stable, opaque id from your own auth. It is the only name in a scope that is not a label: 1 to 100 ASCII letters, digits and `-_.~:@+\|%`, never dots alone (`Patterns.user_id`, `MaxUserIdChars`). It is never an email or a handle, which can change. It is spelled `user_id` everywhere: in an option, in a prop and in storage. |
| **scope**                       | An applabel, a user_id and a vaultlabel together: it names one vault (`VaultScope`).                                                                                         |
| **visible**                     | Said of a stored field that is both unencrypted and authenticated. A visible field is in a stamp, or a wayin's header, that a ctx binds. A change to it in storage makes the record refuse to unseal or unwrap. Anyone who can read the database can read it. Visible fields are the vault's stamp (its scope, `vault_tok` and `registered_at`), every sparse field of a box and its sidecar, and each wayin's header. A wayin's header is its `wayinkind`, `key_deriver_label` or `credential_id`, salt, `device_id` and `registered_at`. Every field of a box or a wayin is visible except the encrypted ones. A visible field is never secret. Say "visible" only of a field that is authenticated. Say "visible in storage" where a sentence could be read as screen visibility. |
| **unencrypted**                 | Said of a stored field that is not encrypted, and nothing more: it may be authenticated or it may not. The vault record's `fmt`, revision fields, `written_at`, `am` and `gate_epoch` are unencrypted. No wayin's ctx binds them. Whether its gate has a passkey wayin is unencrypted too. Say "unencrypted" in a record-general or backend-general sentence ("ciphertext and unencrypted fields"). Say "visible" of a field known to be authenticated. |
| **sidecar**                     | Your app's own data, stored alongside a box's whisper (`sidecar` at `putBox()` and in the snapshot; `Sidecar`). Its trust class is **visible** (see that entry). The box's stamp includes it, so a change in storage makes the box refuse to unseal. It is never encrypted, and anyone who can read the database can read it. It is guaranteed unchanged once the box is unsealed. Until then the snapshot shows it as it is stored. It is a JSON object of any JSON values. It is for what an app wants to search server-side, or to show while the vault is locked. Examples are a team, a rotation reminder, or a count of the calls the app made to OpenRouter with this whisper. It is never secret material. safebyok never looks inside it, and your app checks its shape. It is stored as the JSON object it is (`sidecar`; a `jsonb` column on Postgres). It is bound with its ckeys sorted, and always written (`{}` when there is none). It counts with the whisper toward what storage allows in one record (`box_too_large`). |
| **whisper codec**, **whisper schema version** | The encoding that turns a box's whisper into bytes before it is ciphered, and the version number of the whisper's own shape. `whisper_codec` is `json_v1`: its JSON with ckeys sorted, as UTF-8. `whisper_schema_version` is 1. Both are stored, and both are in the box's stamp. Neither can be set by a caller yet. |
| **damaged**                     | Said of a stored row that fails its checks when it is read from storage. Such a row refuses with `damaged_row`, and its listing sets it aside. A damaged row never indicates format drift: it is thrown by the vaultDB tied to the datastore. What is set aside is the row's scope, its `vault_tok` if it is a box, and `am` `d`; nothing else is read from a row that failed. A vault's fetch lists its damaged box rows in `damaged_rows` (`DamagedBox`), never among its sound `boxes`, under whatever boxlabel storage has for them. A box stored under a name that the label rule refuses is listed there too. Nothing in the core interface deletes a damaged row: use such housekeeping calls as we offer, or access the datastore directly. A box that does not unseal under the vault's own vaultKey, or that unseals to no whisper, refuses with `damaged_whisper`. The bank's fetch reports each damaged vault row as bad news. |
| **vault record**                | The single record per vault, which every device syncs (`VaultRecord`, `fmt` 6001). It has the vault's scope, `vault_tok`, `registered_at` and `written_at`, its revision (`revision_tok`, `revision_seq`) and its `am`. It also has its **gate**, nested: `gate_epoch`, `passphrase_wayin`, and `passkey_wayin` or null. Nothing in it unwraps without a passphrase or passkey. Its `vault_tok` identifies its life permanently. It is random, and never reused. Its other shapes are subsets of it: `VaultSparse` (everything except the gate), `VaultStamp` (the stamp), `VaultScope`, and `VaultTombstone`, which is what `delVault` leaves. |
| **lease**, as cached            | The record a device caches so that it can unlock without asking (`LeaseRecord`, `fmt` 7001). The vault it is granted to uses it as a `Lease`, built from the record. It has the leaseKey, the vaultKeyLeaseWrapped and the lease's stamp: the vault's stamp, the `gate_epoch` it was proved at, `proved_at` and `wayinkind`. It stays on the device. The deviceDB stows it (`stow`), returns it (`peek`) and forgets it (`forget`). Only `peek` returns a lease's leaseKey. Only a `Lease`, a proving and the deviceDB ever have the record. |
| **device record**, **bank row** | The deviceDB's bank row (`BankRow`): `{ applabel, user_id, device_id }`, one per bank scope, its `device_id` a random UUID. `deviceDB.ensureCachedBank({ applabel, user_id })` returns it, making it on the first call, and the host passes its `device_id` to `Bank.make`. `deviceDB.forgetBank` forgets it, as a bank's vacate does, so the next `ensureCachedBank` mints another `device_id`. It is not secret, and has no key. A row that fails its check is replaced with a new one. |
| **locked**                      | Said of a Vault object with no lease granted (`vault.isLocked`, and its snapshot's `isLocked`); **unlocked**, of one with a lease granted. A vault not yet stored has no Vault object, and its first gating is `build_vault`. |
| **timely**                      | Said of a thing whose local copy of its record was refreshed recently enough to trust (`isTimely`). The bank's `vaultRefreshMinutes` and `boxRefreshMinutes` set how recently, 5 minutes by default. A caller may name its own age (`maxMillisSinceRefresh`). `fetchBox` always refreshes. |
| **stage**                       | The bank's point in its lifecycle, shown as its snapshot's `stage` (`BankStage`). It is `made` until a `hello()` succeeds. It is `ready` once `hello()` has loaded the libraries its vaults share and listed them. It is `disabled` after a sweep or a vacate, and the snapshot's `err` says why: `disabled`, or the `identity_revoked` that vacated it. |
| **the bank's listing**          | The vaults the bank has enlisted (`bank.vaultListing`). A deleted vault stays in it until a newer life replaces it. The bank's snapshot lists the present ones as `vaults`, one `VaultSnapshot` each. `bank.vaultAt({ vaultlabel })` returns the Vault object listed for a scope, including a deleted one, or null. |
| **rotation**                    | Replacing a vault's vaultKey with a new one and sealing every box again under it, so that a wayin revoked beforehand unwraps nothing written afterwards. It is not built yet. When it is, it adds an epoch to the vault record, each wayin and each box, saying which vaultKey each belongs to, with the format bumps that go with it (TODO.md, *Which wayins a rotation keeps*). Until then the vaultKey never changes. A vault that is made again has a new vaultTok, which voids every box. |
| **get**, **put**, **del**       | The three verbs of the vault and the vaultDB, each applied to the things it has. The vault has `getBox`, `putBox` and `delBox`. The vaultDB has `getVault`, `putVault` and `delVault`, and `getBox`, `putBox` and `delBox`. `del` deletes permanently. The deleted thing leaves a tombstone of its sparse fields (`am` `x`), and its whisper or gate is removed. `del()` deletes the whole vault. The deviceDB's verbs for a lease are `stow`, `peek` and `forget`; the vault side says `cache` for `stow`. |
| **enlist**, **delist**, **listed** | A listing **enlists** an instance under its scope, once, and **delists** it when the instance is discarded. An instance that is enlisted and not yet delisted is **listed** (`AlreadyListed`). |
| **adopt**, **align**            | The two steps a storable takes with a record once `receive` has judged it: `adopt` assigns its props and private fields to the instance, and `align` remakes the snapshot and notifies the listeners. |
| **conclude**                    | A gating concludes once: it reports its final outcome, success or refusal, and does not change afterwards (`whenConcluded`). |
| **land**                        | An operation has landed when it and all its consequences are done: a lock, unlock, vacate, sweep or delete, with every prop aligned and the lease stowed or forgotten. A storage write that took effect is **written** (`Written`, `isWritten`), never landed. |
| **attach**, **detach**          | Set or unset an object's has-one instance property to an instance: a vault's lease is attached, and detached. |
| **increment**                   | Atomically increase an integer sequence value by exactly one, or by the given amount. |
| **revoke**                      | Detach a lease and forget it (`Lease.revoke`, `Vault.#revokeLease`). A lease attached to its vault is **granted**. Say **cached** only of the row on the device, and **granted** of the lease's life. |
| **storage**, **datastore**      | **Storage** is the database under a vaultDB adapter. A **device database** is what the deviceDB is. Name the `VaultDB` or `DeviceDB` where one is meant, and say **datastore** only where any of them is meant; `store` is not a noun here. |
| **ensure**                      | Return the thing if it is already there, or make it so and then return it, so that a second call costs nothing (`bank.ensureVault`, `vault.ensureUnlocked`). An `ensure` is the async third member of a check's triplet (STYLE.md, *Naming*). `isUnlocked` asks, `demandUnlocked` refuses, and `ensureUnlocked` makes it so. A function that only checks, and refuses, is a `check` or a `demand`. |
| **refuse**, **refusal**         | To refuse is to issue an error, by whichever means fits the context: throwing it, notifying of it, or returning it in an `Outcome` or an `Answer`. The **refusal** is the error issued, and its `refusalkind` says which. |
| **Outcome**                     | The result a non-throwing `try*` call resolves to (`Outcome<ValT>`): `{ ok: true, val }` on success, or `{ ok: false, err }`, where `err` is the refusal. |
| **Answer**                      | A vaultDB verb's `Outcome`, with what storage reported beside it (`Answer`, `GoodAnswer`, `BadAnswer`): its `act`, `world` and `dbhas` (see **act**). |
| **read**, **write**             | Umbrella words for any get, or any put or del: `stale_write`, `written_at`, "a write made from a stale read". Neither is ever a verb of the API. |
| **vaultDB**                     | The storage plug-in for what syncs (`VaultDB`): vault records and boxes, ciphertext only. An adapter extends `AdapterVaultDB` and implements its `do*` calls; a client of an adapter, such as `GraphQLVaultDB`, implements `VaultDB`. The core supplies `MemoryVaultDB`. `listVaults` lists the bank's vaults. `getVault` fetches a vault record alone. `listBoxes` lists a vault's boxes, with its record, in one call. `getBox` fetches one box. `putVault`, `putBox`, the gate verbs and the `del` verbs write. Each is one transaction, and each returns what is now stored. `tidyGone` is for hosts: it removes the box rows of tombstoned or vanished vaults. |
| **act**, **world**, **dbhas**   | The fields of a vaultDB verb's answer beside its `val` (`GoodAnswer`, `BadAnswer`). The **act** says what happened. A put's act is `born`, `reborn`, `replaced` or `declined`. A del's is `deleted`, `gone` or `void`. A get's is `got`, `gotvoid` or `gotgone`. A thing's **world** is what it is listed under: a bank for vaults, a vault for boxes. A box answer's `world` field has its vault's row, fetched in the same step, and the vault refreshes from it. **dbhas** is the stored row the call found where it was acting, or null if there was none. A refusal's `meta` has the same `world` and `dbhas`, so an answer and an error are read the same way. |
| **am**                          | The stored tag of a record's liveness (`am`). It is `a` for alive. It is `d` for damaged: the row failed its check, and its listing sets it aside in `damaged_rows`. It is `x` for gone, a tombstone. A tombstone never has `a`. |
| **camped**                      | The refusal of a put that was told not to replace (`ifPresent: 'fail'`) when a live record is already stored. `addPasskey` refuses with it when a passkey wayin is already stored. It has the `world`, and the `dbhas` that was already there. With `ifPresent: 'get'`, the put returns the `declined` act with the stored record instead. |
| **deviceDB**                    | The storage plug-in for this device's leases and bank rows (`DeviceDB`). The core supplies `MemoryDeviceDB`, and `IdbDeviceDB` for a browser. A lease goes through `stow`, `peek` and `forget`. `listLeases()` lists every cached lease, oldest first. Calls for one scope take effect in the order they were made. A bank row goes through `ensureCachedBank` and `forgetBank`. |
| **pantry**                      | The part of this device's database for what the vault may use but never see: its keys, kept as WebCrypto handles that the page cannot export. It has the leaseKey and the vaultKey wrapped under it, together as the lease. An operation with these keys runs inside the browser's keystore and returns its result, never the key's bytes. Unwrapping the vaultKey from a lease, wrapping or unwrapping a boxKey, and ciphering a whisper are such operations. The `Lease` has such a handle in a field. A proving has its wayinKey only for the duration of its gating. The rest of the vault asks the `Lease` or the proving to do the work, and no other class sees a key. The deviceDB reaches the pantry, through IndexedDB where a browser stores it. Nothing in the pantry can unlock the vault on another device. |
| **registered_at**, **written_at** | `registered_at` is when this life of a record began: the `written_at` of the put that made it, or remade it over a tombstone. Every later revision of that life keeps it. `written_at` is when the record was last written, by any put, whether or not its whisper changed. On a tombstone it is when the record was deleted. A vault record and a box each have both. Each wayin has a `registered_at`, when it was added. They are spelled this way in both storage and code. |
| **proved_at**                   | When a gating's proving built a lease, spelled this way on the lease. A cached lease is past autolock once more than `leaseMillis` has passed since its `proved_at`. Then it is never attached again. |
| **autolockMinutes**             | The `Bank.make` option for how long a lease lasts after its proving, in minutes. The default is 14 days (`DefaultLeaseMillis`), and `Infinity` means until it is locked. The bank reports it as `autolockMinutes`, and passes it to its vaults as `leaseMillis`. `bank.autolock()` locks each listed vault whose cached lease is past it. The host calls it after `hello()` and on its own timer. |
| **strengthChecker**      | The `Bank.make` option that checks each new passphrase before it becomes a wayin (`StrengthChecker`). It checks the passphrase a vault is built with and each replacement, never one typed to unlock. It returns a verdict (`PassphraseVerdict`): `{ strong: true }` or `{ strong: false, reason }`. A weak passphrase is refused as `weak_passphrase`. The verdict's `reason` is the refusal's message. Anything the checker throws is replaced by a refusal. Its optional `load` runs at each bank's `hello()`. The option itself is optional. If it is left out, `DefaultStrengthChecker` is used, which refuses every new passphrase as too weak. Its refusal's message says a checker must be chosen (`notes/configuration.md`). |
| **EpochMillis**                 | Every time value in safebyok: whole UTC milliseconds since 1970, from `FarPast` (1981) to `FarFuture` (2255). The bounds catch seconds and microseconds passed by mistake.      |
| **fmt**                         | The number at the start of every stored record, which identifies its format: `6001` for a vault (`VaultFormat`), `5001` for a box (`BoxFormat`), `7001` for a lease (`LeaseFormat`). A box's stamp has its `fmt`, and a lease's stamp has the lease's. A box and a lease bind their vault's stamp, which has no `fmt`, so a new vault format still unseals them. Any change to what a record may contain gives it a new format number. |
| **scopepath**                   | The kind of a thing, then its scope's names in order, joined on `^`, which no name may contain: `vault^acme^u1^main`, `box^acme^u1^main^anthropic`. A listing finds each thing it has by its scopepath. |
| **ckey**                        | A generic map key: an entry's name in a map, or an index in an array. It is never a storage address, which is a scopepath. |
| **logger**                      | An option your app may pass to `Bank.make` (`VaultLogger`). The vault reports to it whatever it has no caller to throw to. |
| **story**                       | A controlled record of what is happening, suitable for logs or refusals (`Story`). A validator's `parse(val, story?)` takes one, `{ where, advice }`. `where` says where the input was judged, and goes before the failures. `advice` says what to do, and goes after them. Neither quotes the input. |

## Shapes

Each main type (vault, box, lease and the rest) has a small, fixed set of shapes. Each shape is
named for its purpose and prefixed with the type (`VaultStamp`, `BoxSparse`; never a bare
`Stamp`). Each is built from the record's own validator, so a reader learns one record and a
handful of named subsets of it (STYLE.md, *Shapes and duck typing*).

| Shape         | What it is                                                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **record**    | The fields stored and sent over a wire, as one object (`VaultRecord`, `BoxRecord`).                                                                                         |
| **sparse**    | A subset of the record's own fields, minus the heavy and sensitive ones, as a list or a log shows it (`VaultSparse`, `BoxSparse`). It is the shape wherever the whole record is not needed. An associate, such as a vault's gate or its boxes, is never in it. Never call it "listing" or "listed": those words mean the list, and a thing enlisted in it. |
| **stamp**     | The fields bound into a thing's cryptography (`VaultStamp`, `LeaseStamp`; see *The stamp*, above). A vault's and a lease's are fixed for the thing's life. A box's is the single revision it seals. |
| **scope**     | The composite id: the names its scopepath is made of (`VaultScope`, `BankScope`, and `Boxscope`, the only one that smushes its two words).                                     |
| **dna**       | A type's required and optional props, plus the props the factory controls, which are accepted and ignored. It is what a caller passes to `create`. Its validator is the type's duckish, described below. |
| **tombstone** | The record a deletion leaves behind (`VaultTombstone`, `BoxTombstone`).                                                                                                                  |
| **void**      | An item that is missing altogether, rather than tombstoned; a vacant row. |
| **dated**     | A row's scope, `vault_tok` and the time it is judged by, without the rest of the row. For a cached lease the time is its `proved_at` (`LeaseDated`), and this is the shape the deviceDB's `listLeases` returns. |
| **snapshot**  | For a stateful thing, what a host renders: its sparse shape plus the state that changes alongside it (`VaultSnapshot`). It is frozen plain data that keeps its identity until something changes. |

The **duckish** of a type is the validator that lets you round-trip an object of it, or spread one
and override some of its props (`{ ...spread, and, ...override }`):

* you must give the required props;
* you may give the optional props, and every optional prop missing or explicitly undefined
  receives its default, or null;
* you may give, or omit, certain allowed-but-ignored extra props (the ones the factory controls),
  and those given must pass validation;
* the duckish validator strips those ignored props.

## Other credentials

| Name             | What it is                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **API key**      | A user's credential for some other service, and the usual thing in a whisper. safebyok never names or inspects it.      |
| **access token** | Your app's own login credential, which your storage adapter may send to your backend. It never goes into a vault.       |

## Words between Coach and agent

* **fingerpaint.** Comments or edits a Coach leaves in a code file to show a change they want,
  rather than make it. Where the intent is clear, carry it out, and take the fingerpaint away
  with the change. A question inside one is an `#earnest-question`, not a directive: give your answer and
  recommendation. If you reach a confident conclusion of your own that relates to work under way, act on
  it in the same turn: add it to the plan, or include it in that turn's work.

## Verbs, by how precise they are

Use these. Each names one thing:

* **return**: from a function.
* **commit**: a transaction.
* **abort**: a controller.
* **resolve**, **fulfill**, **reject**, **settle**: promises.

Avoid these. Each means several things:

* **hold**: wait, adopt, enlist or attach. For what a thing contains, say has, contains or stored, or use the possessive ("this proving's wayin").
* **take**: enlist, adopt, get or peek.
* **store**: put, stow or storage.
* **save**: put or stow.
* **complete**: full, whole, or one of the other verbs.
* **raise**: deprecated. Say increment, throw or start.

Use these only where the precise word does not apply:

* **finish**, **finalize**: dismiss, return, conclude.
* **apply**: put, stow, commit, write.
* **edit**, **update**, **add**, **insert**, **create**: to make clear what kind of put.
* **bump**: increment.
* **evict**: revoke, forget, detach, vacate, sweep.
* **start**: construct, make, build.
* **arrive**: adopt, receive.
* **send**: deliver, notify, put.
* **modify**: del, put, update, adopt, deliver.

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
* **KEK, DEK, KDF, AAD.** They appear above only so a security reviewer can map safebyok's names
  onto the usual ones. Nothing in safebyok's API asks you to learn them.

Stored records spell every name in underbar_case: `whisper_ciphered`, `key_deriver_label`.

The names the reform of October 2026 retired, and the old design's names the new core does not
have, are in `notes/old_vocabulary.md`, for reading older code and records. Nothing in the core
uses them.
