# Vocabulary

safebyok names each thing once, in plain words, and uses that one name in its API, its docs, its
stored records and its code. This page is the cast. You don't need to know any cryptography to
use safebyok; if you do, the last column of each table gives the usual term.

## What you handle

| Name           | What it is                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **whisper**    | The secret you store: any JSON value (a string, number, boolean, array or plain object), such as an API key or `{ apiKey, orgId }`. safebyok never looks inside it.                                |
| **lockbox**    | Holds one whisper, encrypted, together with its `boxlabel` and a public bag your UI may show while the vault is locked.                                                                        |
| **vault**      | One user's set of lockboxes, named by your app's `applabel`, the signed-in user, and its own `vaultlabel`.                                                                                     |
| **passphrase** | What the user types to unlock their vault. It is not their login password, and safebyok never stores it or sends it anywhere. A vault may have several (`addPassphrase`), each its own way in.         |
| **passkey**    | What the user touches to unlock instead of typing: a fingerprint, a face, a phone or a security key, as a WebAuthn credential whose authenticator answers for the vault through the PRF extension. safebyok never holds its secret; the authenticator does, and answers only after the user's fingerprint, face or PIN. A vault may have several (`addPasskey`), each its own way in, and always keeps a passphrase beside them. |
| **passkey proof** | What a passkey answers when asked for its vault (`PasskeyProof`): the credential's id, the salt it was asked with, and 32 secret bytes. The host gets one from `safebyok-react`'s `createPasskey` or `askPasskey` and hands it to the vault; it is as good as a passphrase for that vault, so it is dropped after the call. |
| **unlock**     | One way into a vault, as its snapshot lists it while locked: a `method` (`passphrase` or `passkey`), an `unlock_id`, an `unlocklabel` the user chose to tell it from the others (`home_phrase`, `laptop_fingerprint`), and the `registered_at` and `device_id` of its adding; a passkey's also shows the `credential_id` and `prf_salt_b64` to ask it with. Stored as an unlock envelope. |
| **mask**       | A function from `safebyok/utils` that shows a best-effort whiff of each end of a whisper, one plain line safe for a log or a reminder, so your UI can tell which API key a lockbox holds without revealing it. It is not a faithful copy: marks, invisible characters, bidirectional controls and spaces are dropped, though right-to-left letters are kept and may reorder their neighbours in a display. `mask` is intended for plain text; calling it with arbitrary blobs may give unusual behavior. Stripping every mark costs the vowels of scripts that write them as marks (Hindi `नमस्ते` comes out as `नमसत`); an API key is ASCII, and is untouched. Its result is public: show it, never trust it to hide more than it does. `mask(whisper, { head: 0, tail: 0 })` hides everything but the length. |

## Keys

safebyok has five keys. Each is a 256-bit AES-GCM key, named for whose it is, and none ever leaves the
user's device unencrypted. There are no public or private keys: everything is symmetric. (A
passkey has a key pair of its own inside its authenticator; safebyok never uses it, only the PRF
answer beside it.)

| Name               | What it is                                                                                                                                                         | Standard term                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **passphraseKey**  | Made from a passphrase and its envelope's passphraseSalt by the key deriver. Its only job is to wrap the vaultKey.                                                  | passphrase-derived KEK              |
| **passkeyKey**     | Made from a passkey's PRF answer by HKDF-SHA256, its `info` the same context its wrap is bound to: the vault, the purpose and the envelope. Its only job is to wrap the vaultKey. | PRF-derived KEK                     |
| **vaultKey**       | The vault's random master key. It wraps every lockboxKey, and stays the same when a passphrase is added, removed or changed, so none of those rewrites a lockbox. Only a rotation replaces it.  | key-encryption key (KEK)            |
| **lockboxKey**     | A random key for one lockbox, made fresh every time a whisper is stored. It encrypts that whisper.                                                                 | data-encryption key (DEK)           |
| **localUnlockKey** | Kept by this browser, and impossible to export from it. It wraps a copy of the vaultKey so that "remember this device" can unlock without the passphrase. It holds nothing about the device itself. | non-extractable, device-bound KEK |

Which key opens which:

```text
passphrase + passphraseSalt ──key deriver──> passphraseKey        one per passphrase

passkey + prfSalt ──PRF, then HKDF──> passkeyKey                    one per passkey

passphraseKey   wraps    vaultKey    →  vaultKeyPassphraseWrapped   one per passphrase, synced to every device
passkeyKey      wraps    vaultKey    →  vaultKeyPasskeyWrapped      one per passkey, synced to every device
localUnlockKey  wraps    vaultKey    →  vaultKeyLocalWrapped        this device only
vaultKey        wraps    lockboxKey  →  lockboxKeyWrapped           one per lockbox
lockboxKey      ciphers  whisper     →  whisperCiphered             one per lockbox
```

