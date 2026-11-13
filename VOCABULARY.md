# Vocabulary

safebyok names each thing once, in plain words, and uses that one name in its API, its docs, its
stored records and its code. This page is the cast. You don't need to know any cryptography to
use safebyok. If you do, the *Standard term* column gives the usual term.

## What you handle

| Name           | What it is                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **whisper**    | The secret you put in a box. It is always a plain JSON object, such as `{ apiKey }` or `{ apiKey, orgId }`. safebyok never looks inside it.                                                                  |
| **box**        | Contains one encrypted whisper, together with its `boxlabel` and a sidecar your UI may show while the vault is locked. It is a `Box` in code. Its stored form is its record, a `BoxRecord`. |
| **vault**      | One user's set of boxes, named by the signed-in user's `user_id`, your app's `banklabel` and its own `vaultlabel`. The **Vault object** (`Vault`) represents one life of the vault in this tab, for as long as the bank has it enlisted. `bank.ensureVault({ vaultlabel })` returns the Vault object the bank lists for that scope. If no vault is stored, it puts one, asking nobody; the bank must be unlocked. `vault.beginWatch()` lists the vault's boxes and starts watching them. The only absent vault a Vault object can represent is a deleted one: it adopts the tombstone, keeps its slot in the bank's listing, and refuses every call. A newer life of that scope replaces it, and a vacate disables it at once. A Vault object that has been replaced or vacated is discarded for good, and refuses every later call. The bank enlists a new Vault object for the next life. |
| **bank**       | The signed-in user's vaults in the app, one Vault object per scope, and what they share (`Bank`). They share the key deriver, the strength checker, the bankDB and deviceDB, the limits, `requestCleartext` and `onBadNews`. There is one bank per signed-in user, and its scope is `{ user_id, banklabel }` (`BankScope`). Its device makes it at `device.ensureBank()`, which lists the vaults stored for the bank, and lets it go at a sweep or a vacate. `bank.ensureVault({ vaultlabel })` returns the vault the bank lists for that scope, or builds one. |
| **device**     | The signed-in user's presence on this browser for one bank scope (`Device`). It holds the host's options and functions, the one gating open, and the lifecycle and its end. `Device.make(opts)` checks its options and does nothing else. `device.ensureBank()` asks the deviceDB for this device's row, loads the libraries the vaults share, and brings up its bank. `device.sweep()` ends it while the page lives, and `device.vacate()` ends it at sign-out, forgetting this bank scope's cached leases and device row. A device that has ended is disabled for good. |
| **passphrase** | The secret the user types to unlock their vault. It is not their login password. safebyok never writes it or sends it anywhere. A vault has exactly one, its passphrase wayin. A `replace_passphrase` gating replaces it, and leaves the passkey wayin as it was. |
| **passkey**    | The credential the user unlocks with instead of typing, using a fingerprint, a face, a phone or a security key. It is a WebAuthn credential, and its authenticator produces the secret bytes for the vault through the PRF extension. safebyok never has the passkey's own secret. The authenticator has it, and responds only after the user's fingerprint, face or PIN. A vault has at most one, its passkey wayin, which always exists alongside the passphrase wayin it was added under. An `add_passkey` gating adds it. `addPasskeyPrompt()` refuses while this vault's gate already has one. A `revoke_passkey` gating removes it. |
| **wayin**      | One way into a vault: its passphrase or its passkey, as the vault records it (`Wayin`). Each has a `wayinkind` (`passphrase` or `passkey`; `Wayinkind`). Each also has its `registered_at`, and the `device_tok` of the device that built it. A passkey's wayin also has the `credential_id` and `prf_salt_b64` needed to ask the passkey. A vault has exactly one passphrase wayin and at most one passkey wayin. They are kept in its bank's gate row, under `main` and `passkey0`. A wayin's **header** (`WayinHeader`) is every field of it except its bankKeyWayinWrapped. Every change to the wayins requires the current passphrase. *Encrypted forms* describes how a wayin is stored. |
| **cleartext**  | The secret the user gives a gating to prove that a wayin is theirs: a passphrase, as the text they typed, or a passkey answer (`PasskeyAnswer`). Only a gating's attempt accepts it, and no vault call does. It can unlock as much as the wayin it belongs to, so the attempt turns it into a proving and then discards it. The attempt also zeroes a passkey answer's bytes. In text the user sees, it is called "Vault unlocker" (the Coach, 2026-10-24): any user-facing text that names the passphrase and passkey together says "Vault unlocker". The code keeps `cleartext`. |
| **gating**     | A single request for cleartext (`Gating`), launched by a call that needs the user. `device.ensureBank()` launches one for a bank not yet stored. `bank.ensureUnlocked()` launches one on a locked bank, after it tries the cached lease. `bank.delPrompt()` and the main gate's `replacePassphrasePrompt()`, `addPasskeyPrompt()` and `revokePasskeyPrompt()` each launch one; `bank.ensureVault()` and `vault.del()` ask nobody. The device passes it to the host's **requestCleartext** (`RequestCleartext`), which is the only place where UI meets the vault. It is a union discriminated by its **gatingkind** (`Gatingkind`): `build_bank`, `unlock_bank`, `replace_passphrase`, `add_passkey`, `revoke_passkey` or `del_bank`. Each kind has one attempt, typed for that kind, along with `dismiss()` and `whenConcluded`. An attempt runs its kind's whole chain. Only one gating is open per device at a time, and a second call that needs the user while one is open refuses. A gating that has concluded has **landed**, and any later attempt on it refuses. |
| **proving**    | Cleartext turned into a wayinKey for one gating (`PassphraseProving`, `PasskeyProving`). It is built from a wayin's header: either the current wayin's header, to prove the vault's current gate, or a fresh header, which becomes a new wayin. Its wayinKey is non-extractable. It builds wayins (`proving.buildWayin()`) and leases (`proving.buildLease()`), wrapping and unwrapping the bankKey privately to do so. It never gives a bankKey to its caller. It lasts only as long as its gating. |
| **gate**       | A bank's wayins, as one revision of its gate row: its passphrase wayin (`main`) and its passkey wayin (`passkey0`) if it has one (`Gate`). A `Gate` is a read-only value, of the bank whose stamp it holds. A gating's chain builds the next gate's wayins from the current one, and one conditional gate verb of the bankDB puts it. A gate verb changes the row's revision and nothing else of its stamp: its `gate_tok` stays. The first gate is put with its bank by `buildBank` (`Gate.make`). Every live bank has its gate. |
| **passkey answer** | The response a passkey gives when it is asked for its vault (`PasskeyAnswer`, kept as a `passkeyClear`): the credential's id, the salt it was asked with, and 32 secret bytes. The host gets one from `safebyok-react`'s `createPasskey` or `askPasskey`, and passes it to a gating's attempt. The attempt turns it into a passkey **proving** (`PasskeyProving`) and zeroes its bytes. |
| **lease**      | A grant that lets this device unlock again for a while without asking the user (`Lease`). A gating's proving builds it (`proving.buildLease()`). `ensureUnlocked()` attaches the lease cached on this device (`Lease.buildFromCache`), whichever tab cached it. It has the leaseKey and the bankKeyLeaseWrapped, and never leaves the device. It lasts `leaseMillis` from its `proved_at`, which `autolockMinutes` sets. While the vault is unlocked, its lease is granted to the Vault object, which keeps it private: no getter exposes it. Boxes are sealed and unsealed with it (`lease.sealWith`, `lease.unsealWith`). Each of those calls unwraps the bankKey for its own use and does not keep it afterwards. An **evicted** lease (`lease.evict()`) drops its keys but leaves its cached row in place. A lock drops the lease and forgets its cached row. A vacate drops the keys and forgets the row. A lease that fails to unwrap refuses with `damaged_lease`; its vault then locks, and the lease is evicted. A cached lease past autolock is never attached, and its row stays until `bank.autolock()` or a lock forgets it. A cached lease cites the gate it was proved against. One from another life of the bank or of its gate, or from an earlier revision of the gate, is never attached. |

