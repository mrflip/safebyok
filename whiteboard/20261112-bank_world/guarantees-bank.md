**Target for the bank_world line, not yet true of the code:** `notes/guarantees.md` as it should read once the line is whole, one gate per bank.
Thread 8b promotes it into `notes/guarantees.md`; until then that file describes the code, and this one is what a thread's change is judged against.

## What moves

For a reviewer: how this differs from today's `notes/guarantees.md`. Nothing else in it is meant to differ.

* **The bankKey is the one master key per bank** (R1), where each vault had a vaultKey: wrapped as each wayin's
  `bank_key_wayin_wrapped` on the gate row and as the lease's `bank_key_lease_wrapped`, and wrapping each boxKey. No
  primitive, wrap or derivation is new; G3 is restated for it.
* **Each ctx lists the stamps of the thing and of whatever contains it** (`design.md`, *Keys, stamps and each ctx*): a
  wayin binds the bank's and the gate's stamps, a lease the bank's and its own, a box the bank's, the vault's and its own.
  The gate row's `auth`, `sigs` and `meta` are bound by no ctx, beside the sidecar.
* **The lease is the bank's**: one row per bank scope, citing `gate_tok` and `gate_revision_tok` where it cited
  `gate_epoch`; kept in `Bank.#lease`. `bank.autolock` and a vacate peek or forget that one row and list none. G4 and G9
  are restated.
* **One unlock opens every vault of the bank, and deleting a vault removes no wrapped key** (*The construction*). Only
  `delBank` deletes the wayins.
* **The files**: `models/bank.ts` (the lease, the seal verbs) and `models/device.ts` (the host functions' wrappers, the
  vacate) join the table; `models/vault.ts` leaves it, as a Vault has no key, lease or whisper text. Twelve files, not eleven.
* **The three host functions are wrapped in `Device`'s constructor**, and the only enabled flag a gating's launch checks
  is the device's. `BankFriend` and `world` go from the paragraph on them.
* **Names**: the final ones throughout, though 8b lands before thread 9's rename: until 9, read `vaultKey`,
  `vault_key_wayin_wrapped`, `vault_key_lease_wrapped` in the code. Members `design.md` does not name (`makeBankKey`,
  `#bankKey`, `#wrapBankKey`, `#unwrapBankKey`, the acts and cleartexts checks of the six gatingkinds,
  `Bank.#unlockBankByProving`, `Bank.#leaseFriend`, `bank.sealStampedString`) are today's renamed by pattern: the
  promoting thread writes the code's. So are the test files under *Checked by* that today are the vault's
  (`vault-gate`, `vault-lease`): the promoting thread names the bank's.
* *Open:* does `bank.autolock`'s peek of the lease row go through the Lease, so that the Bank still has no lease record
  (G9), or straight to `DeviceDB.peek`, which hands back the leaseKey handle?
* *Open:* a vacate with no Bank in hand, or over a row of another `bank_tok`: does it forget the lease row by `forget`,
  which matches a `bank_tok`, or by `forgetRawLease`, which does not?
* *Open:* how the `requestCleartext` wrapper reaches a gating launched on the bank or its gate (kept by the Device and
  passed down, or handed to each); whether `DeviceDB.listLeases` stays once nothing lists leases (G4's exception names
  it); and what a proving is handed, `ProvingWorld` today, once `world` is retired.

---

# Security guarantees: where secret material lives

This note states what safebyok promises about its secret material: which values are secret, in what
form each may exist, for how long, and which code may have or use it. SECURITY.md says what is in
scope for a report; this note says what such a report would show to be broken. VOCABULARY.md names
every key and its encrypted form.

Each guarantee names the code that keeps it and, where there is one, the test that checks it. A
guarantee changes only with a Coach's ruling and a changeset. A guarantee a reader finds broken is
a bug: report it, do not amend the guarantee. **Changing any file named under *Where the
guarantees are kept* means reading *The guarantees* first and checking the change against them.**