## Encrypted forms

A key that has been encrypted is **Wrapped**; a whisper that has been encrypted is **Ciphered**.
Each is a pair: its cipherIv and its ciphertext. safebyok exports the pair's one shape as the
**`Ciphered`** type -- `{ cipher_iv_b64, ciphertext_b64 }`, each half base64url text (the `_b64`
suffix) -- so every encrypted field in a stored record is plain JSON any storage layer can hold
as-is.

| Name                          | What it is                                                                                         | Standard term       |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ------------------- |
| **whisperCiphered**           | The whisper, encrypted under its lockboxKey.                                                       | ciphertext          |
| **lockboxKeyWrapped**         | The lockboxKey, encrypted under the vaultKey and stored beside its whisperCiphered.                | wrapped DEK         |
| **vaultKeyPassphraseWrapped** | The vaultKey, encrypted under one passphrase's passphraseKey: a passphrase envelope's `vault_key_wrapped`. Synced to every device through your storage. | wrapped KEK |
| **vaultKeyPasskeyWrapped**    | The vaultKey, encrypted under one passkey's passkeyKey: a passkey envelope's `vault_key_wrapped`. Synced to every device through your storage. | wrapped KEK |
| **unlock envelope**           | One way in as stored, in the bundle's `unlocks`: its method, `unlock_id`, `unlocklabel` and the public fields the method needs (a passphrase's `key_deriver_label` and `salt_b64`; a passkey's `credential_id` and `prf_salt_b64`), and the vaultKey wrapped under the key that method makes (`vault_key_wrapped`), with the vaultKeyEpoch of the vaultKey it wraps and the deviceId and time (`registered_at`) of the device that added it. All of them wrap the one vaultKey. | key slot |
| **vaultKeyLocalWrapped**      | The vaultKey, encrypted under the localUnlockKey. Never leaves this device.                        | device-wrapped KEK  |
| **prior vaultKey**            | The vaultKey a vault had before its current one, encrypted under the current one: the bundle's `prior_vault_key`, `{ vault_key_epoch, vault_key_wrapped }`. Absent while a vault keeps its first vaultKey. Only the current vaultKey opens it, so whoever held the older one gains nothing from it. | wrapped previous key |

## Ingredients and bindings

None of these is secret. Each is stored in the clear or rebuilt when needed, and if any one is
wrong or has been tampered with, decryption fails.

| Name                     | What it is                                                                                                                                                           | Standard term        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **passphraseSalt**       | Random bytes (16 under the supplied keyDeriverSpec) fed to the key deriver with the passphrase: one per passphrase envelope (`salt_b64`), never shared, and replaced whenever that passphrase changes.                            | salt                 |
| **prfSalt**              | 32 random bytes a passkey's authenticator is asked to evaluate its PRF over: one per passkey envelope (`prf_salt_b64`), fresh when the passkey is added. Public; the authenticator's answer to it is the secret. | PRF salt, hmac-secret salt |
| **keyDeriverSpec**       | The recipe that turns a passphrase into the passphraseKey: Argon2id's parameters under a keyDeriverLabel. safebyok supplies one, `Argon2idWebV1`: 64 MiB of memory, 3 passes, 1 lane, a 16-byte salt and a 32-byte result. A host may choose its own. | KDF parameters       |
| **keyDeriverLabel**      | The keyDeriverSpec's name (`argon2id_web_v1` for the supplied one), stored with each passphrase envelope so that the vault says how it was made. A label always means the same parameters. Labels beginning `argon2id_web_` are reserved for the specs safebyok supplies. | KDF identifier       |
| **key deriver**          | What makes the passphraseKey under a keyDeriverSpec: `argon2idWebV1Deriver` for the supplied one, `argon2idDeriver(spec)` for a host's own. One standing in for a supplied spec carries its parameters, or the vault refuses it. | KDF                  |
| **cipherIv**             | 12 random bytes, fresh for every encryption, stored beside the ciphertext it opens.                                                                                  | IV, nonce            |
| **cipherAdditionalData** | The context an encryption is bound to: which app, user and vault, which field it is, and every other field its record writes -- a lockbox's label, revision, vaultKeyEpoch, whisper codec and schema version, public bag and times; an unlock envelope's whole header; a remembered unlock's epoch and deadline. It is rebuilt rather than stored, so ciphertext copied anywhere else, or under an altered field, will not open. | associated data (AAD) |
| **ciphertext**           | The encrypted bytes, with their authentication tag on the end.                                                                                                       | ciphertext           |
| **vaultId**              | A random id minted when the vault is made, and never changed; part of every cipherAdditionalData.                                                                   | --                   |
| **revisionId**           | A fresh id for each write of a lockbox. It is part of the cipherAdditionalData; storage refuses (`stale_write`) a write made from a stale read.                     | version, CAS token   |
| **unlockEpoch**          | A counter that goes up whenever the vault's unlocks change -- a passphrase or passkey added, removed or changed -- so other devices and remembered unlocks know to ask again. | key epoch       |
| **vaultKeyEpoch**        | Which vaultKey a record stands for, counting from 1 for a vault's first (`vault_key_epoch`): on the bundle, the vaultKey its unlock envelopes wrap; on each envelope, the one it wraps; on each lockbox, the one its lockboxKey is wrapped under. Storage writes a lockbox only while the bundle stands at the lockbox's vaultKeyEpoch. | key generation, key version |
| **deviceId**             | A random id one device mints for one vault the first time it reads or makes it (`device_id`), kept in its device mark. Each unlock envelope carries the deviceId of the device that added it. It is never drawn from anything about the device, and is one per vault, so it links nothing the vault does not already link. | installation id (scoped) |