## Keys

safebyok has five keys. Each is a 256-bit AES-GCM key, named for what it belongs to. None ever
leaves the user's device unencrypted. There are no public or private keys: everything is symmetric.
(A passkey has a key pair of its own inside its authenticator. safebyok never uses it, only the PRF
answer the authenticator produces alongside it.)

| Name               | What it is                                                                                                                                                         | Standard term                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **passphraseKey**  | Made from a passphrase and its wayin's passphraseSalt by the key deriver. Its only job is to wrap the bankKey, as that wayin's wayinKey.                          | passphrase-derived KEK              |
| **passkeyKey**     | Made from a passkey's PRF answer by HKDF-SHA256. The HKDF `info` is the ctx that its wrap is bound to: the bank, the gate, the purpose and the wayin. Its only job is to wrap the bankKey, as that wayin's wayinKey. | PRF-derived KEK                     |
| **wayinKey**       | Not a sixth key: the passphraseKey or passkeyKey of one wayin, named for its role once it acts on the bankKey. The code that makes it keeps the specific name. The code that wraps and unwraps the bankKey calls it the wayinKey, and does not need to know which kind of wayin made it. | KEK                                 |
| **bankKey**        | The bank's random master key. It wraps every boxKey. It stays the same when a wayin is added, revoked or replaced, so none of those rewrites a box. Nothing replaces it, because rotation is not built yet. | key-encryption key (KEK)            |
| **boxKey**         | A random key for one box, made fresh every time a box is sealed. It ciphers that box's whisper.                                                                 | data-encryption key (DEK)           |
| **leaseKey**       | Kept in this browser, which cannot export it. It wraps a copy of the bankKey so that a lease can unlock without asking. It contains nothing about the device itself. | non-extractable, device-bound KEK |

Which key wraps or ciphers which:

```text
passphrase + passphraseSalt ──key deriver──> passphraseKey      one per passphrase wayin
passkey + prfSalt ──PRF, then HKDF──> passkeyKey                  one per passkey wayin

wayinKey    wraps    bankKey     →  bankKeyWayinWrapped    one per wayin, synced to every device
leaseKey    wraps    bankKey     →  bankKeyLeaseWrapped    this device only
bankKey     wraps    boxKey      →  boxKeyWrapped          one per box
boxKey      ciphers  whisper     →  whisperCiphered        one per box
```

## Encrypted forms

A key that has been encrypted is **Wrapped**. A whisper that has been encrypted is **Ciphered**.
A box whose whisper is ciphered and whose boxKey is wrapped is **sealed**. Each verb has its
reverse:

* **wrap** and **unwrap** act on a key: a proving wraps the bankKey under its wayinKey, and a
  lease unwraps it from under the leaseKey.
* **cipher** and **decipher** act on a whisper's serialized bytes: they become a ciphertext bound
  to the box's visible fields, and back.
