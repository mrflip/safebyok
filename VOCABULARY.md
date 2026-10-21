# Vocabulary

safebyok names each thing once, in plain words, and uses that one name in its API, its docs, its
stored records and its code. This page is the cast. You don't need to know any cryptography to
use safebyok; if you do, the last column of each table gives the usual term.

## What you handle

| Name           | What it is                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **whisper**    | The secret you store: any JSON value (a string, number, boolean, array or plain object), such as an API key or `{ apiKey, orgId }`. safebyok never looks inside it.                                |
| **box**        | Holds one whisper, encrypted, together with its `boxlabel` and a sidecar your UI may show while the vault is locked. A `Box` in code; what storage holds of it is its record, a `BoxRecord` (`box.props`). |
| **vault**      | One user's set of boxes, named by your app's `applabel`, the signed-in user, and its own `vaultlabel`. Made with `Vault.make(opts)`; `vault.hello()` reads what storage and this device hold of it. |
| **passphrase** | What the user types to unlock their vault. It is not their login password, and safebyok never stores it or sends it anywhere. A vault has exactly one, its passphrase wayin (`putWayin` with a new passphrase replaces it, and removes the passkey). |
| **passkey**    | What the user touches to unlock instead of typing: a fingerprint, a face, a phone or a security key, as a WebAuthn credential whose authenticator answers for the vault through the PRF extension. safebyok never holds its secret; the authenticator does, and answers only after the user's fingerprint, face or PIN. A vault has at most one, its passkey wayin (`putWayin` with a passkey's answer puts or replaces it, `delWayin` removes it, and so does a new passphrase), always beside the passphrase it was added under. |
| **wayin**      | One way into a vault: its passphrase or its passkey, as the vault knows it. Each has a `wayinkind` (`passphrase` or `passkey`; `WayinKind`) and the `registered_at` and `device_id` of its sealing; a passkey's also has the `credential_id` and `prf_salt_b64` to ask it with. A vault holds exactly one passphrase wayin and at most one passkey wayin, as two slots of its vault props. The snapshot shows them, even while locked, as its `passphrase` and `passkey`, each a `WayinSummary` (`PassphraseWayinSummary`, `PasskeyWayinSummary`). Only the standing passphrase proves a change to them. Stored as described under *Encrypted forms*. |
| **proof**      | What the user presents to show a wayin is theirs: a passphrase, as a string, or a passkey's answer (`PasskeyAnswer`). `unlock()` takes either; every call that changes the wayins takes the passphrase alone. The vault checks it at its door into a `Proof` (a `PassphraseProof` or a `PasskeyProof`), which holds the secret unenumerable and derives the wayinKey from it (`proof.wayinKeyFor(wayin)`). It is as good as the wayin it opens, so it is dropped after the call. |
| **passkey answer** | What a passkey answers when asked for its vault (`PasskeyAnswer`): the credential's id, the salt it was asked with, and 32 secret bytes. The host gets one from `safebyok-react`'s `createPasskey` or `askPasskey` and hands it to the vault as its proof, which checks it into a **passkey proof** (`PasskeyProof`). |
| **lease**      | What lets this device unlock again without a proof, for a while (`Lease`): granted when a proof unlocks the vault, and taken up when the vault is next opened here, until its askPassphraseAt. It holds the leaseKey and the vaultKeyLeaseWrapped, and stays on the device. How long it lasts is `leaseHours`. It expires at its askPassphraseAt, and the vaultKey goes with it. While the vault is unlocked, its lease is *opened*: it holds the vaultKey's non-extractable handle, the one place the vault keeps it, and boxes seal and open under it; locking drops it. A lock revokes it. A lease that cannot be taken up -- expired, outdated by a change of wayins or a shorter `leaseHours`, unreadable -- is discarded. A revocation and a discard each erase the record (the deviceDB's `delLease`). |
| **ask**        | One request for a proof (`Ask`), made by the vault when a call needs it unlocked and it is not, and handed to the host's `getProof`: its `why` (`absent`, `locked` or `lease_ending`), the vault, `attempt(proof)`, which tries one proof, and `lockLanded`, which settles when a lock ends the prompt. One prompt at a time: every call that needs the vault while it is up waits on its one answer, `unlocked`, `declined` or `carry_on` (`ProofAnswer`). `getProof` is the host's method that answers it, the one place UI meets the vault. |
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
| **leaseKey**       | Kept by this browser, and impossible to export from it. It wraps a copy of the vaultKey so that a lease can unlock without a proof. It holds nothing about the device itself. | non-extractable, device-bound KEK |

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
Each is a pair: its cipherIv and its ciphertext. safebyok exports the pair's one shape as the
**`Ciphered`** type -- `{ cipher_iv_b64, ciphertext_b64 }`, each half base64url text (the `_b64`
suffix) -- so every encrypted field in a stored record is plain JSON any storage layer can hold
as-is.