## Names, records and times

How a vault is addressed, what the storage layer holds, and when. A label is, by default
(`Label`), lowercase words of letters and digits joined by single underscores, such as
`anthropic_api_key`; a host may check its labels and user ids with its own `validators`
instead, which admit what they will above the **floor** every name is held to (`NameFloor`:
well-formed Unicode in NFC, no control characters, no `^`, at most 1 KiB).

| Name                            | What it is                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **applabel**                    | Your app's own label, so several apps can share one backend without colliding. Stored as `applabel`.                                                                        |
| **vaultlabel**                  | The label of one of a user's vaults, such as `main`. Stored as `vaultlabel`.                                                                                                |
| **boxlabel**                    | The label of a lockbox within its vault: what you pass to `store`, `read`, `use` and `erase`. Stored as `boxlabel`.                                                         |
| **userId**                      | The signed-in user's stable, opaque id from your own auth, the one name in a scope that is not a label: by default 1 to 100 ASCII letters, digits and `-_.:@+\|` (`UserId`). Never an email or a handle, which can change. Stored as `user_id`. |
| **scope**                       | An applabel, a userId and a vaultlabel together: it names one vault (`VaultScope`).                                                                                         |
| **public bag**                  | A lockbox's public metadata (`public` at `store()` and in the snapshot; `PublicBag`): any JSON value your app keeps beside the whisper -- a note, a project, a rotation date -- shown while the vault is locked. safebyok never looks inside it; your app checks its shape. Stored as its JSON, keys sorted (`public_json`), always written (`{}` when there is none), and bound into the lockbox's encryption. It is never encrypted: never put a secret in it. Its size counts toward `maxWhisperBytes` with the whisper's. |
| **whisper codec**, **whisper schema version** | How a lockbox's whisper became the bytes it ciphers (`whisper_codec`: `json_v1`, its JSON with keys sorted, as UTF-8), and which generation of the whisper's own shape it holds (`whisper_schema_version`: 1). Both are stored and bound; neither is anything to set yet. |
| **damaged**                     | Said of a lockbox whose stored record does not read back as one. So is one sealed under a vaultKey the vault does not hold. The snapshot lists it as `{ boxlabel, damaged: true, revision_id }` (`DamagedLockbox`, its revision null when the record holds none as text) beside the sound ones; `erase()` removes it, `store()` writes a fresh lockbox over it, and `read()` refuses it. A lockbox stored under a name the vault's validators refuse is not damaged: it lists and reads as any other, and only `store()` refuses the name. |
| **bundle**                      | The one record per vault that every device syncs (`VaultBundle`): the vaultId, unlockEpoch and vaultKeyEpoch, the prior vaultKey once there is one, and its unlocks, each an unlock envelope. Nothing in it opens without a passphrase. |
| **device unlock**               | (Also a remembered unlock.) What a device keeps to unlock without the passphrase (`DeviceUnlock`): the localUnlockKey, the vaultKeyLocalWrapped, the vaultId, the unlockEpoch and the askPassphraseAt. It stays on the device. |
| **device mark**                 | What a device keeps of a vault's scope, locked or not (`DeviceMark`): its lock generation, and what it has `seen` of the vault there -- its own deviceId for the vault, the vaultId, the highest unlockEpoch and vaultKeyEpoch it has seen the bundle at -- or null for none. Nothing in it is secret; it stays on the device, `lock()` leaves it, and `destroy()` forgets what it has seen, keeping the lock generation. |
| **lock generation**             | How many locks on this device have forgotten a vault's remembered unlock (`lock_generation`, in the device mark): every hard lock raises it -- `lock()`, `destroy()`, and a lock for storage the vault cannot trust -- but not `lockSoon()`, which lets work in hand finish. An unlock remembers itself on the device only while it stands where the unlock found it, so a hard lock in one tab defeats an unlock under way in another. |
| **rolled back**                 | Said of a bundle storage hands back at a lower unlockEpoch, or a lower vaultKeyEpoch, than this device's mark has seen of the same vault. The vault refuses it (kind `rolled_back`), taking nothing from it, and locks. |
| **rotation**                    | Replacing a vault's vaultKey with a new one and sealing every lockbox anew under it, so that a way in removed beforehand opens nothing written afterwards. Each rotation moves the vaultKeyEpoch up by one, and keeps the vaultKey before as the prior vaultKey. |
| **vaultDB**                     | The storage plug-in for what syncs: bundles and lockboxes, ciphertext only (`VaultDB`; `localVaultDB`, `idbVaultDB` and `convexVaultDB` are supplied).                      |
| **deviceDB**                    | The storage plug-in for this device's device unlock and device mark (`DeviceDB`; `memoryDeviceDB` and `idbDeviceDB` are supplied).                                          |
| **registeredAt**, **writtenAt** | When a lockbox was first stored, and when it was last written -- by any store, whether or not its whisper changed; the bundle has a registeredAt too, when the vault was made, and so does each unlock envelope, when its way in was added. Stored as `registered_at` and `written_at`. |
| **askPassphraseAt**             | The instant from which a device stops honoring its device unlock and asks for the passphrase again (`ask_passphrase_at` in the record): from it no new work starts, and a minute later the vaultKey is dropped. It moves only when the user types a passphrase and it proves. An instant within a minute of `FarFuture` (`>= FarFuture - MinuteMillis`) means "until it is locked". |
| **forcePassphraseReentryHours** | The `openVault` option for how long a device stays unlocked after the passphrase is entered. The default is 168 (`ForcePassphraseReentryHours`), the most 588 (`MaxReentryHours`, 24.5 days); `Infinity` means until it is locked. A vault reports the window it was opened with as `reentryWindowMillis`, in milliseconds; `Infinity` reads as `ForeverMillis`. |
| **passphraseStrengthTest**      | The `openVault` option that checks each new passphrase before it becomes a way in: the one a vault is created with, and each one added or changed to, never one typed to unlock. A function from the passphrase to a verdict (`PassphraseVerdict`), `{ strong: true }` or `{ strong: false, reason }`; a weak one is refused as `weak_passphrase`, the reason its message. The default, `passphraseLengthTest`, asks for at least `MinPassphraseChars` (12) characters; `zxcvbnPassphraseTest`, from `safebyok/browser`, also turns away common passwords. |
| **EpochMillis**                 | Every time safebyok keeps: whole UTC milliseconds since 1970, from `FarPast` (1981) to `FarFuture` (2255). The bounds catch seconds and microseconds passed by mistake.      |
| **format**                      | The tag at the head of every stored record (`safebyok-vault-v2`, `safebyok-lockbox-v3`, `safebyok-unlock-v1`, `safebyok-mark-v3`). It is also the first part of the cipherAdditionalData, and bound there once. Any change to what a record may hold moves its format on; a test keeps each format's schema and fails when one changes under the same format. |
| **validators**                  | The `openVault` option holding a host's own checks for its labels and user id (`VaultValidators`), each replacing safebyok's default, run where a name enters the vault and never on what storage hands back. A check only checks: what passes is kept as given. |
| **ckey**                        | Where a key-value store files a row: its kind and names joined on `^` (`box^acme^u1^main^anthropic`, from `Ckeys`), which no name may contain. |
| **clock**, **logger**           | Two options your app may pass to `openVault`: a source of the time (`Clock`), and a place for the vault to say what it has no one to throw to (`VaultLogger`).             |

## Other credentials

| Name             | What it is                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **API key**      | A user's credential for some other service, and the usual thing a whisper holds. safebyok never names or inspects it.      |
| **access token** | Your app's own login credential, which your storage adapter may send to your backend. It never goes into a vault.       |

## Words safebyok does not use

* **key, alone.** A key is always one of the five above, by name. An entry's name in a map or a
  storage address is a `ckey`.
* **data, contents, payload.** The secret is a whisper; encrypted, it is a whisperCiphered.
* **device key.** The key behind "remember this device" is the localUnlockKey.
* **KEK, DEK, KDF, AAD.** They appear above only so a security reviewer can map safebyok's names
  onto the usual ones. Nothing in safebyok's API asks you to learn them.

Stored records spell every name in underbar_case: `whisper_ciphered`, `key_deriver_label`.