* **seal** and **unseal** act on a box. Sealing makes a fresh boxKey, ciphers the whisper under
  it, and wraps the boxKey under the bankKey, each bound to the box's stamp and its vault's. The lease seals
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
| **boxKeyWrapped**             | The boxKey, wrapped under the bankKey: a box's `box_key_wrapped`, stored beside its whisperCiphered. | wrapped DEK         |
| **bankKeyWayinWrapped**       | The bankKey, wrapped under one wayin's wayinKey: that wayin's `bank_key_wayin_wrapped`. Your storage syncs it to every device. | wrapped KEK |
| **wayin**, as stored          | A wayin as it is stored in the bank's gate row (`GateRecord`), in its `wayins` (`Wayins`): the passphrase wayin under `main`, and the passkey wayin, if any, under `passkey0`, each naming its place in its `wayinlabel`. It is a `PassphraseWayinRecord` or a `PasskeyWayinRecord` (`WayinRecord`), distinguished by `wayinkind`. It has the visible fields its kind needs: a passphrase's `key_deriver_label` and `salt_b64`, or a passkey's `credential_id` and `prf_salt_b64`. It also has its bankKeyWayinWrapped, its `registered_at`, and the `device_tok` of the device that built it. Both wayins wrap the same bankKey. | key slot |
| **bankKeyLeaseWrapped**       | The bankKey, wrapped under the leaseKey: a lease's `bank_key_lease_wrapped`. It never leaves this device. | device-wrapped KEK  |

## Ingredients and contexts

None of these is secret. Each is stored in the clear or rebuilt when needed. If any one is wrong or
has been tampered with, decryption fails.

| Name                     | What it is                                                                                                                                                           | Standard term        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **passphraseSalt**       | Random bytes given to the key deriver along with the passphrase (`salt_b64`): 16 of them under the supplied keyDeriverSpec. Each passphrase wayin has its own, never shared. It is replaced whenever that passphrase changes. | salt                 |
| **prfSalt**              | 32 random bytes that a passkey's authenticator is asked to evaluate its PRF on (`prf_salt_b64`). Each passkey wayin has its own, made fresh when the passkey is added. It is visible. The authenticator's answer to it is the secret. | PRF salt, hmac-secret salt |
| **keyDeriverSpec**       | The recipe that turns a passphrase into the passphraseKey: Argon2id's parameters under a keyDeriverLabel. safebyok supplies one, `Argon2idWebV1`: 64 MiB of memory, 3 passes, 1 lane, a 16-byte salt and a 32-byte result. A host may choose its own. | KDF parameters       |
| **keyDeriverLabel**      | The keyDeriverSpec's name (`argon2id_web_v1` for the supplied one). Each passphrase wayin records it, so the vault records how its passphraseKey was made. A label always means the same parameters. Labels beginning `argon2id_web_` are reserved for the specs safebyok supplies. | KDF identifier       |
| **key deriver**          | The function that makes the passphraseKey, following a keyDeriverSpec: `argon2idWebV1Deriver` for the supplied spec, `makeArgon2idDeriver(spec)` for a host's own. A deriver that uses a supplied spec's label must have that spec's parameters, or it is refused. | KDF                  |
| **cipherIv**             | 12 random bytes, fresh for every encryption, stored beside their ciphertext.                                                                                          | IV, nonce            |
| **ctx**                  | The context that an encryption is bound to. The encryption's tag proves that the context is unchanged. A ctx consists of the **stamp** of the thing it seals or wraps, and its purpose, which names the field. A wayin's ctx (`wayinCtxOf`) has its bank's stamp (`BankStamp`), its gate's (`GateStamp`) and the wayin's header. A box's ctx has its bank's stamp, its vault's (`VaultStamp`) and the box's own. A lease's ctx has its bank's stamp and the lease's own (`LeaseStamp`). `cipherCtx(stamps, purpose, header)` makes one. It takes a list of stamps because a thing binds the stamp of whatever contains it as well as its own. Every function that ciphers or wraps takes it as `ctx`. It is rebuilt when needed rather than stored. So ciphertext copied anywhere else, or kept under an altered field, will not decipher or unwrap. | associated data (AAD) |
| **ciphertext**           | The encrypted bytes, with their authentication tag on the end.                                                                                                       | ciphertext           |
| **vaultTok**             | A random token that changes on every life of the vault (`vault_tok`). It is minted when the vault is made for its scope, and never changes within that life. The scope identifies the vault. The token distinguishes one **life** of that scope from the next, so a vault that was deleted and made again is never mistaken for the old one. Every ctx binds it. Every bankDB call on a box checks it against the stored vault row. A live vault under the same scope with a different `vault_tok` is a new life, and a call made with the old token refuses. | --                   |
| **boxTok**               | A random token that changes on every life of a box under its boxlabel (`box_tok`). It is minted when the box is first made, and every later revision in that life keeps it. A box's life is identified by its vault's token and its own, `vault_tok` and `box_tok`. So a box that was deleted and made again elsewhere can be distinguished from the one this device had. vaultTok and boxTok are the **life toks**, made by `makeLifeTok`. | --                   |
| **bankTok**              | A random token that changes on every life of a bank under its banklabel (`bank_tok`). `buildBank` mints it, and `delBank` leaves the bank's tombstone under a new one. A gate row, a vault row and a box row carry the `bank_tok` of the bank life they belong to, and one under another bank's `bank_tok` is of an ended life: it counts as no row. A box row's life is its `bank_tok` and `vault_tok` together, `${bank_tok}/${vault_tok}`, and must be its vault row's. | -- |
| **gateTok**              | A random token for one life of a gate under its gatelabel (`gate_tok`). It is minted when its bank is built, and every gate verb keeps it. | -- |
| **revisionTok**          | A fresh token for each put or del of a record, vault or box (`revision_tok`). Its `revision_seq` counts up alongside it, and a higher seq is newer. Both are part of the box's stamp. Storage refuses a put made from a stale fetch (`stale_write`).              | version, CAS token   |
| **gateRevisionTok**      | The `revision_tok` of the gate row a lease was proved against, as the lease cites it (`gate_revision_tok`). Every gate verb puts a new revision, so a lease proved before it is never attached again, and the user is asked. | key epoch            |
| **deviceTok**            | A random token for this device in a bank's scope (`device_tok`), a UUID such as the one `crypto.randomUUID()` makes. The device asks the deviceDB for it at `device.ensureBank()`: `deviceDB.ensureCachedDevice` mints one per bank scope and keeps it in the deviceDB's device row, and it is a new token after that row is forgotten. The bank has it as `bank.device_tok`. Each wayin records the deviceTok of the device that built it, visible in storage. A deviceDB of your own should mint a random token: one derived from anything about the device would link records that the vault itself does not link. The `user_id` is provided in the options. If the `user_id` contains sensitive data please hash it first: `user_id: await mash(email)`. | installation id (scoped), device id |
| **mash**                 | The SHA-256 of a text as 43 characters of unpadded base64url (`mash(text)`), the same encoding as every stored `_b64` field. It is a one-way substitute for an id a host would rather not hand over. Mashing an email hashes it, unsalted. It is exported from `safebyok/utils`, which has the small helpers for the app around a vault. | hash |
| **mask**                 | The outline of a secret text that is safe to show (`mask(whisper.apiKey)`): a few characters from each end with stars between, as one plain line for a log or a reminder, so a UI can tell which API key a box has without revealing it. It is not a faithful copy: marks, invisible characters, bidirectional controls and spaces are dropped, though right-to-left letters are kept and may reorder their neighbours in a display. It is intended for plain text; arbitrary blobs may give unusual behavior. Stripping every mark removes the vowels of scripts that write vowels as marks (Hindi `नमस्ते` comes out as `नमसत`); an API key is ASCII, and is untouched. Its result is public: it gives away the text's ends and, up to `maxLen`, its length. `mask(text, { head: 0, tail: 0 })` shows only the length. It is exported from `safebyok/utils`. | redact |