| Name                          | What it is                                                                                         | Standard term       |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ------------------- |
| **whisperCiphered**           | The whisper, encrypted under its boxKey.                                                           | ciphertext          |
| **boxKeyWrapped**             | The boxKey, encrypted under the vaultKey and stored beside its whisperCiphered.                    | wrapped DEK         |
| **vaultKeyWayinWrapped**      | The vaultKey, encrypted under one wayin's wayinKey: that wayin's `vault_key_wayin_wrapped`. Synced to every device through your storage. | wrapped KEK |
| **wayin**, as stored          | One wayin as the vault props hold it, in their `passphrase` or `passkey` slot (`WayinRecord`: a `PassphraseWayinRecord` or a `PasskeyWayinRecord`, told apart by `wayinkind`; the vault hands each out as a `Wayin`, a `PassphraseWayin` or a `PasskeyWayin`, made from it by `Wayin.make`): the visible fields its kind needs (a passphrase's `key_deriver_label` and `salt_b64`; a passkey's `credential_id` and `prf_salt_b64`), the vaultKeyWayinWrapped, and the deviceId and time (`registered_at`) of the device that sealed it. Both wrap the one vaultKey. | key slot |
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
| **vaultId**              | A random id minted when the vault is made, and never changed (`vault_id`); part of every ctx.                                                                       | --                   |
| **revisionTok**          | A fresh token for each write of a box (`revision_tok`). It is part of the boxCtx; storage refuses (`stale_write`) a write made from a stale read.              | version, CAS token   |
| **unlockEpoch**          | A counter that goes up whenever the vault's wayins change -- the passphrase changed, the passkey added, replaced or removed -- so other devices and leases know to ask again (`unlock_epoch`). | key epoch       |
| **deviceId**             | A random id one device mints for one vault the first time it reads or makes it (`device_id`), kept in its device mark. Each wayin carries the deviceId of the device that sealed it. It is never drawn from anything about the device, and is one per vault, so it links nothing the vault does not already link. | installation id (scoped) |