Last verified against the code 2026-10-27, on `main` after #302, with
[#305](https://github.com/mrflip/safebyok/pull/305) applied; the access points, G5 and G8 amended
2026-10-28 for [#316](https://github.com/mrflip/safebyok/pull/316) and the aead_narrow thread.
Rewritten for the published core (`packages/safebyok`) on 2026-11-06, against `main` at 4e63ae760, for
[#528](https://github.com/mrflip/safebyok/pull/528), the guarantees_models thread: every site and test is the
core's, and its paths are under `packages/safebyok/` unless they say otherwise. The old core
(`packages/safebyok-old`, removed 2026-11-10) is no longer described here; where the core has no counterpart to one
of its sites, the note says so. A claim the code no longer supports is listed in #528's open questions.
Restated for one gate per bank on <date>, against `main` at <sha>, for the bank_world line: the bankKey, the bank's
lease, the gate row's wayins and the `Device`.

## Where the guarantees are kept

Twelve files contain every line of the core that touches a secret: `crypto.ts`; the two shapes files that define what a
stored leaseKey and a whisper are; the five files in `models/` that build the constructions; `models/bank.ts`, which
passes the whisper's text to the lease and keeps the lease; `models/device.ts`, which wraps the host's functions and
forgets the lease row at a vacate; and the two files that are given the passphrase, the default deriver and the strength
checker's wrapper. A change to one of them is a change to these guarantees until shown otherwise.

| File | What it keeps |
|---|---|
| `packages/safebyok/src/helpers/crypto.ts` | every call into WebCrypto: key makers, import, HKDF, wrap, unwrap, cipher, decipher, randomness, ctx |
| `packages/safebyok/src/shapes/shapes-gateish.ts`, `shapes-core.ts` | the `leaseRecord` and `whisper` checks, which say what a stored leaseKey and a whisper are |
| `packages/safebyok/src/models/proving.ts` | the wayinKey; the bankKey, which is unwrapped per call, passed from one proving to another inside `buildWayin(source)`, and handed only to `Lease.buildGranted`; the PRF bytes, which it reads to derive the passkeyKey and leaves for the gating to zero |
| `packages/safebyok/src/models/gating.ts` | the chain that carries a passphrase or an answer from the host's dialog to a proving; `checkedCleartexts`; `spendCleartexts`, the only place the PRF bytes are zeroed; each kind's act, which proves the cleartexts and then makes its change, passing them only to `checkedCleartexts` and a `Proving` builder |
| `packages/safebyok/src/models/lease.ts` | the leaseKey handle and the bankKey wrapped under it, unwrapped per call in `#bankKey`; every seal and unseal of a box's whisper; `evict` and `vacate` |
| `packages/safebyok/src/models/gate.ts` | has no key: it has wayin pickles, by `wayinlabel`, and the bank's stamp and its own; the passphrase proving made by a `build_bank` gating is dropped once the `buildBank` act has built the bank's lease |
| `packages/safebyok/src/models/box.ts` | has no key: it hands the lease the whisper's JSON text and a stamp, through the Bank's seal verbs, and gets text back; it makes no bytes to zero, and the text cannot be zeroed (G6) |
| `packages/safebyok/src/models/bank.ts` | the whisper's JSON text, passed through `sealStampedString` and `unsealStampedString` to `Lease.sealWith` and `unsealWith` and back (G6); the bank's one `Lease`, kept private in `#lease`, which no method hands out (G9); `autolock`, which reads the bank's one lease row (G4) |
| `packages/safebyok/src/models/device.ts` | the wrappers of the three host functions, made in its constructor, and `guardRequestCleartext`; `vacate`, which forgets the bank's lease row and the device row (G4) |
| `packages/safebyok/src/deriver/argon2id-webv1.ts` | `deriveKeyBytes`, which takes the passphrase as an argument and returns the passphraseKey bytes in a buffer of its own, which `passphraseKeyOf` imports and zeroes (G1, G2) |
| `packages/safebyok/src/helpers/passphrase-strength.ts` | `guardStrengthChecker`, whose wrapper takes the new passphrase as an argument, parses the host checker's verdict inside the wrapper, and passes anything the checker throws to `HostErrorSanitizer.refusalFor` (G1, G8, G9) |

Besides these files, three host functions handle the passphrase. Each is wrapped once, in `Device`'s constructor, and from
there on the core has the wrapper and never the host's own function. What a proving is handed and a gating's
launch (`GX.gatingLaunchOnArgs`, `gatingLaunchBirthArgs`) each refuse a function that lacks the wrapper's brand (`isGuarded`, `helpers/consts.ts`). The brand is a
`Symbol.for`, which any code can set, so it catches mistakes in the core's own wiring and is not a security barrier:
`Device`'s constructor wraps every host function regardless. `keyDeriver` is wrapped by `guardKeyDeriver`
(`models/proving.ts`), whose `deriveKeyBytes` replaces anything thrown with `keyDeriverThrew`. `strengthChecker` is
wrapped by `guardStrengthChecker` (`helpers/passphrase-strength.ts`), which passes anything thrown to
`HostErrorSanitizer.refusalFor` (`refusals/host-error-sanitizer.ts`); that is the only function that substitutes a
refusal for a foreign throw, and it reads nothing from the throw. `requestCleartext` is wrapped by
`guardRequestCleartext` (`models/device.ts`), which discards anything thrown and returns false, so that `Gating.#askHost`
refuses with `requestCleartextThrew`. A host may leave `requestCleartext` out: the gating's
`askUser` is then null, no host function is called, and the gating waits, open, for its `attempt` or `dismiss`. Either
way the device's snapshot has the live gating as `openGating`, so that a dialog can respond to it. A gating keeps no
cleartext between attempts (G1), and its `toJSON` shows only its scope, kind and random `gatingTok`. The
`requestCleartext` wrapper is kept private, and it reaches a gating only as an
argument of `Gating.launchOn` or `launchBirth`. No public member of a device, a bank or a gate returns it. A disabled device never asks the user: every
`Gating.launchOn` and `launchBirth` comes after a check, in the same tick, that the device is enabled, and a sweep or a
vacate disables it before it returns. `onLifecycle` is wrapped in `Device`'s constructor too, by `guardOnLifecycle`. It
is given a `BankEvent`: a bag with what happened (a refusal, an outcome or a count), the live `Bank`, and the live
`Vault` the event concerns, if there is one. It is given no secret material: neither instance hands out a key (G9). A
revoked identity vacates the device in the core, whatever that handler does. The `DeviceDB` (`storage/device-db.ts`,
`storage/memory-device-db.ts`) stows the leaseKey as an opaque handle, and anything a device database throws is replaced
by `deviceDBFailed` (`refusals/throwers.ts`, called from the catch in each `DeviceDB` verb), which keeps nothing of it
(G8).

## The construction

safebyok is a **key-wrapping hierarchy** (envelope encryption): two tiers of key-encryption keys
over a per-box data-encryption key. It is not a ratchet of any kind. Nothing in it evolves a key
forward, derives the next key from the last, or offers forward secrecy: the bankKey is static for
the bank's life, and a wayin removed stops opening the bank from now on but revokes nothing
already copied (README, *Removal is not revocation*). A whisper is ciphered under a fresh boxKey
at every write, and that boxKey is wrapped under the bankKey. This is envelope encryption, not a
ratchet, and that is the right design: a bank reads its own secrets back and has no counterparty to
keep chain state with. Post-compromise security would come from rotation, which is not built
(VOCABULARY, *rotation*).

A bank has one bankKey, one gate and one lease, so one unlock on a device opens every vault of the bank. Deleting a
vault deletes its boxes, and with them every boxKey wrapped under the bankKey for it; it deletes no wrapped bankKey.
Only `delBank` deletes the gate row, and with it every wayin.

```
passphrase + salt_b64      ──Argon2id──────>  passphraseKey  ─┐
passkey PRF answer + ctx   ──HKDF-SHA256───>  passkeyKey     ─┤ wayinKey   wraps  bankKey   → bank_key_wayin_wrapped    (synced, on the gate row)
                                                               │
leaseKey (this browser, non-extractable)   ───────────────────┘            wraps  bankKey   → bank_key_lease_wrapped    (this device)
bankKey   wraps    boxKey   → box_key_wrapped
boxKey    ciphers  whisper  → whisper_ciphered
```

Every cipher is AES-256-GCM through WebCrypto, under a fresh random 96-bit IV, with the ciphertext
bound to a `ctx` as additional data (`crypto.ts`, `cipherCtx`). The ctx names the stamp of the thing and of whatever
contains it: the bank's stamp (scope, `bank_tok`, `registered_at`) in every ctx; beside it the gate's (`gatelabel`,
`gate_tok`, `registered_at`) for a wayin, the lease's own for a lease, and the vault's (`vaultlabel`, `vault_tok`,
`registered_at`) and the box's for a box's two ciphertexts. It names a purpose string unique to
the kind of field, and the record's own visible header or stamp, a wayin's header with its `wayinlabel`. So a wrap or a
ciphertext moved to another bank, gate, wayin, vault, box, lease or purpose does not open, and a visible field altered in
storage (a box's time or revision, a salt, a deadline) makes its record refuse to open. A box's
sidecar is the one unencrypted field of a box that no ctx binds, so that the server may change it: a sidecar
altered in storage leaves the whisper opening. The gate row's `auth`, `sigs` and `meta` are bound by no ctx either: each
is checked as an empty bag, and nothing reads them. The box's stamp is its sparse fields alone
(`boxStampOf`, `models/box.ts`). A field a host wants readable in storage and authenticated is kept
in both the whisper and the sidecar, and the host compares the two once the box is unsealed:

| A field kept in       | Server-readable | Server-writable | Authenticated                      |
|-----------------------|-----------------|-----------------|------------------------------------|
| the whisper           | no              | no              | yes                                |
| both, copied          | yes             | up to the host  | yes: compare to see what changed   |
| the sidecar           | yes             | yes             | no                                 |

## Bytes, handles, and the three datastores

Three layers have key material, and the words for each matter.

* **Bytes** are a `Uint8Array` in JavaScript memory. Any code with a reference can read or copy
  them. safebyok zeroes every array of secret bytes it has once it is done with it, and keeps
  such an array only as a local.
* **A handle** is a `CryptoKey`: an object WebCrypto (`crypto.subtle`) hands back whose material
  lives inside the browser's crypto implementation. Code with a handle can *use* it, for the
  usages it carries, and can read its bytes only if it was made `extractable`. A non-extractable
  key's bytes are never observable from JavaScript, by anyone, including the code that made it.
  `crypto.ts` is the only module that calls `crypto.subtle`.
* **IndexedDB** keeps a `CryptoKey` by structured clone: the handle survives a page load, its
  material still inside the browser, never as bytes JavaScript sees. The only key safebyok writes
  this way is the leaseKey (`lease.cacheAsCacheCan`, through a `DeviceDB`'s `stow`). The core's `IdbDeviceDB`
  (`storage/idb-device-db.ts`, on `safebyok/browser`) stores the lease row, including its `lease_key` handle, in
  the database `${dbName}:device-v001-001-001` by IndexedDB's structured clone, never as bytes; its `MemoryDeviceDB`
  (`storage/memory-device-db.ts`) keeps the row by `structuredClone` in a Map for the page's life. No other key is ever written anywhere: not to
  IndexedDB, not to the host's BankDB, which receives only ciphertext and visible fields. The
  wayinKey (the strong key) in particular lives only as a handle in a `Proving`, for one gating,
  and is never persisted.

So for the strong key the minimal path is as follows. The deriver's bytes exist until `passphraseKeyOf` has
imported them into a non-extractable handle and zeroed them. The authenticator's bytes exist until `PasskeyProving`'s
static methods have derived a non-extractable handle from them and the gating's `spendCleartexts` has zeroed them, once the
attempt is over (G2 says when a correctable refusal leaves them to the host). The handle exists in
`Proving.#wayinKey` until the proving is dropped. Nothing of either is ever stored. Outside the core,
`safebyok-react`'s `copyThenZero` (the package runs on the old core until it moves) copies the browser's PRF
result into the answer and zeroes the buffer it copied from, so the answer's bytes are the only copy.
Its dialogs attempt an answer as soon as it comes back, whether or not they are hidden, and zero it once its single
attempt is done (`attemptThenZero`).

## The secret values

Eight values are secret. Everything else safebyok writes or shows is public, or *visible*:
readable wherever it is stored, authenticated by the ctx that binds it, and never secret. A box's
sidecar is public and unauthenticated.

| Value | Form | Where it may exist | For how long | Who touches it |
|---|---|---|---|---|
| passphrase | JS string | function arguments and locals of one gating's chain; the host's dialog | the call | the gating chain, `PassphraseProving.buildNovel`, `buildStored`, `passphraseKeyOf`; the host's `keyDeriver`, `strengthChecker` and dialog |
| passkey PRF answer | `Uint8Array` in the host's `PasskeyAnswer` | the answer object, until its attempt zeroes it: `spendCleartexts` does so whether or not a proving was derived from it (G2) | one attempt | `PasskeyProving`'s static methods, `spendCleartexts`; the host's `askPasskey` |
| passphraseKey bytes | the deriver's `Uint8Array` | a local in `passphraseKeyOf`, zeroed after import | one import | `passphraseKeyOf`; the host's `keyDeriver` |
| wayinKey | `CryptoKey`, non-extractable, `wrapKey`/`unwrapKey` | `Proving.#wayinKey` | the proving, which lives for its gating's chain | `Proving` |
| bankKey | `CryptoKey` | locals only; stored only wrapped | one method | `Proving`, `Lease` |
| boxKey | `CryptoKey` | locals only; stored only wrapped | one cipher or decipher | `Lease` |
| leaseKey | `CryptoKey`, non-extractable, never bytes | a `LeaseRecord`: in `Lease.#record`, through the `DeviceDB` as a `LeaseRow`, and at rest in the device database, one row per bank | the lease | `Lease`, `Proving.buildLease`; the `DeviceDB` stows it opaque |
| whisper | the host's JSON object; then its JSON text, which passes from box to lease; and the UTF-8 bytes, which only the lease makes | the host's value, going in and coming out; the text, as a string in arguments and locals, which cannot be zeroed (G6); the bytes, as locals in the `Lease`, zeroed; the value, on a `Box` from `expose` until `unexpose`, a sweep, a vacate or a delete (a lock or a veil keeps it; *Open items*, 1) | one seal or open, except for that exposed value | `Box`, the Bank's seal verbs, `Lease` |

Not secret, by design: every salt (`salt_b64`, `prf_salt_b64`), a passkey's `credential_id`,
`device_tok`, `key_deriver_label`, every label and `user_id` (a scope name; a host that treats its
user ids as sensitive digests them before they reach safebyok), `bank_tok`, `gate_tok`, `vault_tok`, a lease's
`gate_revision_tok`, `registered_at` and `ask_passphrase_at`, the gate row's `auth`, `sigs` and `meta`, a box's sidecar
(unencrypted and unauthenticated, as *The construction* says), and every wrap and ciphertext. The snapshot shows no salt and no wrap, so an offline
guess has nothing to start from (README, *The passphrase and the passkey*).

## Access points, value by value

For each secret: the code that has its naked value (the string, the bytes, or an extractable
handle), and the code that operates on it as a non-extractable handle without ever having its
bytes. Everything not listed never sees the value. Private methods are named with their `#`.

**Passphrase.** Naked: the host's dialog (`safebyok-react`'s `modals/passphrase-modal.tsx` and
`provider/gating-modal.tsx`, on the old core until the package moves, keep what was typed in component state) →
`gating.attempt` → `#attemptOnce`, inside the gating's `outcomeOf` → its kind's act (`buildBank`, `unlockBank`,
`replacePassphrase`, `addPasskey`, `revokePasskey`, `delBank`, `models/gating.ts`) → `checkedCleartexts` (`GX.bankBuildCleartexts`, `bankUnlockCleartexts`, `passphraseReplaceCleartexts`,
`passkeyAddCleartexts`, `passkeyRevokeCleartexts`, `bankDelCleartexts`: shape only, `passphraseCleartext`) → `PassphraseProving.buildNovel`, `buildStored` (`models/proving.ts`);
`buildNovel` → `Proving.judgeStrength`, handed the bank's scope → the proving's `strengthChecker`, as `guardStrengthChecker`
(`helpers/passphrase-strength.ts`) wraps it → the host's `strengthChecker`; both → `passphraseKeyOf` → the proving's
`keyDeriver.deriveKeyBytes`, as `guardKeyDeriver` wraps it → `deriveKeyBytes` → the host's `keyDeriver.deriveKeyBytes`
(`makeArgon2idDeriver`'s, from `deriver/argon2id-webv1.ts`, or the host's own). As the user types, before any attempt:
`gating.judgeStrength` → `Proving.judgeStrength`, as above.
Operates on it without having it: nothing; a passphrase has no handle form.

**Passkey PRF answer.** Naked: `safebyok-react`'s `createPasskey`, `askPasskey` → `makePasskeyAnswer`,
`copyThenZero` (a copy of the authenticator's result) → the host → `gating.attempt` → `#attemptOnce` → its kind's
prove → `checkedCleartexts` (`passkeyAnswer`, `freshPasskeyAnswer`; `passkeyAnswer`'s `prfBytes` check refuses all-zero
bytes by an inline `reduce`) → `PasskeyProving.buildNovel`, `buildStored` → `deriveWrappingKey`
(`subtle.importKey` as HKDF input, then `subtle.deriveKey`), none of which zeroes them. `spendCleartexts`
(`models/gating.ts`) finds the `passkeyClear.prfBytes` in whatever the attempt was handed, whether or not it was
checked and whether it is a view or a bare `ArrayBuffer`, and zeroes it with `fill(0)`. It does so in `gating.attempt`
for an attempt refused before it starts, and in `#attemptOnce` for an attempt that concludes its gating. In
`safebyok-react`, `PasskeyUnlockButton` and `GatingModal`'s `put_passkey` form pass it on at once, whether or not an
Activity has hidden them, and `attemptThenZero` zeroes it after its attempt.

**passphraseKey bytes.** Naked: `keyDeriver.deriveKeyBytes` → `passphraseKeyOf`
(`isSharedMemory`, `isSafelyAllZero`, the length check) → `importWrappingKeyBytes`
(`subtle.importKey`), then `keyBytes.fill(0)`.

**wayinKey.** Never naked: non-extractable from `importWrappingKeyBytes` or
`deriveWrappingKey`. Has: `Proving.#wayinKey`, set in the constructor. Operates: `#wrapBankKey`
(`wrapKeyUnder`), `#unwrapBankKey` (`unwrapKeyUnder`) through `buildWayin` and
`buildLease`, and `checkUnwraps` (`unwrapKeyUnder`).

**bankKey.** Naked, as an extractable handle in a local: `makeBankKey` in `buildWayin`;
`#unwrapBankKey` with `RewrapUsage` in `buildWayin` and `buildLease`, handed to `#wrapBankKey`
(`wrapKeyUnder`) and `Lease.buildGranted` (`wrapKeyUnder` under the leaseKey). Operates, as a
non-extractable one-usage handle in a local: `checkUnwraps` (`unwrapKeyUnder`, `CheckUsage`);
`Lease.#bankKey` in `sealWith` (`wrapKey`) and `unsealWith` (`unwrapKey`), handed to
`#decipherSealed`.
Stored only as `bank_key_wayin_wrapped` (BankDB, in each wayin of the gate row) and `bank_key_lease_wrapped` (DeviceDB).

**boxKey.** Naked, extractable in a local: `makeBoxKey` in `Lease.sealWith`, wrapped by
`wrapKeyUnder` and used by `cipherBytes`. Operates, non-extractable `decrypt` only:
`unwrapKeyUnder` in `Lease.#decipherSealed`, for `unsealWith`, used by `decipherBytes`. Stored
only as `box_key_wrapped`.

**leaseKey.** Never naked, never bytes. Made: `makeLeaseKey` in `Lease.buildGranted`, called by
`Proving.buildLease`, from the bank's `#unlockByProving` and `#renewLease`. Carried, as the `lease_key` of a
`LeaseRecord`: `Lease.#record`, the one Lease the bank has in `#lease` (`#attachLease`) → `lease.cacheAsCacheCan` →
the `LeaseFriend`'s `tryCacheLease` (made in `Bank.#leaseFriend`) → `DeviceDB.stow`
(`storage/device-db.ts`; `IdbDeviceDB`'s structured clone into IndexedDB, or `MemoryDeviceDB`'s
`structuredClone` into a Map), in the one row keyed by the bank's scope; read back, from
`bank.ensureUnlocked`, by `Lease.buildFromCache` (`peekLease` → `DeviceDB.peek`), which checks the row with
`leaseRecord` and builds a Lease around it. Dropped from memory by `lease.evict`: in `lease.revoke`, at the device's
sweep, and when the lease is found to be damaged (`Lease.#bankKey`). Forgotten
from the device database by `DeviceDB.forget`: through `lease.revoke` or `Lease.forget` (`forgetLease`) from the
bank's `#revokeLease`, at `bank.lock()` and at a bank tombstone delivered; through `tryForgetLease`, in
`Lease.buildFromCache`, for a row of another `gate_tok`, `gate_revision_tok` or stamp; and from `device.vacate`, with
the device row. `bank.autolock` reads the bank's one row and forgets it by calling `bank.lock()`. Neither the Device nor
the Bank lists leases. Only `peek` and `listRawLeases`, which no Device, Bank or Vault calls, return a `lease_key`,
to whoever has the deviceDB (G9). Neither the Device, the Bank nor a Vault has a record.
Operates: `Lease.#bankKey` (`unwrapKeyUnder`) alone.

**whisper.** Naked: the host → `vault.putBox`, `box.put`, `box.putExposed`, `vault.boxListing.create`, and
their `try*` forms → `box.put` → `demandPuttable` (`VX.boxPatch` or `VX.boxPatchNew`, whose whisper is `CX.whisper`, a
`structuredClone`) → `Box.#edit` → `sealedRecordOf` → `stableJsonify`, the text → `bank.sealStampedString`
(`GX.leaseSealArgs`) → `Lease.sealWith` → `TextEncoder`, `cipherBytes`, the bytes zeroed in a `finally`.
Out: `box.extractWhisper`, `tryExtractWhisper`, `box.expose`, and `#keptWhisper` for a put that leaves the
whisper out → `Box.#unseal` → `bank.unsealStampedString` → `Lease.unsealWith` → `#decipherSealed` (`decipherBytes`) →
`TextDecoder`, the bytes zeroed in a `finally` → `deserializeWhisper` (`CX.whisper`) → the host, or `Box.#exposed`
(*Open items*, 1). The core has no `mask` to show an outline of one.

## The guarantees

**G1. A passphrase is never a field.** Inside the core a passphrase is only ever a function
argument or a local. The gating's `attempt` passes the cleartexts to `#attemptOnce`, which passes them to its
kind's act (`models/gating.ts`), whose `checkedCleartexts` reads them. The act passes the
passphrase to `PassphraseProving.buildNovel` or `buildStored`; `buildNovel` passes it to `Proving.judgeStrength`; and
each of the two passes it to `passphraseKeyOf`, which passes it, through the `guardKeyDeriver` wrapper and
`deriveKeyBytes`, to the host's `keyDeriver.deriveKeyBytes` (`models/proving.ts`).
`gating.judgeStrength` passes a passphrase to `Proving.judgeStrength` as the user types. No class, record, snapshot or
closure that outlives the call keeps it: no device, bank, gate or vault is ever given a passphrase, and
past its `Proving` builders an act uses only the provings. The only comparison of two
passphrases is `antePassphraseClear === nextPassphraseClear` in the `replacePassphrase` act, both
typed by the same user (`samePassphrase`). Three host functions handle it: the dialog that collects it (either
`requestCleartext` or a dialog rendered from the device's `openGating`), the `strengthChecker` and the `keyDeriver`.
*Caveat:* a JavaScript string cannot be zeroed, so copies
live until garbage-collected, and `safebyok-react`'s dialog, on the old core until the package moves, keeps what was
typed in component state until it closes. Kept by: `models/gating.ts` (chains), `models/proving.ts`. Checked by: a
search with `rg` for a field or record that has a passphrase finds none; `tests/models/vault-gate.test.ts`, *leaves the
dialog open on a wrong ante, a weak next or the same passphrase, storing nothing, and the next attempt lands*, finds the
passphrase in no `same_passphrase` refusal.

**G2. The strong key's bytes are locals, zeroed; its handle is non-extractable.** The deriver's
output is a view over the deriver's own buffer, imported non-extractable with `wrapKey`/
`unwrapKey` only, and zeroed in a `finally`, whether it was imported or refused (`passphraseKeyOf`,
`importWrappingKeyBytes`). No proving zeroes a passkey's PRF bytes: `spendCleartexts` (`models/gating.ts`) does, both for
an attempt refused before it starts (while another runs, or after the gating is concluded) and for one that concludes
its gating, whether or not a proving was derived from them. So an answer is single-use, and an answer handed in again is
refused as `bad_option` because its bytes are all zero (`passkeyAnswer`, `shapes-gateish.ts`). The bytes are left
un-zeroed in one case only: the attempt ends in a refusal the user can correct (`wrong_passkey` is one) and is not the
gating's last attempt. That is so even when a key was already derived from them. The host may then hand the answer in
again, or zero it, and the gating keeps no reference with which to zero them later. *Caveat:* in that case the zeroing
is the host's to do; `safebyok-react`'s dialogs do it (`attemptThenZero`). The passkeyKey is HKDF-SHA256 of those bytes, with
the wayin's whole ctx as its `info`, derived non-extractable (`deriveWrappingKey`). The result, the
wayinKey, is not a local: it is `Proving.#wayinKey`, private, for the proving's life, and no
method returns it or a bankKey (`models/proving.ts`). Bytes refused before import: anything but
32 bytes, 32 zero bytes, and shared memory. Checked by: `tests/models/proving.test.ts` (among them *the ctx a wayin is
wrapped under* and *a passkey proving's key*), `tests/helpers/crypto.test.ts` (*deriveWrappingKey*),
`tests/models/gating.test.ts` (*gating.attempt*, among them *refuses a second while one runs 'attempt_in_flight',
spending what it was handed, and the first goes on*, *concludes a malformed attempt, spends what came with it, and the
refusal has no passphrase* and *spends an answer from another realm, whose bytes are no instance of this realm's
Uint8Array*).

**G3. The bankKey is never stored naked, and never persisted as a handle.** One bankKey serves every vault of its bank.
It exists (a) as an
*extractable* local, which WebCrypto requires for it to be wrapped: fresh in `buildWayin`
(`makeBankKey`), and unwrapped with `RewrapUsage` in `buildWayin` and `buildLease` (`#unwrapBankKey`). An extractable
handle yields its bytes to anyone who has it, so each is dropped at the end of its method and
crosses no boundary: those methods return a `Wayin`, a `Lease` or a wrap. (b) As a
*non-extractable* local with one usage: `checkUnwraps` (`CheckUsage`), and `Lease.#bankKey`
for each cipher or decipher, which keeps nothing between calls. Storage has the bankKey only as each wayin's
`bank_key_wayin_wrapped`, on the gate row, and the pantry only as `bank_key_lease_wrapped`, ciphertext bytes under the
leaseKey; there is no handle to a naked bankKey anywhere at rest, and no cache of one in memory. Kept by: `models/proving.ts`,
`models/lease.ts`. Checked by: `tests/models/lease.test.ts`, `tests/models/proving.test.ts`.

**G4. The leaseKey never has bytes.** It is generated non-extractable (`makeLeaseKey`) and exists
only as a `CryptoKey` handle: a local in `Lease.buildGranted`; `Lease.#record` in memory, for the lease's life;
and the `lease_key` of a `LeaseRow` cached by `lease.cacheAsCacheCan` through a `DeviceDB`'s `stow` (the core's
`IdbDeviceDB` keeps it by IndexedDB's structured clone, its `MemoryDeviceDB` by `structuredClone`) and read back by
`Lease.buildFromCache` (`DeviceDB.peek`). A bank has one lease, and the device one row for it, keyed by the bank's
scope; the row cites the gate's `gate_tok` and the gate row's `revision_tok` (`gate_revision_tok`), so a gate verb on
any device leaves it to be forgotten at the next `buildFromCache`. A lease is dropped from memory at `bank.lock()`, at
the device's sweep or vacate, at a bank tombstone delivered, and when it is found to be damaged (`Lease.#bankKey`). Its
row is forgotten at `bank.lock()`, at a vacate and at a bank tombstone delivered, which are among the sites the
leaseKey's access chain names, **with one exception**: a lease row that fails
its check is neither listed by `listLeases` nor forgotten by `forget`. It stays until a later `stow` over its scope, or
until a host calls `forgetRawLease` with the scopepath that `listRawLeases` returns beside the row; `forgetRawLease`
reaches a row filed under labels that today's checks refuse (notes/wontfix.md). No lease is dropped by the passage of
time alone, and **autolock is a best-effort reminder process, not a guarantee**: a lease granted in a page stays granted
until something locks it. Two things enforce the autolock duration, each against a row cached on this device that was
proved longer ago than that duration. `bank.autolock`, which only the host calls, locks the bank when its one row is
such a row, and `bank.lock()` forgets the row. `Lease.buildFromCache`, when `bank.ensureUnlocked` reads the cache, declines to load
such a row: it leaves the row in place and throws nothing, so `ensureUnlocked` proceeds as it does with no row, and asks
for a proof. **An expired row stays on disk**, with the leaseKey handle and the wrapped bankKey in it, until the next
proof's lease is written over it or a host's `bank.autolock` locks it; a host that never calls `bank.autolock` keeps it
until then. `Lease.buildFromCache` never reaches a lease that is already attached, and `bank.autolock` reaches one only
through its row, so it misses a lease that the deviceDB refused to cache, or whose row another page has forgotten or
written over. Both go by the device's clock, as `Date.now()` reads it: setting the clock back delays them, and makes an
expired row that is still on disk usable again. A record read back whose key is extractable, of another
algorithm, or for another use is treated as `damaged_lease` (`isLeaseKey`, `shapes-gateish.ts`). *Caveat:*
non-extractable stops export, not use. Whoever has the handle in this page can unwrap the
bankKey as an extractable key, and with it open every box of every vault of the bank. So the `DeviceDB`, which is host-pluggable and is handed every lease
record, is inside the trust boundary, as the host already is (SECURITY.md, *What is outside
safebyok's protection*). Kept by: `models/lease.ts`, `storage/device-db.ts`, `shapes/shapes-gateish.ts`. Checked by:
`tests/models/lease.test.ts` (*makes its leaseKey non-extractable, usable only to wrap and unwrap*, and
*Lease.buildFromCache*'s *tells a cached record whose leaseKey is extractable as 'damaged_lease' bad news, quoting
none of it, answers null and leaves it in place*, one of a list of cases under one title).

**G5. A boxKey is a local.** It is made fresh in `Lease.sealWith`, extractable only so that it can be wrapped. It is
unwrapped in `#decipherSealed`, for `unsealWith`, as a non-extractable key with the `decrypt` usage only. Each is dropped at the
end of its method.

**G6. The whisper's bytes are zeroed; its value is the host's.** A put (`putBox`, `box.put`, `putExposed`,
`vault.boxListing.create`) validates the host's value and takes a `structuredClone` (`CX.whisper`, in
`VX.boxPatch`), and `sealedRecordOf` (`models/box.ts`) serializes it with `stableJsonify` into its JSON text, a
string, which passes from `Box` to `Lease` through the Bank's seal verbs (`bank.sealStampedString`,
`unsealStampedString`). `Lease.sealWith` encodes the text and zeroes the bytes afterwards, whether the seal succeeded or
was refused; `Lease.unsealWith` decodes the deciphered bytes and zeroes them; `Box.#unseal` parses the text
(`deserializeWhisper`), checks it against `CX.whisper`, and hands the value to the host (`extractWhisper`) or keeps it
(`expose`). `Box` makes no bytes of its own. So the whisper's bytes are zeroed, and the copies of its text live
until garbage-collected, as a passphrase's do (G1). The core does not measure a whisper's size, so it has no copy made
for measuring to zero. A `Box`'s
record has ciphertext, never a whisper; the `Box` itself can keep the value, after `expose` (*Open items*, 1).
*Caveat:* the JSON value itself cannot be zeroed, and the core has no `mask` to show an outline of one. Kept by: `models/box.ts`,
`models/lease.ts`. Checked by: `tests/models/box-seal.test.ts` (*opens the whisper create sealed, and the one a
later put sealed: the sealed parts carry none of it*), `tests/models/lease.test.ts` (*round-trips a whisper's text
under the same stamp*, *refuses tampered ciphertext as 'damaged_whisper', quoting none of it*). No test checks that the
bytes are zeroed.

**G7. The set of secrets is closed.** The eight values above are the secrets. A new one, or a new
form of one (a cache, a copy in a snapshot, a key kept between calls), is a design change that
amends this note first. The whisper's JSON text, a string between `Box` and `Lease`, is a form of
the eighth value that this note names here: it lives in locals and arguments for one seal or open, and no field has it.

**G8. No secret reaches a refusal, a log, or a thrown value.** A `VaultError` carries none in its
message, `cause`, `meta` or any property (`errors.ts`); no refusal interpolates anything but a
kind, a limit, a field name, or the `name` of an error it replaces (`thrownNameOf`, `errors.ts`: a
DOMException's or an Error's class name such as `QuotaExceededError`, or whatever name a host's own
device database gave its error, kept by the device-database conditions until redaction is built; the Coach, 2026-10-28). No validator's refusal quotes an input value. It names a failing field by its
path, so a key a host chose, which is no secret, may be named (`tests/helpers/validator.test.ts`, *repeats the keys of
a schema keyed by its input in the refusal*). The test *every checker a shapes module exports*
(`tests/helpers/validator.test.ts`) takes each checker the shapes modules export, and each field under it at any depth
parsed alone, and gives each a marked value: whole, in a list and in an object. It finds the marker in no refusal's
message, stack, meta or cause. A check over a whole object runs only once its fields pass, so that test does not reach
it. The three host functions that handle the passphrase have anything they throw replaced, never kept as a `cause`, by
the wrappers `Device`'s constructor makes for them: `guardKeyDeriver`'s
`deriveKeyBytes` (`models/proving.ts`, `keyDeriverThrew`), `guardStrengthChecker` (`helpers/passphrase-strength.ts`)
through `HostErrorSanitizer.refusalFor`, and `guardRequestCleartext` (`models/device.ts`), which discards what was thrown
and returns false, so that `Gating.#askHost` refuses with `requestCleartextThrew`, an `unexpected_error`. The gating's
`checkedCleartexts` does the same for a getter or proxy of the host's that throws while an attempt's cleartexts are read:
the refusal is `cleartextsThrew`, an `unexpected_error` with no cause. A `VaultError` that a getter throws passes through
unchanged (`notes/wontfix.md`).
A `keyDeriver`'s `load` and a strength checker's `load` are given no passphrase. A `VaultError` that either throws
passes through unchanged, and any other throw is kept as the cause of `keyDeriverLoadFailed` or
`strengthCheckerLoadFailed`. A WebCrypto
failure that a wrong key or an altered record explains is caught and replaced, and its error is never
kept: the unwrap that proves a wayin (`Proving.checkUnwraps`, `wrongCleartext`), the unwrap of a lease's
bankKey (`Lease.#bankKey`, `damaged_lease`), and the unwrap and decipher of a whisper
(`Lease.#decipherSealed`, `damaged_whisper`). Each such catch covers only WebCrypto calls, with their ctx built before
it, so a bug in building the ctx is never reported as a wrong proof or a damaged box. Where no wrong key or
altered record can explain a failure, a WebCrypto error is not caught where it is thrown: in sealing
a whisper (`Lease.sealWith`: `makeBoxKey`, `wrapKeyUnder`, `cipherBytes`), granting a lease
(`Lease.buildGranted`: `makeLeaseKey`, `wrapKeyUnder`), making a proving's key (`importWrappingKeyBytes` in
`passphraseKeyOf`, `deriveWrappingKey` in `PasskeyProving`'s static methods) or making a wayin or a lease from a proving
(`Proving.buildWayin`, `Proving.buildLease`: `makeBankKey`, and the unwrap and wrap of a bankKey
already proved). A proving's key, a grant or a wayin is made inside the gating's `outcomeOf`, which turns the error into
an `unexpected_error` with the DOMException as its `cause`. An error from a seal reaches the host as a throw
from `putBox`, `box.put`, `putExposed`, `vault.boxListing.create` or the public `bank.sealStampedString`. From the
`try*` forms of the first four, `outcomeOf` turns it into an `unexpected_error` with the DOMException as its `cause`.
Either way it contains no secret: a WebCrypto
error carries a name and a message, never key material. The cause of a device-database failure never reaches the host:
`storeFailed`
(`refusals/throwers.ts`, from the catch in each `DeviceDB` verb) keeps neither what the device database threw nor its message,
only its `name`, because a `DeviceDB` is handed every lease record and the logger hands a whole condition to the
host (`tests/storage/device-db.test.ts`, *a deviceDB whose store throws*). `unexpectedError` keeps a foreign throw
as `cause` only where the code that threw was given no secret. Each Lease and Box `try*` form ends in a single catch
(`outcomeOf`, `outcome.ts`), and the invariant at that catch can be checked by reading what can reach it: a
refusal (passed through as itself), the bank's demand, or a throw from a bug in this package's own lines. A throw from
a host function or the device database never reaches it, as each is replaced first, and a
WebCrypto error reaches it only from the seal, key, grant and wayin paths named above. The `try*` forms of the Vault,
the Bank and the box listing are likewise each a single `outcomeOf` over the throwing form, and the throwing forms end
in no such catch. The logger is given messages, a story bag of kinds and calls, and `VaultError`s;
`Proving.toJSON`, `Lease.toJSON` and `Wayin.toJSON` show no key material, and a lease that cannot be read is reported
without its record (`Lease.buildFromCache` reports a `damagedLease()` to the friend as bad news, built from nothing of
the row, and returns null). *Host obligation, documented:* a `strengthChecker`'s
`reason` becomes the `weak_passphrase` message, so it must not quote the passphrase
(notes/configuration.md).

**G9. Only `Gating`, `Proving` and `Lease` have or use a key or its cleartext pre-image.** A passkey's PRF bytes count as a pre-image.
Besides them a passphrase passes through the host functions of G1, through their wrappers, and through
`Proving.judgeStrength` on its way to one. `src/models/proving.ts` and `src/models/lease.ts` are the only modules
that import `wrapKeyUnder`, `unwrapKeyUnder`, `cipherBytes`, `decipherBytes` or a key maker. The wayinKey lives only
in `Proving.#wayinKey`; the leaseKey only in `Lease.#record` and the row cached on the device. The Bank keeps its one
`Lease` private, in `#lease`, and neither the Device, the Bank nor a Vault has a lease record: `Proving.buildLease` makes the
Lease the bank has, and `Lease.buildFromCache` checks what `DeviceDB.peek` hands back and builds a Lease around
it. A `Box` reaches the Lease only through the public `bank.sealStampedString` and `unsealStampedString`, which hand
the lease a whisper's text and a stamp and hand back a sealed whisper or text, never a key. A `Vault` has no lease and
no key. The `LeaseFriend` whose
`peekLease` returns the cached row with its leaseKey handle is kept in `Lease.#friend` and made
in `Bank.#leaseFriend`. No public `Device`, `Bank` or `Gate` method takes a proving: a gating's act reaches the bank's `#unlockByProving`
through `Bank.#unlockBankByProving`, which is private, and which is passed to `Gating.launchOn` or `launchBirth`.
The entry points export `Gating` as a type only, so the published surface has no launcher a host could hand an unlock
of its own. A live gating's `constructor` still reaches the statics: that goes around the published types, and the host
is inside the trust boundary (SECURITY.md). Nothing public on a
`Bank` or a `Lease` hands the friend out, and a test captures it with a spy on `Proving.prototype.buildLease`.
Neither class has a getter, field, spread, JSON or Symbol that yields a key. The row itself is also within reach of
whoever has the deviceDB (G4). The entry points export neither `Lease` nor `Proving`, so the published surface
has no route by which a host hands a friend of its own to `proving.buildLease`. Checked by:
`tests/models/lease.test.ts` (*what a lease shows*), `tests/models/vault-lease.test.ts` (*a vault and a
lease show neither the lease friend nor the lease key handle, one level deep, by identity*), `rg` for
the crypto imports.

**G10. Foundations the construction rests on.**

* *Authenticated encryption everywhere, bound by ctx.* AES-256-GCM only; a fresh 96-bit IV from
  `crypto.getRandomValues` per call; the ctx as additional data (above). Per key the number of
  ciphers is small (a bankKey wraps once per box write in any vault of its bank, and once per wayin and lease grant),
  far under the 2^32 guidance for random IVs.
* *Key separation by usage and purpose.* Wrapping keys carry `wrapKey`/`unwrapKey` only; a boxKey
  `encrypt`/`decrypt` only; an unwrapped key gets a single usage, the one its call needs, and WebCrypto
  enforces it. Each kind of field has its own purpose string (`PurposeForWayinkind`: `bank_key_passphrase_wrapped`,
  `bank_key_passkey_wrapped`; `bank_key_lease_wrapped`, `box_key_wrapped`, `whisper_ciphered`), and the passkeyKey's HKDF
  `info` is its wayin's ctx, so the same bytes under another purpose make another key.
* *A memory-hard, labelled, salted derivation.* Argon2id under a stored `key_deriver_label` whose spec is fixed
  (`Argon2idWebV1`, `deriver/shapes.ts`: 64 MiB, 3 passes, 1 lane, 16-byte salt, 32-byte key), made by
  `makeArgon2idDeriver` (`deriver/argon2id-webv1.ts`, over `@noble/hashes`); a fresh random salt per wayin
  (`mintPassphraseHeader`, `models/proving.ts`); a wayin under another label is refused as `newer_format`
  (`PassphraseProving.buildStored`), so there is no silent downgrade (`tests/models/proving.test.ts`, *refuses a
  wayin made under another key deriver as 'newer_format', before the world's is asked*). A deriver that `makeArgon2idDeriver`
  makes under a supplied label must carry exactly that label's supplied parameters, and `makeArgon2idDeriver` makes none
  under another label with the reserved prefix `argon2id_web_`. These are the refines of `keyDeriverSpec`
  (`deriver/shapes.ts`), which only `makeArgon2idDeriver` reaches, through `parseKeyDeriverSpec`. A host's own deriver is
  checked once, by `keyDeriverShape`
  (`shapes/shapes-core.ts`) in `guardKeyDeriver` as `Device`'s constructor wraps it: by its interface, and by its
  `salt_size`, which every deriver's spec and every stored salt keep at 16 (`PassphraseSaltSize`, `helpers/consts.ts`),
  but not by its other parameters, as a host bent on weak ones would find a way (`#the-host-is-not-our-threat-model`, the Coach, 2026-11-06). `safebyok/browser`
  exports `makeArgon2idDeriver` and `argon2idWebV1Deriver` (the main entry point, `safebyok`, exports neither), and
  `tests/browser.test.ts` runs both, the refines through `parseKeyDeriverSpec`;
  safebyok-fastkey's hash-wasm deriver runs on the old core.
* *Randomness* from `crypto.getRandomValues`, `crypto.randomUUID` and `subtle.generateKey` alone (`randomBytes`,
  `randomId`, the key makers).
* *No secret is compared.* A wrong passphrase or passkey is detected when the AEAD tag fails to
  verify in `unwrapKey`, never by comparing key bytes.
* *Strict validation on read.* A stored record that fails its schema reads as damaged or absent and
  is never partly used; before 1.0.0 no older shape is read (CLAUDE.md).
* *A static bankKey.* No rotation yet: removal is not revocation; a bank made anew has a new
  `bank_tok` and a new bankKey, which voids every wayin, lease and box of the bank; a vault made anew has a new
  `vault_tok`, which voids its boxes, under the same bankKey (README, VOCABULARY *rotation*).

## Open items

Each is a Coach's call; none breaks a guarantee above. The old core's `vaultRecordHeldBy`, a test-only export once
listed here, has no counterpart in the core.

1. **The exposed whisper** (`src/models/box.ts`, `Box.expose` and `box.whisper`) is a whisper
   kept on the instance. That is a new form of a secret, which G7 says this note names first. The core's `Box` has
   it, as a plain object the host may edit, from `expose` until the host calls `box.unexpose()` or the box is swept, deleted or vacated.
   A lock and `box.veil()` keep it; while the box is locked or veiled, a frozen bag marked `Whispered` is returned in its place (`'locked'`, `'veiled'`), so neither takes it out of
   memory. `unexpose` is the call that removes it. A bag, or a copy of one, is refused at a put, so it can never replace the secret. Forging the mark
   only gets a put refused. `BoxFields` (`src/dom/box-fields.ts`, the `safebyok/dom` entry) writes a leaf of it to an element's `value`, through
   `Box`'s public surface alone, so it is also in the DOM while it shows. A lock or a veil writes a blank over the element's value. Before that, an edit
   is read back into the `Box` by `box.patchWhisper`, which works while locked and writes nothing. The element is never read while hidden. When the last
   field unbinds, the box is unexposed. It is the host's decision, which a host would otherwise make for itself without the guard. "whisper is unsafe by design and its
   implementation may change as we tune its unsafeness" (the Coach, 2026-10-31).