**An `_id` is a hard identifier. A `_tok` is only compared.** A stored field ending `_id` names one
thing permanently, and a record is looked up by it (the `credential_id` and `user_id` that come
from outside). A random token that is checked, and never used to look anything up, is a `_tok`. It
changes on every life of the thing it marks. `revision_tok` changes on every put or del of a record.
`vault_tok` changes on every life of a vault in its scope. `box_tok` changes on every life of a box
under its boxlabel. `device_tok` changes on every life of a device's row in a bank scope. In code
they are `vaultTok`, `boxTok`, `revisionTok` and `deviceTok`.

**The stamp** is the set of fields that a thing's ctx binds its ciphertext to, so that the
ciphertext deciphers only as part of that thing. A bank's stamp is fixed for its life. `BankStamp`
is the bank's scope, `bank_tok` and `registered_at`. A gate's stamp is fixed for its life too, since
a gate verb changes only its revision. `GateStamp` is the gate's scope with its `gatelabel`, its
`gate_tok` and `registered_at`. A vault's stamp is fixed for its life. `VaultStamp` is the vault's
scope, `vault_tok` and `registered_at`. A lease's stamp is fixed for the lease. `LeaseStamp` is its
`fmt`, its bank's stamp, its **citations** of the gate it was proved against (`gatelabel`,
`gate_tok` and `gate_revision_tok`), `proved_at` and `wayinkind`: all of the lease record except its
key material. A box's stamp is not fixed for its life. It is every
sparse field of the single revision it seals, including `revision_tok`, `revision_seq` and
`written_at`, and never its sidecar. So a whisper deciphers only within the exact revision it was sealed in, and a
record that storage has spliced together from different revisions does not decipher at all. That is
why every edit of a box seals it again. No code moves a sealed box to another revision without
sealing it again. A thing binds its own stamp and the stamps of whatever contains it. A bank's, a
gate's and a vault's stamps have no `fmt`, so what they contain still unseals and unwraps under a
new format of theirs. Say
"stamp" for the bound fields, never "the binding" or "the authentics".

## Names, records and times

The names that address a vault, the records that are stored, and the times they carry. A label
(`label`) is lowercase words of letters and digits joined by single underscores, such as
`anthropic_api_key`. It starts with a letter, and is 2 to 40 characters long (`Patterns.label`,
`MaxLabelChars`). The name rules are the package's own. A host never checks a name against a rule of
its own: it percent-encodes (RFC 3986) any name that falls outside the package's rules.