**An `_id` is a hard identifier; a `_tok` changes.** A stored field ending `_id` names one thing
for good and is what a record is found by (`vault_id`, `device_id`, and the
`credential_id` and `user_id` that come from outside). A value that changes on every write, and
is only ever compared, is a `_tok` (`revision_tok`). In code they are `vaultId` and `revisionTok`.

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
| **boxlabel**                    | The label of a box within its vault: what you pass to `putBox`, `getBox`, `getWhisper`, `useWhisper` and `delBox`. Stored as `boxlabel`.                                            |
| **userId**                      | The signed-in user's stable, opaque id from your own auth, the one name in a scope that is not a label: by default 1 to 100 ASCII letters, digits and `-_.:@+\|` (`UserId`). Never an email or a handle, which can change. Stored as `user_id`. |
| **scope**                       | An applabel, a userId and a vaultlabel together: it names one vault (`VaultScope`).                                                                                         |
| **visible**                     | Said of a stored field that is both unencrypted and authenticated: bound into its record's ctx, so a change in storage makes the record refuse to open, and readable by anyone who can read the database. It covers a box's `boxlabel`, `revision_tok`, codec and schema version, times and sidecar, and each wayin's header (its `wayinkind`, `key_deriver_label` or `credential_id`, salt, `device_id` and `registered_at`): every field of those records but the ciphered ones. A visible field is never secret. Say "visible" only of a field that is authenticated, and "visible in storage" where a sentence could be read as screen visibility. |
| **unencrypted**                 | Said of a stored field that is not encrypted, and nothing more: it may be authenticated or it may not. The vault props' `unlock_epoch` and which wayins fill their two slots are unencrypted and bound into no ctx (each wayin's own fields, and the props' scope, `vault_id` and `registered_at`, are bound, and so visible). Say "unencrypted" of a record-general or backend-general sentence ("ciphertext and unencrypted fields"), and "visible" of a field known to be authenticated. |
| **sidecar**                     | A box's sidecar: your app's own data that rides beside the whisper (`sidecar` at `putBox()` and in the snapshot; `Sidecar`). Its trust class is **visible** (see that entry): authenticated (bound into the box's boxCtx, so a change in storage makes the box refuse to open) but never encrypted, readable by anyone who can read the database. It is guaranteed unchanged once `getWhisper()` opens the box: until then the snapshot shows it as storage holds it. Any JSON value -- what an app wants searchable server-side (a team, a rotation reminder, a count of the calls the app made to OpenRouter with this whisper), shown while the vault is locked. Never secret material. safebyok never looks inside it; your app checks its shape. Stored as its JSON, keys sorted (`sidecar_json`), and always written (`{}` when there is none). Its size counts toward `maxWhisperBytes` with the whisper's. |
| **whisper codec**, **whisper schema version** | How a box's whisper became the bytes it ciphers (`whisper_codec`: `json_v1`, its JSON with keys sorted, as UTF-8), and which generation of the whisper's own shape it holds (`whisper_schema_version`: 1). Both are stored and bound; neither is anything to set yet. |
| **damaged**                     | Said of a stored record that does not read back as what it should be, and told by the kind of refusal each earns. A **box** is damaged (`damaged_box`) when its record does not read back as one; so is one sealed under a vaultKey the vault does not hold. A **wayin** is damaged (`damaged_wayin`) when it is stored in a form this package never writes, so it cannot be tried; the other wayins still can be. The **vault props** are damaged (`damaged_vault`) when they fail their checks or name another vault, so no wayin can be tried at all, and `hello()` refuses. For a box, the snapshot lists it as `{ boxlabel, damaged: true, revision_tok }` (`DamagedBox`, its revision null when the record holds none as text) beside the sound ones; `delBox()` removes it, `putBox()` writes a fresh box over it, and `getBox()` refuses it. A box stored under a name the vault's validators refuse is not damaged: it lists and reads as any other, and only `putBox()` refuses the name. |
| **vaultProps**                  | The one record per vault that every device syncs (`VaultProps`, format `safebyok-vault-v6`): the scope, the vaultId, the unlockEpoch, its `passphrase` and its `passkey` (or null), and when it was made. Nothing in it opens without a proof. Its `vault_id` and `registered_at` together are its `VaultIdentity`. |
| **lease**, as kept              | What a device keeps to unlock without a proof (`LeaseRecord`, format `safebyok-lease-v1`; the vault holds it as a `Lease`, whose `props` it is): the leaseKey, the vaultKeyLeaseWrapped, the vaultId, the unlockEpoch it was granted at and the askPassphraseAt. It stays on the device. |
| **device mark**                 | What a device keeps of a vault's scope, locked or not (`DeviceMark`, format `safebyok-mark-v5`): the seen vault -- what it has `seen` of the vault there: its own deviceId for the vault, the vaultId, the highest unlockEpoch it has seen the vault props at. Nothing in it is secret; it stays on the device, `lock()` leaves it, and `del()` erases it. In prose, say "the seen vault" for what it holds, and keep "mark" for the stored record. |
| **rolled back**                 | Said of vault props storage hands back at a lower unlockEpoch than this device's mark has seen of the same vault. The vault refuses them (kind `rolled_back`), taking nothing from them, and locks. |
| **rotation**                    | Replacing a vault's vaultKey with a new one and sealing every box anew under it, so that a wayin deleted beforehand opens nothing written afterwards. Not built yet: when it is, it adds an epoch to the vault props, each wayin and each box saying which vaultKey each stands for, with the format bumps that go with it (TODO.md, *Which wayins a rotation keeps*). Until then the vaultKey never changes, and a vault made anew has a new vaultId, which voids every box. |
| **get**, **put**, **del**       | The three verbs of every layer -- the vault, the vaultDB and the deviceDB -- each on what it holds: `getBox`, `putBox` and `delBox`; `getVaultProps`, `putVaultProps` and `delVault`; `getLease`, `putLease` and `delLease`. `del` means gone, for good, and nothing of what is deleted is kept: `delBox` a box, `delWayin` a way in, `del()` the whole vault (and, on a VaultDB, `delBox` under a `BoxDelExpectation`, naming the revision read, and resolving a `BoxDeletion` that says what it removed -- `deleted`, `deleted_other` or `absent`; `delVault` and `delDamagedVault` under a `VaultDelExpectation`). |
| **ensure**                      | Get or create, and nothing else: have one, or make one, and hand it back, so that a second call costs nothing (`ensureVaultProps`). A function that only checks, and refuses, is a `check` (STYLE.md, *Naming*). |
| **read**, **write**             | Umbrella words for any get, or any put or del: `stale_write`, `written_at`, "a write made from a stale read". Never a verb of the API. |
| **vaultDB**                     | The storage plug-in for what syncs: vault props and boxes, ciphertext only (`VaultDB`; `localVaultDB`, `idbVaultDB` and `convexVaultDB` are supplied). It reads them with `getVaultProps`, `listBoxes` and `getBox`, and writes them with `ensureVaultProps`, `putVaultProps`, `putBox` and the `del` verbs. |
| **deviceDB**                    | The storage plug-in for this device's lease and device mark (`DeviceDB`; `memoryDeviceDB` and `idbDeviceDB` are supplied), the lease through `getLease`, `putLease` and `delLease`. |
| **change bell**                 | How a write to a store in this browser tells every listener, in this tab and in every other of the origin, to read again (`ChangeBell`, from `safebyok/idb`): a BroadcastChannel, and a bell inside the tab. It carries nothing but the news that something changed. `idbDeviceDB` and `safebyok-indexeddb` ring it after each write; a string store keeps a bell of its own, inside the tab. |
| **registeredAt**, **writtenAt** | When a box was first stored, and when it was last written -- by any store, whether or not its whisper changed; the vault props have a registeredAt too, when the vault was made, and so does each wayin, when it was added. Stored as `registered_at` and `written_at`. |
| **askPassphraseAt**             | The instant from which a device stops honoring its lease and asks for a proof again (`ask_passphrase_at` in the record): then the vaultKey is dropped, by a timer, and the vault locks. It moves only when a proof unlocks the vault, or a passphrase proves a change to its wayins. An instant within a minute of `FarFuture` (`>= FarFuture - MinuteMillis`) means "until it is locked". |
| **leaseHours**                  | The `Vault.make` option for how long a lease lasts after a proof unlocks. The default is 168 (`LeaseHours`), the most 588 (`MaxLeaseHours`, 24.5 days); `Infinity` means until it is locked. A vault reports the lease it was made with as `leaseMillis`, in milliseconds; `Infinity` reads as `ForeverMillis`. |
| **strengthChecker**      | The `Vault.make` option that checks each new passphrase before it becomes a wayin: the one a vault is created with, and each one `putWayin` sets, never one typed to unlock. A function (`StrengthChecker`) from the passphrase and the vault's scope to a verdict (`PassphraseVerdict`), `{ strong: true }` or `{ strong: false, reason }`, never a throw; a weak one is refused as `weak_passphrase`, the reason its message. Optional: left out, every new passphrase is refused as too weak, the refusal's message saying that one must be chosen (the core's CUSTOMIZATION.md). `browserOpts()` supplies `zxcvbnStrengthChecker`, which asks for at least `MinPassphraseChars` (12) characters and a zxcvbn score of 3, turning away common passwords, patterns and the vault's own names. |
| **EpochMillis**                 | Every time safebyok keeps: whole UTC milliseconds since 1970, from `FarPast` (1981) to `FarFuture` (2255). The bounds catch seconds and microseconds passed by mistake.      |
| **format**                      | The tag at the head of every stored record (`safebyok-vault-v6`, `safebyok-box-v7`, `safebyok-lease-v1`, `safebyok-mark-v5`). It is also the first part of the ctx, and bound there once. Any change to what a record may hold moves its format on; a test keeps each format's schema and fails when one changes under the same format. |
| **validators**                  | The `Vault.make` option holding a host's own checks for its labels and user id (`VaultValidators`), each replacing safebyok's default, run where a name enters the vault and never on what storage hands back. A check only checks: what passes is kept as given. |
| **ckey**                        | Where a key-value store files a row: its kind and names joined on `^` (`box^acme^u1^main^anthropic`, from `Ckeys`), which no name may contain. |
| **clock**, **logger**           | Two options your app may pass to `Vault.make`: a source of the time (`Clock`), and a place for the vault to say what it has no one to throw to (`VaultLogger`).          |

## Other credentials

| Name             | What it is                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **API key**      | A user's credential for some other service, and the usual thing a whisper holds. safebyok never names or inspects it.      |
| **access token** | Your app's own login credential, which your storage adapter may send to your backend. It never goes into a vault.       |

## Words safebyok does not use

* **key, alone.** A key is always one of the five above, by name, or a wayinKey. An entry's name
  in a map or a storage address is a `ckey`.
* **data, contents, payload.** The secret is a whisper; encrypted, it is a whisperCiphered.
* **unlock, as a noun.** A way in is a wayin; what a device keeps is a lease. `unlock()` is the
  verb, and `unlock_epoch` keeps its name.
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
