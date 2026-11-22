# Vocabulary

safebyok names each thing once, in plain words, and uses that one name in its API, its docs, its
stored records and its code. This page is the cast. You don't need to know any cryptography to
use safebyok. If you do, the *Standard term* column gives the usual term.

## What you handle

| Name           | What it is                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **whisper**    | The secret you put in a box. It is always a plain JSON object, such as `{ apiKey }` or `{ apiKey, orgId }`. safebyok never looks inside it.                                                                  |
| **box**        | Contains one encrypted whisper, together with its `boxlabel` and a sidecar your UI may show while the bank is locked. It is a `Box` in code. Its stored form is its record, a `BoxRecord`. |
| **vault**      | The customer-facing surface for `safebyok`. Offers high-level functions for put/get/del/list of Things, executed using the caching datastore (Minder and its VaultDB). One per bank. |
| **bank**       | Manages a session: orchestrates all gating events, connects or constructs the session actors (Minder, Vault, VaultDB, etc.). Lifecycle verbs (sweep/lock/vacate/delete) start here (or as sugar on the device) and propagate outward. Every `this.isEnabled`/`isLocked`/etc. is, or `&&`s with, `bank.isEnabled`/`isLocked`/etc. Due to its central role, it is also the internal interface surface for many concerns. |
| **device**     | Factory for `Bank`. Exists before its user signs in, and lasts through that user's session: while all other actors leave after a stage change (vacate/sweep/etc.), the device serves verbs and state that are "always there". |
| **passphrase** | Secret entered by the user to unlock their bank; distinct from any login password on the host. Never exposed outside the handoff from host to cloak. |
| **passkey**    | WebAuthn credential generated following a click gesture on an enabled device. |
| **wayin**      | Carries the wrapped keys required to prove its single secret: either a passkey or a passphrase (`Wayin`). A proving uses the data from a wayin to produce a `Lease`, or to prove authority to add or edit a wayin. |
| **cleartext**  | Any data, text or object, that is secret or contains a secret: a passphrase as typed, a passkey answer (`PasskeyAnswer`), an unsealed whisper (`BoxCleartexts`). Include `cleartext` in the name wherever reasonable: `passphraseCleartext`. Only a cloak, or a Proving, Gating or Lease method (or private Friend methods), should see cleartext. |
| **gating**     | Method to supervise the process of either birthing, changing, unlocking or deleting an authentication method (a gate and its wayins). A gating either proves its cleartexts and makes its change or refuses and changes nothing; in every case, zeroes PRF and cloak and other byte arrays. |
| **proving**    | Cleartext turned into a wayinKey for one gating (`PassphraseProving`, `PasskeyProving`). It is built from a wayin's header: either the current wayin's header, to prove the bank's current gate, or a fresh header, which becomes a new wayin. Its wayinKey is non-extractable. It builds wayins (`proving.buildWayin()`) and leases (`proving.buildLease()`), wrapping and unwrapping the bankKey privately to do so. It never gives a bankKey to its caller. It lasts only as long as its gating. |
| **gate**       | Superintends gating for its bank: manages associated wayins and their metadata, makes the gatings that prove against them, and holds the lease they grant. |
| **passkey answer** | The salt, secret and credential id of a passkey. |
| **cloak**      | Securely envelops cleartext in zeroable private variables, hiding it from casual devtools use. A gating cloaks the cleartexts it is made with. |
| **lease**      | A grant that lets this device seal and unseal under its bank's key for a while without asking the user (`Lease`). There is one per bank, never one per vault. A gating's proving builds it (`proving.buildLease()`) and grants it to the bank's gate (the `Gate` object), which keeps it private: no getter exposes it. It has the leaseKey and the bankKeyLeaseWrapped, and lives only in memory: nothing caches it, so a new page asks the user again. It cites the revision of the gate it was proved against, so the device that runs a gate verb (a new passphrase, a passkey added or revoked) is granted a lease citing the new revision. A proving while a lease is granted renews it, and the new lease keeps the old one's `born_at`. It ends `leaseMillis` after its `proved_at`, which `autolockMinutes` sets, and the bank's snapshot says when (`leaseEndsAt`). Boxes are sealed and unsealed with it (`lease.seal`, `lease.unseal`). Each of those calls unwraps the bankKey for its own use and does not keep it afterwards. An **evicted** lease (`lease.evict()`) drops its keys, as a lock or a sweep of its gate does. A lease that fails to unwrap refuses with `damaged_lease`; its gate, and so its bank, then locks. |
| **sealer**     | What a lease seals one kind of record through, so the lease knows nothing of the record (`Sealer`; the box's is the class `BaseBox`). It says which fields a seal binds (its `stampOf`), what it takes from a sealable and from the public and secret props, how its cleartexts are encoded, and what a tombstone seals. In the new core only; safebyok-big's lease seals boxes itself. |

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
| **leaseKey**       | Made fresh for each lease, in this browser's memory, which cannot export it (`lease_key`). It wraps a copy of the bankKey so that the lease can seal and unseal without asking. It contains nothing about the device itself. | non-extractable, device-bound KEK |

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
  it, and wraps the boxKey under the bankKey, each bound to the box's stamp and its vault's. Unsealing
  unwraps the boxKey and deciphers the whisper. Only a box is sealed: a wayin or a lease is built.
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
| **wayin**, as stored          | A wayin as it is stored in its gate's record (`GateRecord`), in its `wayins` (`Wayins`): the passphrase wayin under `main`, and the passkey wayin under `passkey0`, or null for none. Each names its place as its `label`. It is a `PassphraseWayinRecord` or a `PasskeyWayinRecord` (`WayinRecord`), distinguished by `wayinkind`. It has the visible fields its kind needs: a passphrase's `key_deriver_label` and `salt_b64`, or a passkey's `credential_id` and `prf_salt_b64`. It also has its bankKeyWayinWrapped, its `born_at`, and the `device_tok` of the device that built it. Both wayins wrap the same bankKey, each bound to the bank's stamp, the gate's stamp, its kind's purpose and its own header, so a wayin moved to another bank, gate or place, or with any header field altered, unwraps nothing. | key slot |
| **bankKeyLeaseWrapped**       | The bankKey, wrapped under the leaseKey: a lease's `bank_key_lease_wrapped`. It never leaves this device. | device-wrapped KEK  |

## Ingredients and contexts

None of these is secret. Each is stored in the clear or rebuilt when needed. If any one is wrong or
has been tampered with, decryption fails.

| Name                     | What it is                                                                                                                                                           | Standard term        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **passphraseSalt**       | Random bytes given to the key deriver along with the passphrase (`salt_b64`): 16 of them under the supplied keyDeriverSpec. Each passphrase wayin has its own, never shared. It is replaced whenever that passphrase changes. | salt                 |
| **prfSalt**              | 32 random bytes that a passkey's authenticator is asked to evaluate its PRF on (`prf_salt_b64`). Each passkey wayin has its own, made fresh when the passkey is added. It is visible. The authenticator's answer to it is the secret. | PRF salt, hmac-secret salt |
| **keyDeriverSpec**       | The recipe that turns a passphrase into the passphraseKey: Argon2id's parameters under a keyDeriverLabel. safebyok supplies one, `Argon2idWebV1`: 64 MiB of memory, 3 passes, 1 lane, a 16-byte salt and a 32-byte result. A host may choose its own. | KDF parameters       |
| **keyDeriverLabel**      | The keyDeriverSpec's name (`argon2id_web_v1` for the supplied one). Each passphrase wayin records it, so the gate records how its passphraseKey was made. A label always means the same parameters. Labels beginning `argon2id_web_` are reserved for the specs safebyok supplies. | KDF identifier       |
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
| **mask**                 | The outline of a secret text that is safe to show (`mask(whisper.apiKey)`, giving `sk-*****************wxyz`): a few characters from each end with stars between, so a UI can tell which API key a box has without revealing it. Only the visible ASCII characters of the text's first line count. How much shows depends on how many there are, by `MaskSchedule`: a text of 12 characters or fewer shows only stars, and a text over 20 always comes out 24 characters long. Each option (`head`, `tail`, `minLen`, `maxLen`) overrides its row. Its result is public: it gives away the text's ends, and roughly how long it is. It is exported from `safebyok/utils`. | redact |

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
| **lifeseq**                     | A Thing's own life, as stored: always a string of 10 characters, the base-32 digits (`0-9a-v`) of its lifenum, or `-000000001` for the shell's. The last segment of its **lifepath**, the lifeseqs of the Thing and each Thing above it. |
| **lifenum**                     | A life's number: -1 for the shell, then 0, 1, 2 and up, even for a live life and odd for a tombstone's. It comes only from a lifeseq (`Lifeseq.lifenumOf`) and goes back only through `Lifeseq.ofLifenum`; neither is passed as the other. |
| **lifetok**                     | A token minted when a bank is born and kept by every later revision of its life, and by the tombstone that ends it (`lifetok`, a UUID); a vaultDB refuses a write over the live bank that changes it. It tells one birth of a bank under its banklabel from another, which a **lifepath** cannot once storage is emptied and the bank is born again at life 0. It is in the bank's stamp, so every ctx under the bank binds it. |
| **visible**                     | Said of a stored field that is both unencrypted and authenticated. A visible field is in a stamp, or a wayin's header, that a ctx binds. A change to it in storage makes the record refuse to unseal or unwrap. Anyone who can read the database can read it. Visible fields are the bank's and the gate's stamps (each its scope and the `lifeseq` and `born_at` of its life, and the bank's `lifetok`), every Thing field of a box, and each wayin's header. A wayin's header is its `wayinkind`, `label`, `key_deriver_label` or `credential_id`, salt, `device_tok` and `born_at`. Every field of a box or a wayin is visible except the encrypted ones and a box's sidecar. A visible field is never secret. Say "visible" only of a field that is authenticated. Say "visible in storage" where a sentence could be read as screen visibility. |
| **unencrypted**                 | Said of a stored field that is not encrypted, and nothing more: it may be authenticated or it may not. The `fmt`, revision fields, `written_at` and `am` of a vault record and of a gate row are unencrypted. No wayin's ctx binds them, so a gate verb leaves every wayin as it was. A box's sidecar is unencrypted: no ctx binds it. Whether its gate has a passkey wayin is unencrypted too. Say "unencrypted" in a record-general or backend-general sentence ("ciphertext and unencrypted fields"). Say "visible" of a field known to be authenticated. |
| **sidecar**                     | Your app's own data, stored alongside a box's whisper (`sidecar` at `putBox()` and in the snapshot; `Sidecar`). Its trust class is **unencrypted**, not visible (see those entries): it is not in the box's stamp, so storage may change it and the box still unseals, and the snapshot always shows it as it is stored. Anyone who can read the database can read it. A field that must be read in storage but not changed there unnoticed goes in the whisper too, and the app compares the two once the box is unsealed. It is a JSON object of any JSON values. It is for what an app wants to search server-side, or to show while the vault is locked. Examples are a team, a rotation reminder, or a count of the calls the app made to OpenRouter with this whisper. It is never secret material. safebyok never looks inside it, and your app checks its shape. It is stored as the JSON object it is (`sidecar`; a `jsonb` column on Postgres). It is always written (`{}` when there is none). It counts with the whisper toward what storage allows in one record (`box_too_large`). |
| **whisper codec**, **whisper schema version** | The encoding that turns a box's whisper into bytes before it is ciphered, and the version number of the whisper's own shape. `whisper_codec` is `json_v1`: its JSON with ckeys sorted, as UTF-8. `whisper_schema_version` is 1. Both are stored, and both are in the box's stamp. Neither can be set by a caller yet. |
| **damaged**                     | Said of a stored row that fails its checks when it is read from storage. Such a row refuses with `damaged_row`, and its listing sets it aside. A damaged row never indicates format drift: it is thrown by the bankDB tied to the datastore. What is set aside is the row's scope, its `vault_tok` if it is a box, and `am` `d`; nothing else is read from a row that failed. A vault's fetch lists its damaged box rows in `damaged_rows` (`DamagedBox`), never among its sound `boxes`, under whatever boxlabel storage has for them. A box stored under a name that the label rule refuses is listed there too. Nothing in the core interface deletes a damaged row: use such housekeeping calls as we offer, or access the datastore directly. A box that does not unseal under the bankKey, or that unseals to no whisper, refuses with `damaged_whisper`. The bank's fetch reports each damaged vault row as bad news. |
| **vault record**                | The single row per vault of a bank, which every device syncs (`VaultRecord`, `fmt` 6003). It has the vault's scope, its bank's `bank_tok`, its own `vault_tok`, `registered_at` and `written_at`, its revision (`revision_tok`, `revision_seq`) and its `am`. It holds nothing encrypted: the wayins are in its bank's gate row. Its `vault_tok` identifies its life permanently. It is random, and never reused. Its other shapes are `VaultSparse` (the same fields), `VaultStamp` (the stamp), `VaultScope`, and `VaultTombstone`, which is what `delVault` leaves. |
| **lease record**                | What a `Lease` is made from: its fields as one object, which nothing stores (`LeaseRecord`). Its stamp (`LeaseStamp`) is its `fmt`, `userid` and `banklabel`; its bank's stamp, as `bank_lifeseq`, `bank_born_at` and `bank_lifetok`; its citations of the gate it was proved against (`gate_labelpath`, `gate_lifeseq`, `gate_revtok`); its `born_at`, which a renewal keeps; its `proved_at`; and `wayinkind`. The record adds its `lease_key` and `bank_key_lease_wrapped`. Only a `Lease` and the proving that builds it ever have the record. |
| **device row**                  | The deviceDB's row for a bank scope (`DeviceRow`): `{ user_id, banklabel, device_tok, package_version }`, one per bank scope, its `device_tok` a random UUID. `deviceDB.ensureCachedDevice({ user_id, banklabel })` returns it, making it on the first call, and the device asks for it at `device.ensureBank()`. `deviceDB.forgetDevice` forgets it, as a device's vacate does, so the next `ensureCachedDevice` mints another `device_tok`. It is not secret, and has no key. Each `ensureCachedDevice` puts it with this safebyok's `package_version`, keeping its `device_tok`; a row that fails its check is replaced with a new one, under a new `device_tok`. |
| **bank row**                    | In safebyok-big, the bankDB's row for a bank (big's `BankRecord`, `fmt` 3001): the bank's scope, its revision, its `am` and its `bank_tok`. It holds nothing encrypted. `buildBank` puts it with its gate row, and `delBank` leaves its tombstone (`BankTombstone`). A live bank row always has a live `main` gate row; one without is damaged. |
| **gate row**                    | In safebyok-big, the bankDB's row for a bank's gate (big's `GateRecord`, `fmt` 4001): its scope with its `gatelabel`, its revision, the `bank_tok` of its bank, its `gate_tok`, its `wayins`, and the bags `auth`, `sigs` and `meta`, which are always empty. A gate row is always live: it is put with its bank and deleted with it, and leaves no tombstone. A gate verb changes it alone. |
| **gatelabel**                   | The label of one of a bank's gates. A bank has exactly one, `main`. It is stored as `gatelabel`. |
| **locked**                      | Disallows writes, sealing secrets, and unsealing secrets. Transition to `locked` must be synchronous. A successful gating is necessary and sufficient to change to `unlocked` (apart from a delete bank, of course). |
| **timely**                      | Said of a thing whose local copy of its record was refreshed recently enough to trust (`isTimely`). The `Device.make` options `vaultRefreshMinutes` and `boxRefreshMinutes` set how recently, 5 minutes by default. A caller may name its own age (`maxMillisSinceRefresh`). `fetchBox` always refreshes. |
| **stage**                       | `starting`, `locked`/`unlocked`, `swept`, `vacated`, `deleted`, `signed_out`, `unborn` and `failed`. |
| **signIn**                      | Tells a device who is signed in, and so which user's bank it serves; until then its stage is `signed_out`. A device serves the first user it is told of: another user is a sign-out. |
| **the bank's listing**          | The vaults the bank has enlisted (`bank.vaultListing`). A deleted vault stays in it until a newer life replaces it. The bank's snapshot lists the present ones as `vaults`, one `VaultSnapshot` each. `bank.vaultAt({ vaultlabel })` returns the Vault object listed for a scope, including a deleted one, or null. |
| **rotation**                    | Replacing the bankKey with a new one and sealing every box again under it, so that a wayin revoked beforehand unwraps nothing written afterwards. It is not built yet. When it is, it adds an epoch to the gate row, each wayin and each box, saying which bankKey each belongs to, with the format increments that go with it (TODO-big.md, *Which wayins a rotation keeps*). Until then the bankKey never changes for the life of its bank. A vault that is made again has a new vaultTok, which voids every box of its old life; a bank built again has a new bankKey. |
| **get**, **put**, **del**       | The three verbs of the vault and the bankDB, each applied to the things it has. The vault has `getBox`, `putBox` and `delBox`. The bankDB has `getVault`, `putVault` and `delVault`, and `getBox`, `putBox` and `delBox`. `del` deletes permanently. The deleted thing leaves a tombstone, a whole record (`am` `x`): a box's whisper and wrapped boxKey are removed, a vault's boxes are deleted with it, and a bank's gate, vaults and boxes with it. `vault.del()` deletes the whole vault and removes no key; only `bank.delPrompt()` removes the bank's wrapped bankKeys. The deviceDB's verbs for a lease are `stow`, `peek` and `forget`; the vault side says `cache` for `stow`. |
| **enlist**, **listed**, **kept**, **take down** | A listing **enlists** an instance under its scope, once, and **keeps** it there: `listing.at` returns the instance **kept** at a scope, present or deleted (`listing.isKept`). A **listed** instance is one in the listing's list, its snapshot: kept and present. A deleted one is kept but out of the list, to judge later rows against and to receive a new life; a deleted vault or box stays enabled, and a deleted bank is disabled. The instance of a row found damaged is **taken down**, not deleted: it is no longer kept, and aligned so that it drops what it holds. |
| **adopt**, **align**            | The two steps a storable takes with a record once `receive` has judged it: `adopt` assigns its props and private fields to the instance, and `align` remakes the snapshot and notifies the listeners. |
| **minder**                      | The layer between a vaultDB and a TanStack Query cache (`Minder`): it hands the cache what the vaultDB answers and notifies, through its own watch of one bank, and tells its listeners what lands. It holds no record or instance of its own. A `VaultMinder` minds the bank's boxes under the root box, and a `BankMinder` its bank, main gate and root box. |
| **world**                       | A bank's three roots as this device last heard of them: the bank, its main gate and its root box, read together from the BankMinder's items (`bankMinder.worldAt()`, a `BankRoots`). It is the one place they are read from. A vaultDB answer's `world` is the bank and its main gate alone, read in the answer's step. |
| **watch**, **watcher**, **notify**, **receive** | The vaultDB's words for passing on a change: a caller starts a **watch** of a bank (`vaultDB.watch`), each **watcher** is **notified** of each Thing that changes, and **receives** it as a `ThingNotice`. Each minder's watch of its bank is a watcher. (In safebyok-big, a storable's `receiveRecord` is another thing: see **adopt**.) |
| **listen**, **listener**, **tell**, **hear** | A minder's words for passing on what lands in its cache: a caller **listens** (`minder.listen`), and the minder **tells** each **listener**, which **hears** the answer `tryAt` would give for that scope (`TSQGotAnswer`). |
| **subscribe**, **subscriber**, **publish** | The words of a snapshot: a host **subscribes** (`subscribe`, as `useSyncExternalStore` wants it), and the thing **publishes** each new snapshot to its **subscribers**, which read the snapshot again. Nothing of ours takes what is published, so there is no fourth word. |
| **form verb**, **awaited `unlock` gating** | A gating that is initiated by the customer: `birth`, `unlock`, `replacePassphrase`, `addPasskey` and `revokePasskey`. By contrast, the awaited `unlock` gating (`bank.ensureUnlocked()`, and `vault.withWhisper` through it) asks customer code, through the snapshot's `isUnlockWanted`, to begin the gating. |
| **land**                        | An operation has landed when it and all its consequences are done: a lock, unlock, vacate, sweep or delete, with every prop aligned and the lease stowed or forgotten. A storage write that took effect is **written** (`Written`, `isWritten`), never landed. |
| **attach**, **detach**          | Set or unset an object's has-one instance property to an instance: a bank's lease is attached, and detached. |
| **increment**                   | Atomically increase an integer sequence value by exactly one, or by the given amount. |
| **revoke**                      | Detach a lease and forget it (`Lease.revoke`, `Bank.#revokeLease`). A lease attached to its bank is **granted**. Say **cached** only of the row on the device, and **granted** of the lease's life. |
| **storage**, **datastore**      | **Storage** is the database under a bankDB adapter. A **device database** is what the deviceDB is. Name the `BankDB` or `DeviceDB` where one is meant, and say **datastore** only where any of them is meant; `store` is not a noun here. |
| **ensure**                      | Return the thing if it is already there, or make it so and then return it, so that a second call costs nothing (`bank.ensureVault`, `bank.ensureUnlocked`). An `ensure` is the async third member of a check's triplet (STYLE.md, *Naming*). `isUnlocked` asks, `demandUnlocked` refuses, and `ensureUnlocked` makes it so. A function that only checks, and refuses, is a `check` or a `demand`. |
| **refuse**, **refusal**         | To refuse is to issue an error, by whichever means fits the context: throwing it, notifying of it, or returning it in an `Outcome` or an `Answer`. The **refusal** is the error issued, and its `refusalkind` says which. |
| **Outcome**                     | The result a non-throwing `try*` call resolves to (`Outcome<ValT>`): `{ ok: true, val }` on success, or `{ ok: false, err }`, where `err` is the refusal. |
| **Answer**                      | A bankDB verb's `Outcome`, with what storage reported beside it (`Answer`, `GoodAnswer`, `BadAnswer`): its `act`, `parent` and `dbhas` (see **act**). |
| **read**, **write**             | Umbrella words. To read is to view a thing: get, fetch, hydrate, list. To write is to modify it: put, update, create, insert, del, tombstone. Use one only where any of those is meant (`stale_write`, `written_at`, `#writeVaultRow` for a put or a del); otherwise name the call. Neither is a verb of the public API. |
| **bankDB**                      | The storage plug-in for a bank (`BankDB`): the bank row, its gate row, its vault rows and their box rows, ciphertext only. An adapter extends `AdapterBankDB` and implements its `do*` calls, one per verb, each fetching, judging and storing the whole verb in one step. The core supplies `MemoryBankDB`. Every answer carries its `parent`. |
| **ask**                         | What a bankDB verb is asked: one object, tagged by its `op` (`ensure`, `build`, `get`, `put`, `del`, `list` or `tidy_gone`), with the scope and, as the op needs, its `options`, the row it `expected` and the `record` it would store (`BankEnsureAsk`, `BankBuildAsk`, `GatePutAsk`, `BankDelAsk`, `VaultGetAsk` ... `BoxDelAsk`, `BoxListAsk`, `BoxTidyAsk`). An answer, and a refusal's `meta`, carry what may be logged of it (`LoggableAsk`): every field optional, a record cut to its revision and life tokens, never its payload. |
| **draft**                       | An ask as its caller states it, its defaulted fields left out (`GetAskDraft`, `PutAskDraft`, `BankAskDraft`). A builder fills them in (`getAskOf`, `bank.makeGetAsk`) to make the whole ask, which keeps the brief name (`GetAsk`, `WriteAsk`). |
| **options**, **policy**         | An ask's `options`: the bag of what governs its storage operation, `ifAbsent`, `ifPresent` and `policies`. `ifAbsent` and `ifPresent` say what a get or put does over no row and over a live one. A **policy** (`StoragePolicy`) governs whether or how an operation may proceed, by what it demands of the ask and the rows stored. `policies` names the ones an ask is under, and a call that names none is under none. A `putGate` ask names the one gating it is for (`replace_passphrase`, `add_passkey`, `revoke_passkey`), and the bankDB refuses it `gate_issue` where a demand fails (`notes/storage-policies.md`). The capacity check is another policy, which only a box put applies. |
| **act**, **dbhas**              | The fields of a bankDB verb's answer beside its `val` (`GoodAnswer`, `BadAnswer`). The **act** says what happened (`notes/answer-contract.md`). A get's act is `gotlive`, `gotvoid` or `gotgone`; a list's is `got` or `gotvoid`. A put's is `born`, `reborn`, `replaced` or `passed`, and a del's is `deleted`. A refused put or del's act says why: `void`, `gone`, `camped`, `dubdel`, `stale`, `retcon`, `clash`, `forked` or `ahead`, and a box's `vault_void`, `vault_gone`, `vault_reborn` or `vault_full`, and a vault's or gate's `bank_void`, `bank_gone` or `bank_reborn`. In the new core, a write the put table would let replace the live Thing, refused by a storage policy or for moving the stored `born_at`, carries `policied`. **dbhas** is the stored row the call found where it was acting, or null if there was none; in the new core a get's good answer carries it only for a tombstone, its `val` then Absent. A refusal carries the same `parent` and `dbhas` (`rowsOfRefusal`), so an answer and an error are read the same way; its `meta` has the `act`, the `ask` and the `oplabel`, the verb that refused. |
| **actual**                      | The stored record as reported by the database after a transaction has completed. A store reports it to its adapter as `Actual`'s `record`, and the answer carries it as `val`, or as `dbhas` when refused. |
| **parent**                      | The field of a bankDB answer that carries the row above the one asked for, or the shell for none: the bank row for a gate or vault verb, `ensureBank` and `buildBank`, and the vault row for a box verb. `delBank` answers none. |
| **buildBank**, **delBank**      | The bankDB verbs that make and end a life of a bank. `buildBank` puts the bank row and its `main` gate row in one step, over nothing (`born`) or the bank's tombstone (`reborn`); over a live bank it puts nothing and answers that bank (`passed`). `delBank` leaves the bank's tombstone and deletes every gate, vault and box row under its scope in the same step. |
| **bank_void**, **bank_gone**, **bank_reborn** | The acts a gate or vault verb refuses with when its bank row is not live in the life it cites: none is stored, a tombstone is stored, or a live bank of another `bank_tok` is. A box verb's are `vault_void`, `vault_gone` and `vault_reborn`. |
| **am**                          | The stored tag of a record's liveness (`am`). It is `a` for alive. It is `d` for damaged: the row failed its check, and the bankDB's list sets it aside in `damaged_rows`. It is `x` for a tombstone: gone, or the void sentinel. A tombstone never has `a`. |
| **camped**                      | The refusal of a put that was told not to replace (`ifPresent: 'fail'`) when a live record is already stored. It has the `parent`, and the `dbhas` that was already there. With `ifPresent: 'get'`, the put returns the `passed` act with the stored record instead. |
| **policied**                    | The act of a write the put table would let replace the live Thing, refused by a demand on the Thing stored: a storage policy (`gate_issue`), or a record that moves the stored `born_at` (`bad_record`). Nothing is stored, and its `dbhas` is the live Thing. The new core's alone. |
| **deviceDB**                    | The storage plug-in for this device's leases and device rows, one of each per bank scope (`DeviceDB`). The core supplies `MemoryDeviceDB`, and `IdbDeviceDB` for a browser. A lease goes through `stow`, `peek` and `forget`. `listLeases()` lists every cached lease, oldest first. Calls for one scope take effect in the order they were made. A device row goes through `ensureCachedDevice` and `forgetDevice`. |
| **pantry**                      | The part of this device's database for what safebyok may use but never see: its keys, kept as WebCrypto handles that the page cannot export. It has the leaseKey and the bankKey wrapped under it, together as the lease. An operation with these keys runs inside the browser's keystore and returns its result, never the key's bytes. Unwrapping the bankKey from a lease, wrapping or unwrapping a boxKey, and ciphering a whisper are such operations. The `Lease` has such a handle in a field. A proving has its wayinKey only for the duration of its gating. The rest of the vault asks the `Lease` or the proving to do the work, and no other class sees a key. The deviceDB reaches the pantry, through IndexedDB where a browser stores it. Nothing in the pantry can unlock the bank on another device. |
| **born_at**, **written_at**     | `born_at` is when this life of a Thing began: the `written_at` of the write that made it, or remade it over a tombstone. Every later revision of that life keeps it. `written_at` is when the record was last written, by any write, whether or not its whisper changed. On a tombstone it is when the Thing was deleted. Every Thing has both. Each wayin has a `born_at`, when it was added, and each lease one, when it was first granted: a renewal keeps it. They are spelled this way in both storage and code. |
| **proved_at**                   | When a gating's proving built a lease, spelled this way on the lease. A cached lease is past autolock once more than `leaseMillis` has passed since its `proved_at`. Then it is never attached again. |
| **autolockMinutes**             | The `Device.make` option for how long a lease lasts after its proving, in minutes. The default is 14 days (`DefaultLeaseMillis`), and `Infinity` means until it is locked. The device reports it as `autolockMinutes`, and its bank keeps it as `leaseMillis`. `bank.autolock()` locks the bank if its cached lease is past it; it is best-effort, and a deviceDB refusal or a damaged row goes to `onBadNews` and locks nothing. The host calls it after `ensureBank()` and on its own timer. |
| **strengthChecker**      | The `Device.make` option that checks each new passphrase before it becomes a wayin (`StrengthChecker`). It checks the passphrase a bank is built with and each replacement, never one typed to unlock. It returns a verdict (`PassphraseVerdict`): `{ strong: true }` or `{ strong: false, reason }`. A weak passphrase is refused as `weak_passphrase`. The verdict's `reason` is the refusal's message. Anything the checker throws is replaced by a refusal. Its optional `load` runs at each device's `ensureBank()`. The option itself is optional. If it is left out, `DefaultStrengthChecker` is used, which refuses every new passphrase as too weak. Its refusal's message says a checker must be chosen (`notes/configuration.md`). |
| **EpochMillis**                 | Every time value in safebyok: whole UTC milliseconds since 1970, from `FarPast` (1981) to `FarFuture` (2255). The bounds catch seconds and microseconds passed by mistake.      |
| **fmt**                         | The number at the start of every stored record, which identifies its format: `3001` for a bank (`BankFormat`), `4001` for a gate (`GateFormat`), `6003` for a vault (`VaultFormat`), `5003` for a box (`BoxFormat`), `7003` for a lease (`LeaseFormat`). A box's stamp has its `fmt`, and a lease's stamp has the lease's. A box binds its bank's and its vault's stamps, and a lease its bank's, none of which has a `fmt`, so a new bank or vault format still unseals them. Any change to what a record may contain gives it a new format number. |
| **scopepath**                   | The kind of a thing, then its scope's names in order, joined on `^`, which no name may contain: `vault^u1^acme^main`, `box^u1^acme^main^anthropic`. A listing finds each thing it has by its scopepath. |
| **ckey**                        | A generic map key: a member's name in a map, or an index in an array. It is never a storage address, which is a scopepath. |
| **logger**                      | An option your app may pass to `Device.make` (`VaultLogger`). The vault reports to it whatever it has no caller to throw to. |
| **story**                       | A controlled record of what is happening, suitable for logs or refusals (`Story`). A validator's `parse(val, story?)` takes one, `{ where, advice }`. `where` says where the input was judged, and goes before the failures. `advice` says what to do, and goes after them. Neither quotes the input. |

## Shapes

Each main type (vault, box, lease and the rest) has a small, fixed set of shapes. Each shape is
named for its purpose and prefixed with the type (`VaultStamp`, `BoxSparse`; never a bare
`Stamp`). Each is built from the record's own validator, so a reader learns one record and a
handful of named subsets of it (STYLE.md, *Shapes and duck typing*). A bare `Foo` is the class; `FooRecord`
is a plain object's type, always and only.

| Shape         | What it is                                                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **record**    | The fields stored and sent over a wire, as one object (`VaultRecord`, `BoxRecord`; `ThingRecord`, the union of every kind's; `AnyThingRecord`, every kind's fields in one).                                                                                    |
| **sparse**    | A live record without its body (`Sparse<RecordT>`; in safebyok-big, `VaultSparse`, `BoxSparse`). Sparse records are sent in lists and in some notifications (notably Postgres's, for a large record). A tombstone is never sparse. An associate, such as a vault's gate or its boxes, is never in it. Never call it a "listing": a listing holds a kids value, never records (*listing*). Say "a list's sparse record". |
| **stamp**     | The fields bound into a thing's cryptography (`BankStamp`, `GateStamp`, `VaultStamp`, `LeaseStamp`; see *The stamp*, above). A bank's, a gate's, a vault's and a lease's are fixed for the thing's life. A box's is the single revision it seals. |
| **scope**     | The composite id: the names its scopepath is made of (`VaultScope`, `BankScope`, and `Boxscope`, the only one that smushes its two words).                                     |
| **scoped**    | Said of an object that carries a scope's names as direct properties of its own, perhaps beside others: `{ userid, banklabel, labelpath, ... }`, never `{ scope }`. A record, an ask and a snapshot are each scoped. A parameter that takes any of them is named `scoped`. |
| **dna**       | A type's required and optional props, plus the props the factory controls, which are accepted and ignored. It is what a caller passes to `create`. Its validator is the type's duckish, described below. |
| **tombstone** | The record a deletion leaves behind (`VaultTombstone`; in the new core, `TombstoneOf<BoxRecord>` and the like).                                                                                                                  |
| **void**      | An item that is missing altogether, rather than tombstoned; an empty result row. |
| **shell**     | The tombstone that stands for a void row, never stored: its revision is seq -1 under the void tokens, and its lifeseq `-000000001` (`Shell.of`, typed `ShellOf<BoxRecord>` for a box; in safebyok-big, `shellVaultOf` and `shellBoxOf`). A request that expects no row cites the shell. |
| **Void Sentinel** | The shell of one scope, whole (`VoidSentinel`, made by `Shell.of`): a tombstone made fresh for it, with every field a stored Thing has but no body. It carries its scope, and the life of its parent: a root's lifepath is `-000000001`, and a box under the root box lives in the root box's life. Told by its revseq, -1 (`Thing.isVoidSentinel`); never by identity. A write cites it to make the Thing's first revision. |
| **Absent**    | What a get answers, and a minder's item has, for a Thing with no live record: none stored, or a tombstone (`Absent`, told by `isAbsent`, never by identity). A deleted Thing's tombstone comes beside it: a get's `dbhas`, the minder's dead entry. |
| **item**      | What a minder's cache has for one Thing it minds, as a host shows it: its live whole record, frozen through, or Absent where the vaultDB stores none live (`minder.at`; told of as a `ThingEvent`, whose `eventkind`, `'item'`, tells it from a soon's `SoonEvent`, a dead entry's `DeadEvent` and a listing's `ListingEvent`). A get fills it, and so does every whole record or tombstone, as Absent, the watch or a write tells of; it never goes back. While a newer revision is heard of only sparse, it is invalidated: never timely, and the next get fetches the newest whole. Say "whole record" for what it has: `item` names the entry, as its query key does. |
| **soon**      | What a minder's cache has of a Thing's sparse record newer than its item, only while the item is behind it (`minder.soonAt`). A list's sparse records, and a notice's, land there; one no newer than the item or the soon is dropped, and the soon is removed once the item is no older. A write over the Thing cites the **soonest** record: the soon, else the item. The item is **behind** while a soon newer than it is cached, or a soon with no item: a comparison, not the soon's presence (`minder.isBehindAt`). A listener is told of it as a `SoonEvent` (its `eventkind` `'soon'`), and then of its item invalidated; a listener on the soon's `success` finds the item behind, and a get there fetches it; the giver's bridge invalidates the host's entry for the item on it, and a host never caches it. A box is **bare** in a minder's cache when only a sparse record of its newest life is cached, with no whole record of that life: a soon with no item, or a soon of a newer life than the item (`vault.withWhisper` refuses it `stale_read`). |
| **dead entry** | A Thing's tombstone that last landed in a minder's cache (`minder.deadAt`; told of as a `DeadEvent`). A tombstone lands there before Absent lands in the item; a Thing born again keeps it. |
| **listing**   | What a VaultMinder's cache holds of a Thing's children: the kids value a list last answered, replaced whole by a later one, never joined to (`listingAt`; told of as a `ListingEvent`). A child that lands in the cache for the first time marks it stale. *Minded* and *givable* say whose cache holds it, as for an item. Never a sparse record. |
| **kids**      | A list's answer of a Thing's children (`Kids`): their lifeseqs by label, the live in `items` and the tombstones in `gones`, beside the parent's labelpath and life and the list's `read_tc`. Its `parentage` (the parent) and `deltas` (each child, sparse) come beside it. |
| **minded**    | Said of an item or listing in a minder's own cache: "the minded item". It is the ground truth on this device, as best known. |
| **givable**   | Said of a record or listing in the host's React Query, where the giver's bridge copies it for the hooks to serve: "the givable record". It may lag the minded one until the bridge copies it. Never "given", which means passed as an argument. |
| **cited**     | What a write cites of the record it expects to find, for storage to compare with the one stored: its revision, its life and its liveness, or the shell's (a write ask's `cited`, a `ThingCited`, by kind `GateChecks.cited` and the rest; the shell's is `Shell.Cited`). It may carry other fields of the record, each checked, which only a storage policy reads, as testimony. |
| **sealable**  | What a seal takes its next revision's fields from (`Sealable<BoxRecord>`, passed as `donorProps`): a whole, sparse or unsealed record, a tombstone or the shell. The seal keeps its Thing fields and its body, and never its secrets: the sealer's approvelist, then the lease's banlist (`withoutSecrets`). |
| **Thing**     | A model of one life of a stored Thing (`Thing`; its kinds `Bank`, `Gate`, `BaseBox`): its life's fields fixed, its revision's fields set again as it adopts a newer record of that life. A listener can subscribe to its changes. |
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

* **hold**, **held**, **keep**, **kept**: wait, adopt, enlist, attach, stow, cache, carry over or leave unchanged. For what a
  thing contains, say has, contains or stored, or use the possessive ("this proving's wayin"). For an item or listing in a
  cache, say minded (the minder's) or givable (the host's React Query's).
* **take**: enlist, adopt, get or peek.
* **store**: put, stow or storage.
* **save**: put or stow.
* **complete**: full, whole, or one of the other verbs.
* **raise**: deprecated. Say increment, throw or start.
* **clear**: deprecated as the name of a secret (`passphraseClear`, `clear`). Say cleartext: `clear` reads as a verb, and carries no warning.

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

* **key, alone.** A key is always one of the five above, by name, or a wayinKey. A member's name
  in a map is a `ckey`. A storage address is a scopepath.
* **entry.** It says everything and means nothing: an item, a text box, a way in, a submission?
  Name the thing for what it holds: a VaultMinder's cache value is a ThingCar. If no name suits, make
  a long one up (`NewestAndWholeCarrier`), and report it.
* **data, contents, payload.** The secret is a whisper. Encrypted, it is a whisperCiphered.
* **open, as a verb on a key, a whisper or a box.** Name the operation instead. A key is
  unwrapped (`unwrap`). A whisper is deciphered (`decipher`). A box is unsealed (`unseal`). A
  whisper is taken out of its box by `extract`. A sentence the user sees may still say "open".
* **unlock, as a noun.** A way in is a wayin. A device caches a lease. `ensureUnlocked()` is the
  verb, `unlock_bank` the gating, and `bank.unlock()` the form-verb imperative. (Code-wise, a
  gating is considered a verb.)
* **proof or ask, for the request for cleartext.** The user hands in cleartext through the
  host's form, and a proof is that cleartext (`ProvedCleartexts`), never the request. Made into a
  key, it is a proving. An ask is what a storage verb is asked.
* **device key.** The key behind a lease is the leaseKey.
* **public, plain, server-readable, of a stored field.** A field is visible (unencrypted and
  authenticated) or unencrypted (and possibly not authenticated). There are no public keys here.
* **KEK, DEK, KDF, AAD.** They appear above only so a security reviewer can map safebyok's names
  onto the usual ones. Nothing in safebyok's API asks you to learn them.

Stored records spell every name in underbar_case: `whisper_ciphered`, `key_deriver_label`.

The names the reform of October 2026 retired, and the old design's names the new core does not
have, are in `notes/old_vocabulary.md`, for reading older code and records. Nothing in the core
uses them.