| Name                            | What it is                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **user_id**                     | The signed-in user's stable, opaque id from your own auth. It is the only name in a scope that is not a label: 1 to 100 ASCII letters, digits and `-_.~:@+\|%`, never dots alone (`Patterns.user_id`, `MaxUserIdChars`). It is never an email or a handle, which can change. It is spelled `user_id` everywhere: in an option, in a prop and in storage. |
| **banklabel**                   | Your app's own label, so several apps can share one backend without colliding. With the `user_id` it names a bank. It is stored as `banklabel`.                             |
| **vaultlabel**                  | The label of one of a user's vaults, such as `main`. It is stored as `vaultlabel`.                                                                                          |
| **boxlabel**                    | The label of a box within its vault: what you pass to `putBox`, `getBox`, `fetchBox` and `delBox`. It is stored as `boxlabel`.                                                 |
| **scope**                       | A user_id, a banklabel and a vaultlabel together: it names one vault (`VaultScope`).                                                                                         |
| **visible**                     | Said of a stored field that is both unencrypted and authenticated. A visible field is in a stamp, or a wayin's header, that a ctx binds. A change to it in storage makes the record refuse to unseal or unwrap. Anyone who can read the database can read it. Visible fields are the bank's, the gate's and the vault's stamps (each its scope, its token and its `registered_at`), every sparse field of a box, and each wayin's header. A wayin's header is its `wayinkind`, `wayinlabel`, `key_deriver_label` or `credential_id`, salt, `device_tok` and `registered_at`. Every field of a box or a wayin is visible except the encrypted ones and a box's sidecar. A visible field is never secret. Say "visible" only of a field that is authenticated. Say "visible in storage" where a sentence could be read as screen visibility. |
| **unencrypted**                 | Said of a stored field that is not encrypted, and nothing more: it may be authenticated or it may not. The `fmt`, revision fields, `written_at` and `am` of a vault record and of a gate row are unencrypted. No wayin's ctx binds them, so a gate verb leaves every wayin as it was. A box's sidecar is unencrypted: no ctx binds it. Whether its gate has a passkey wayin is unencrypted too. Say "unencrypted" in a record-general or backend-general sentence ("ciphertext and unencrypted fields"). Say "visible" of a field known to be authenticated. |
| **sidecar**                     | Your app's own data, stored alongside a box's whisper (`sidecar` at `putBox()` and in the snapshot; `Sidecar`). Its trust class is **unencrypted**, not visible (see those entries): it is not in the box's stamp, so storage may change it and the box still unseals, and the snapshot always shows it as it is stored. Anyone who can read the database can read it. A field that must be read in storage but not changed there unnoticed goes in the whisper too, and the app compares the two once the box is unsealed. It is a JSON object of any JSON values. It is for what an app wants to search server-side, or to show while the vault is locked. Examples are a team, a rotation reminder, or a count of the calls the app made to OpenRouter with this whisper. It is never secret material. safebyok never looks inside it, and your app checks its shape. It is stored as the JSON object it is (`sidecar`; a `jsonb` column on Postgres). It is always written (`{}` when there is none). It counts with the whisper toward what storage allows in one record (`box_too_large`). |
| **whisper codec**, **whisper schema version** | The encoding that turns a box's whisper into bytes before it is ciphered, and the version number of the whisper's own shape. `whisper_codec` is `json_v1`: its JSON with ckeys sorted, as UTF-8. `whisper_schema_version` is 1. Both are stored, and both are in the box's stamp. Neither can be set by a caller yet. |
| **damaged**                     | Said of a stored row that fails its checks when it is read from storage. Such a row refuses with `damaged_row`, and its listing sets it aside. A damaged row never indicates format drift: it is thrown by the bankDB tied to the datastore. What is set aside is the row's scope, its `vault_tok` if it is a box, and `am` `d`; nothing else is read from a row that failed. A vault's fetch lists its damaged box rows in `damaged_rows` (`DamagedBox`), never among its sound `boxes`, under whatever boxlabel storage has for them. A box stored under a name that the label rule refuses is listed there too. Nothing in the core interface deletes a damaged row: use such housekeeping calls as we offer, or access the datastore directly. A box that does not unseal under the bankKey, or that unseals to no whisper, refuses with `damaged_whisper`. The bank's fetch reports each damaged vault row as bad news. |
| **vault record**                | The single row per vault of a bank, which every device syncs (`VaultRecord`, `fmt` 6003). It has the vault's scope, its bank's `bank_tok`, its own `vault_tok`, `registered_at` and `written_at`, its revision (`revision_tok`, `revision_seq`) and its `am`. It holds nothing encrypted: the wayins are in its bank's gate row. Its `vault_tok` identifies its life permanently. It is random, and never reused. Its other shapes are `VaultSparse` (the same fields), `VaultStamp` (the stamp), `VaultScope`, and `VaultTombstone`, which is what `delVault` leaves. |
| **lease**, as cached            | The record a device caches so that it can unlock without asking (`LeaseRecord`, `fmt` 7003), one per bank scope. The vault it is granted to uses it as a `Lease`, built from the record. It has the leaseKey, the bankKeyLeaseWrapped and the lease's stamp: the bank's stamp, its citations of the gate it was proved against (`gatelabel`, `gate_tok`, `gate_revision_tok`), `proved_at` and `wayinkind`. It stays on the device. The deviceDB stows it (`stow`), returns it (`peek`) and forgets it (`forget`). Only `peek` returns a lease's leaseKey. Only a `Lease`, a proving and the deviceDB ever have the record. |
| **device row**                  | The deviceDB's row for a bank scope (`DeviceRow`): `{ user_id, banklabel, device_tok }`, one per bank scope, its `device_tok` a random UUID. `deviceDB.ensureCachedDevice({ user_id, banklabel })` returns it, making it on the first call, and the device asks for it at `device.ensureBank()`. `deviceDB.forgetDevice` forgets it, as a device's vacate does, so the next `ensureCachedDevice` mints another `device_tok`. It is not secret, and has no key. A row that fails its check is replaced with a new one. |
| **bank row**                    | The bankDB's row for a bank (`BankRecord`, `fmt` 3001): the bank's scope, its revision, its `am` and its `bank_tok`. It holds nothing encrypted. `buildBank` puts it with its gate row, and `delBank` leaves its tombstone (`BankTombstone`). A live bank row always has a live `main` gate row; one without is damaged. |
| **gate row**                    | The bankDB's row for a bank's gate (`GateRecord`, `fmt` 4001): its scope with its `gatelabel`, its revision, the `bank_tok` of its bank, its `gate_tok`, its `wayins`, and the bags `auth`, `sigs` and `meta`, which are always empty. A gate row is always live: it is put with its bank and deleted with it, and leaves no tombstone. A gate verb changes it alone. |
| **gatelabel**                   | The label of one of a bank's gates. A bank has exactly one, `main`. It is stored as `gatelabel`. |
| **wayinlabel**                  | The label of one of a gate's wayins, and its ckey in the gate row's `wayins`: `main` for the passphrase wayin, `passkey0` for the passkey wayin. Each wayin also stores it as `wayinlabel`. |
| **locked**                      | Said of a Bank object with no lease granted (`bank.isLocked`, and its snapshot's `isLocked`); **unlocked**, of one with a lease granted. Its vaults and their boxes are locked and unlocked with it. A bank not yet stored has no Bank object, and its first gating is `build_bank`. |
| **timely**                      | Said of a thing whose local copy of its record was refreshed recently enough to trust (`isTimely`). The bank's `vaultRefreshMinutes` and `boxRefreshMinutes` set how recently, 5 minutes by default. A caller may name its own age (`maxMillisSinceRefresh`). `fetchBox` always refreshes. |
| **stage**                       | The device's point in its lifecycle, shown as its snapshot's `stage` (`DeviceStage`). It is `made` until a `device.ensureBank()` succeeds. It is `ready` once `ensureBank()` has loaded the libraries its vaults share and brought up its bank. It is `disabled` after a sweep or a vacate, and the snapshot's `err` says why: `disabled`, or the `identity_revoked` that vacated it. |
| **the bank's listing**          | The vaults the bank has enlisted (`bank.vaultListing`). A deleted vault stays in it until a newer life replaces it. The bank's snapshot lists the present ones as `vaults`, one `VaultSnapshot` each. `bank.vaultAt({ vaultlabel })` returns the Vault object listed for a scope, including a deleted one, or null. |
| **rotation**                    | Replacing the bankKey with a new one and sealing every box again under it, so that a wayin revoked beforehand unwraps nothing written afterwards. It is not built yet. When it is, it adds an epoch to the vault record, each wayin and each box, saying which bankKey each belongs to, with the format bumps that go with it (TODO.md, *Which wayins a rotation keeps*). Until then the bankKey never changes. A vault that is made again has a new vaultTok, which voids every box. |
| **get**, **put**, **del**       | The three verbs of the vault and the bankDB, each applied to the things it has. The vault has `getBox`, `putBox` and `delBox`. The bankDB has `getVault`, `putVault` and `delVault`, and `getBox`, `putBox` and `delBox`. `del` deletes permanently. The deleted thing leaves a tombstone of its sparse fields (`am` `x`), and its whisper or gate is removed. `del()` deletes the whole vault. The deviceDB's verbs for a lease are `stow`, `peek` and `forget`; the vault side says `cache` for `stow`. |
| **enlist**, **delist**, **listed** | A listing **enlists** an instance under its scope, once, and **delists** it when the instance is discarded. An instance that is enlisted and not yet delisted is **listed** (`AlreadyListed`). |
| **adopt**, **align**            | The two steps a storable takes with a record once `receive` has judged it: `adopt` assigns its props and private fields to the instance, and `align` remakes the snapshot and notifies the listeners. |
| **conclude**                    | A gating concludes once: it reports its final outcome, success or refusal, and does not change afterwards (`whenConcluded`). |
| **land**                        | An operation has landed when it and all its consequences are done: a lock, unlock, vacate, sweep or delete, with every prop aligned and the lease stowed or forgotten. A storage write that took effect is **written** (`Written`, `isWritten`), never landed. |
| **attach**, **detach**          | Set or unset an object's has-one instance property to an instance: a vault's lease is attached, and detached. |
| **increment**                   | Atomically increase an integer sequence value by exactly one, or by the given amount. |
| **revoke**                      | Detach a lease and forget it (`Lease.revoke`, `Vault.#revokeLease`). A lease attached to its vault is **granted**. Say **cached** only of the row on the device, and **granted** of the lease's life. |
| **storage**, **datastore**      | **Storage** is the database under a bankDB adapter. A **device database** is what the deviceDB is. Name the `BankDB` or `DeviceDB` where one is meant, and say **datastore** only where any of them is meant; `store` is not a noun here. |
| **ensure**                      | Return the thing if it is already there, or make it so and then return it, so that a second call costs nothing (`bank.ensureVault`, `bank.ensureUnlocked`). An `ensure` is the async third member of a check's triplet (STYLE.md, *Naming*). `isUnlocked` asks, `demandUnlocked` refuses, and `ensureUnlocked` makes it so. A function that only checks, and refuses, is a `check` or a `demand`. |
| **refuse**, **refusal**         | To refuse is to issue an error, by whichever means fits the context: throwing it, notifying of it, or returning it in an `Outcome` or an `Answer`. The **refusal** is the error issued, and its `refusalkind` says which. |
| **Outcome**                     | The result a non-throwing `try*` call resolves to (`Outcome<ValT>`): `{ ok: true, val }` on success, or `{ ok: false, err }`, where `err` is the refusal. |
| **Answer**                      | A bankDB verb's `Outcome`, with what storage reported beside it (`Answer`, `GoodAnswer`, `BadAnswer`): its `act`, `parent` and `dbhas` (see **act**). |
| **read**, **write**             | Umbrella words. To read is to view a thing: get, fetch, hydrate, list. To write is to modify it: put, update, create, insert, del, tombstone. Use one only where any of those is meant (`stale_write`, `written_at`, `#writeVaultRow` for a put or a del); otherwise name the call. Neither is a verb of the public API. |
| **bankDB**                      | The storage plug-in for a bank (`BankDB`): the bank row, its gate row, its vault rows and their box rows, ciphertext only. An adapter extends `AdapterBankDB` and implements its `do*` calls, one per verb, each fetching, judging and storing the whole verb in one step. The core supplies `MemoryBankDB`. Every answer carries its `parent`. |
| **ask**                         | What a bankDB verb is asked: one object, tagged by its `op` (`ensure`, `build`, `get`, `put`, `del`, `list` or `tidy_gone`), with the scope and, as the op needs, the policies (`ifAbsent`, `ifPresent`), the row it `expected` and the `record` it would store (`BankEnsureAsk`, `BankBuildAsk`, `GatePutAsk`, `BankDelAsk`, `VaultGetAsk` ... `BoxDelAsk`, `BoxListAsk`, `BoxTidyAsk`). An answer, and a refusal's `meta`, carry what may be logged of it (`LoggableAsk`): every field optional, a record cut to its revision and life tokens, never its payload. |
| **act**, **dbhas**              | The fields of a bankDB verb's answer beside its `val` (`GoodAnswer`, `BadAnswer`). The **act** says what happened (`notes/answer-contract.md`). A get's act is `gotlive`, `gotvoid` or `gotgone`; a list's is `got` or `gotvoid`. A put's is `born`, `reborn`, `replaced` or `passed`, and a del's is `deleted`. A refused put or del's act says why: `void`, `gone`, `camped`, `dubdel`, `stale`, `retcon`, `clash`, `forked` or `ahead`, and a box's `vault_void`, `vault_gone`, `vault_reborn` or `vault_full`, and a vault's or gate's `bank_void`, `bank_gone` or `bank_reborn`. **dbhas** is the stored row the call found where it was acting, or null if there was none. A refusal carries the same `parent` and `dbhas` (`rowsOfRefusal`), so an answer and an error are read the same way; its `meta` has the `act`, the `ask` and the `oplabel`, the verb that refused. |
| **parent**                      | The field of a bankDB answer that carries the row above the one asked for, or the shell for none: the bank row for a gate or vault verb, `ensureBank` and `buildBank`, and the vault row for a box verb. `delBank` answers none. |
| **buildBank**, **delBank**      | The bankDB verbs that make and end a life of a bank. `buildBank` puts the bank row and its `main` gate row in one step, over nothing (`born`) or the bank's tombstone (`reborn`); over a live bank it puts nothing and answers that bank (`passed`). `delBank` leaves the bank's tombstone and deletes every gate, vault and box row under its scope in the same step. |
| **bank_void**, **bank_gone**, **bank_reborn** | The acts a gate or vault verb refuses with when its bank row is not live in the life it cites: none is stored, a tombstone is stored, or a live bank of another `bank_tok` is. A box verb's are `vault_void`, `vault_gone` and `vault_reborn`. |
| **am**                          | The stored tag of a record's liveness (`am`). It is `a` for alive. It is `d` for damaged: the row failed its check, and its listing sets it aside in `damaged_rows`. It is `x` for gone, a tombstone. A tombstone never has `a`. |
| **camped**                      | The refusal of a put that was told not to replace (`ifPresent: 'fail'`) when a live record is already stored. It has the `parent`, and the `dbhas` that was already there. With `ifPresent: 'get'`, the put returns the `passed` act with the stored record instead. |
| **deviceDB**                    | The storage plug-in for this device's leases and device rows, one of each per bank scope (`DeviceDB`). The core supplies `MemoryDeviceDB`, and `IdbDeviceDB` for a browser. A lease goes through `stow`, `peek` and `forget`. `listLeases()` lists every cached lease, oldest first. Calls for one scope take effect in the order they were made. A device row goes through `ensureCachedDevice` and `forgetDevice`. |
| **pantry**                      | The part of this device's database for what the vault may use but never see: its keys, kept as WebCrypto handles that the page cannot export. It has the leaseKey and the bankKey wrapped under it, together as the lease. An operation with these keys runs inside the browser's keystore and returns its result, never the key's bytes. Unwrapping the bankKey from a lease, wrapping or unwrapping a boxKey, and ciphering a whisper are such operations. The `Lease` has such a handle in a field. A proving has its wayinKey only for the duration of its gating. The rest of the vault asks the `Lease` or the proving to do the work, and no other class sees a key. The deviceDB reaches the pantry, through IndexedDB where a browser stores it. Nothing in the pantry can unlock the vault on another device. |
| **registered_at**, **written_at** | `registered_at` is when this life of a record began: the `written_at` of the put that made it, or remade it over a tombstone. Every later revision of that life keeps it. `written_at` is when the record was last written, by any put, whether or not its whisper changed. On a tombstone it is when the record was deleted. A vault record and a box each have both. Each wayin has a `registered_at`, when it was added. They are spelled this way in both storage and code. |
| **proved_at**                   | When a gating's proving built a lease, spelled this way on the lease. A cached lease is past autolock once more than `leaseMillis` has passed since its `proved_at`. Then it is never attached again. |
| **autolockMinutes**             | The `Device.make` option for how long a lease lasts after its proving, in minutes. The default is 14 days (`DefaultLeaseMillis`), and `Infinity` means until it is locked. The device reports it as `autolockMinutes`, and its bank passes it to its vaults as `leaseMillis`. `bank.autolock()` locks each listed vault whose cached lease is past it. The host calls it after `ensureBank()` and on its own timer. |
| **strengthChecker**      | The `Device.make` option that checks each new passphrase before it becomes a wayin (`StrengthChecker`). It checks the passphrase a vault is built with and each replacement, never one typed to unlock. It returns a verdict (`PassphraseVerdict`): `{ strong: true }` or `{ strong: false, reason }`. A weak passphrase is refused as `weak_passphrase`. The verdict's `reason` is the refusal's message. Anything the checker throws is replaced by a refusal. Its optional `load` runs at each device's `ensureBank()`. The option itself is optional. If it is left out, `DefaultStrengthChecker` is used, which refuses every new passphrase as too weak. Its refusal's message says a checker must be chosen (`notes/configuration.md`). |
| **EpochMillis**                 | Every time value in safebyok: whole UTC milliseconds since 1970, from `FarPast` (1981) to `FarFuture` (2255). The bounds catch seconds and microseconds passed by mistake.      |
| **fmt**                         | The number at the start of every stored record, which identifies its format: `6002` for a vault (`VaultFormat`), `5002` for a box (`BoxFormat`), `7003` for a lease (`LeaseFormat`). A box's stamp has its `fmt`, and a lease's stamp has the lease's. A box binds its bank's and its vault's stamps, and a lease its bank's, none of which has a `fmt`, so a new bank or vault format still unseals them. Any change to what a record may contain gives it a new format number. |
| **scopepath**                   | The kind of a thing, then its scope's names in order, joined on `^`, which no name may contain: `vault^u1^acme^main`, `box^u1^acme^main^anthropic`. A listing finds each thing it has by its scopepath. |
| **ckey**                        | A generic map key: an entry's name in a map, or an index in an array. It is never a storage address, which is a scopepath. |
| **logger**                      | An option your app may pass to `Device.make` (`VaultLogger`). The vault reports to it whatever it has no caller to throw to. |
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
| **stamp**     | The fields bound into a thing's cryptography (`BankStamp`, `GateStamp`, `VaultStamp`, `LeaseStamp`; see *The stamp*, above). A bank's, a gate's, a vault's and a lease's are fixed for the thing's life. A box's is the single revision it seals. |
| **scope**     | The composite id: the names its scopepath is made of (`VaultScope`, `BankScope`, and `Boxscope`, the only one that smushes its two words).                                     |
| **dna**       | A type's required and optional props, plus the props the factory controls, which are accepted and ignored. It is what a caller passes to `create`. Its validator is the type's duckish, described below. |
| **tombstone** | The record a deletion leaves behind (`VaultTombstone`, `BoxTombstone`).                                                                                                                  |
| **void**      | An item that is missing altogether, rather than tombstoned; a vacant row. |
| **shell**     | The tombstone that stands for a void row, never stored: its revision is seq -1 under the void tokens (`shellVaultOf`, `shellBoxOf`). A request that expects no row cites the shell. |
| **dated**     | A row's scope, the token of its life and the time it is judged by, without the rest of the row. For a cached lease these are its bank's scope, `bank_tok` and `proved_at` (`LeaseDated`), and this is the shape the deviceDB's `listLeases` returns. |
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
* **slot**: the scope a thing is listed at (scopepath for its address), or a propname, fieldname,
  methodname, foolabel, fookind or fooTag.

## Words safebyok does not use

* **key, alone.** A key is always one of the five above, by name, or a wayinKey. An entry's name
  in a map is a `ckey`. A storage address is a scopepath.
* **data, contents, payload.** The secret is a whisper. Encrypted, it is a whisperCiphered.
* **open, as a verb on a key, a whisper or a box.** Name the operation instead. A key is
  unwrapped (`unwrap`). A whisper is deciphered (`decipher`). A box is unsealed (`unseal`). A
  whisper is taken out of its box by `extract`. A sentence the user sees may still say "open".
* **unlock, as a noun.** A way in is a wayin. A device caches a lease. `ensureUnlocked()`
  is the verb, and `unlock_bank` the gating.
* **proof; ask, for the request for cleartext.** The user hands in cleartext. Made into a key,
  it is a proving. The request for it is a gating. An ask is what a bankDB verb is asked.
* **device key.** The key behind a lease is the leaseKey.
* **public, plain, server-readable, of a stored field.** A field is visible (unencrypted and
  authenticated) or unencrypted (and possibly not authenticated). There are no public keys here.
* **KEK, DEK, KDF, AAD.** They appear above only so a security reviewer can map safebyok's names
  onto the usual ones. Nothing in safebyok's API asks you to learn them.

Stored records spell every name in underbar_case: `whisper_ciphered`, `key_deriver_label`.

The names the reform of October 2026 retired, and the old design's names the new core does not
have, are in `notes/old_vocabulary.md`, for reading older code and records. Nothing in the core
uses them.
