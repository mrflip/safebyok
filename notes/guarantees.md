# Security guarantees: where secret material lives

What safebyok promises about its secret material: which values are secret, in what form each may
exist, for how long, and which code may have or use it. SECURITY.md says what is in scope for a
report; this note says what a report would show broken. VOCABULARY.md names every key and its
encrypted form.

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
(`packages/safebyok-old`, private and frozen) is no longer described here; where the core has no counterpart to one
of its sites, the note says so. A claim the code no longer bears is listed in #528's open questions.

## Where the guarantees are kept

Eleven files contain every line of the core that touches a secret: `crypto.ts`, the two shapes files that say what a
stored leaseKey and a whisper are, the five of `models/` that build the constructions, `models/vault.ts`, which carries
the whisper's text to the lease and keeps it, and the two files that hear the passphrase, the default deriver and the
strength checker's wrap. A change to one of them is a change to these guarantees until shown otherwise.

| File | What it keeps |
|---|---|
| `packages/safebyok/src/helpers/crypto.ts` | every call into WebCrypto: key makers, import, HKDF, wrap, unwrap, cipher, decipher, randomness, ctx |
| `packages/safebyok/src/shapes/shapes-gateish.ts`, `shapes-core.ts` | the `leaseRecord` and `whisper` checks, which say what a stored leaseKey and a whisper are |
| `packages/safebyok/src/models/proving.ts` | the wayinKey, and the vaultKey unwrapped per call and moved from proving to proving inside `buildWayin(source)`, handed only to `Lease.buildGranted`; the PRF bytes, read to derive the passkeyKey and left for the gating to zero |
| `packages/safebyok/src/models/gating.ts` | the chain that carries a passphrase or an answer from the host's dialog to a proving; `checkedClears`; `spendClears`, the one place the PRF bytes are zeroed; `RunForGatingkind`, which hears provings, never a clear |
| `packages/safebyok/src/models/lease.ts` | the leaseKey handle and the vaultKey wrapped under it, unwrapped per call in `#vaultKey`; every seal and unseal of a box's whisper; `evict` and `vacate` |
| `packages/safebyok/src/models/gate.ts` | has no key: wayin pickles and the vault's stamp; the passphrase proving a birth's gating made is dropped after the `build_vault` run's lease |
| `packages/safebyok/src/models/box.ts` | has no key: hands the lease the whisper's JSON text and a stamp, through the Vault's seal verbs, and gets text back; it makes no bytes to zero, and the text cannot be zeroed (G6) |
| `packages/safebyok/src/models/vault.ts` | the whisper's JSON text, carried through `sealStampedString` and `unsealStampedString` to `Lease.sealWith` and `unsealWith` and back (G6); the `Lease` kept closed in `#lease`, which no method hands out (G9) |
| `packages/safebyok/src/deriver/argon2id-webv1.ts` | `deriveKeyBytes`, which hears the passphrase as an argument and returns the passphraseKey bytes in a buffer of its own, for `passphraseKeyOf` to import and zero (G1, G2) |
| `packages/safebyok/src/helpers/passphrase-strength.ts` | `guardStrengthChecker`, whose wrap hears the new passphrase as an argument, parses the host checker's verdict inside the wrap, and hands a throw to `HostErrorSanitizer.refusalFor` (G1, G8, G9) |

Beside them, three host functions hear the passphrase, and each is wrapped once, in `Bank`'s constructor, so that
past it the core has the wrap and never the host's function; a proving's world, a bank's friend and a gating's launch
refuse a function without the wrap's brand (`isGuarded`, `helpers/consts.ts`). The brand is a `Symbol.for` that anyone may wear, a
tripwire for the core's own wiring rather than a lock: `Bank`'s constructor wraps every host function regardless. `keyDeriver` is wrapped by `guardKeyDeriver`
(`models/proving.ts`), whose `deriveKeyBytes` replaces a throw with `keyDeriverThrew`; `strengthChecker` by
`guardStrengthChecker` (`helpers/passphrase-strength.ts`), which hands a throw to `HostErrorSanitizer.refusalFor`
(`refusals/host-error-sanitizer.ts`), the one function that stands a refusal in for a foreign throw, reading nothing
of it; and `requestCleartext` by `guardRequestCleartext` (`models/bank.ts`), which answers false for a throw and drops it,
for `Gating.#askHost` to refuse as `requestCleartextThrew`. A host may leave `requestCleartext` out: the friend's
`askUser` is then null, no host function is called, and the gating waits, open, for its `attempt` or `dismiss`. Either
way the bank's snapshot has the live gating as `openGating`, for a dialog to answer; a gating has no clear between
attempts (G1), and its `toJSON` shows only its scope, kind and random `gatingTok`. That wrap travels in the `BankFriend` the bank hands its
vault listing, which keeps it protected and hands it to each vault, which keeps it private, and it reaches a gating only
in its launch args; no public member of a bank or a vault answers it. A
disabled bank asks no one: every `Gating.launch` follows, in the same tick, a check that its vault or vault listing is
enabled, and a sweep or a vacate disables both before it returns. `onLifecycle` is wrapped there too, by `guardOnLifecycle`; it hears a
`BankEvent`, a bag of what happened (a refusal, an outcome or a count), the live `Bank`, and the live `Vault` it concerns, if one,
and no secret material: neither instance hands out a key (G9). A revoked identity vacates the bank in the core, whatever that
handler does. The `DeviceDB` (`storage/device-db.ts`, `storage/memory-device-db.ts`) stows the leaseKey
opaque, and what a device database throws is replaced at `deviceDBFailed` (`refusals/throwers.ts`, from the catch in each `DeviceDB` verb),
which keeps nothing of it (G8).

## The construction

safebyok is a **key-wrapping hierarchy** (envelope encryption): two tiers of key-encryption keys
over a per-box data-encryption key. It is not a ratchet of any kind. Nothing in it evolves a key
forward, derives the next key from the last, or offers forward secrecy: the vaultKey is static for
the vault's life, and a wayin removed stops opening the vault from now on but revokes nothing
already copied (README, *Removal is not revocation*). A whisper is ciphered under a fresh boxKey
at every write, and that boxKey wrapped under the vaultKey: envelope encryption, not a ratchet,
and rightly so, as a vault reads its secrets back and has no counterparty to keep chain state
with. Post-compromise security is rotation's job, which is not built (VOCABULARY, *rotation*).

```
passphrase + salt_b64      ──Argon2id──────>  passphraseKey  ─┐
passkey PRF answer + ctx   ──HKDF-SHA256───>  passkeyKey     ─┤ wayinKey   wraps  vaultKey  → vault_key_wayin_wrapped   (synced)
                                                               │
leaseKey (this browser, non-extractable)   ───────────────────┘            wraps  vaultKey  → vault_key_lease_wrapped   (this device)
vaultKey  wraps    boxKey   → box_key_wrapped
boxKey    ciphers  whisper  → whisper_ciphered
```

Every cipher is AES-256-GCM through WebCrypto, under a fresh random 96-bit IV, with the ciphertext
bound to a `ctx` as additional data (`crypto.ts`, `cipherCtx`). The ctx names the vault's stamp
(scope, `vault_tok`, `registered_at`), a purpose string unique to
the kind of field, and the record's own visible header or stamp. So a wrap or a ciphertext moved
to another vault, slot, box, lease or purpose does not open, and a visible field altered in
storage (a sidecar, a salt, a deadline) makes its record refuse to open.

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
  material still inside the browser, never as bytes JavaScript sees. The one key safebyok writes
  this way is the leaseKey (`lease.cacheAsCacheCan`, through a `DeviceDB`'s `stow`). The core's `IdbDeviceDB`
  (`storage/idb-device-db.ts`, on `safebyok/browser`) rests the lease row, its `lease_key` handle among it, in
  the database `${dbName}:device-v001-001-001` by IndexedDB's structured clone, never as bytes; its `MemoryDeviceDB`
  (`storage/memory-device-db.ts`) keeps the row by `structuredClone` in a Map for the page's life. No other key is ever written anywhere: not to
  IndexedDB, not to the host's VaultDB, which receives only ciphertext and visible fields. The
  wayinKey (the strong key) in particular lives only as a handle in a `Proving`, for one gating,
  and is never persisted.

So for the strong key the minimal path is: the deriver's bytes exist until `passphraseKeyOf` has
imported them into a non-extractable handle and zeroed them; the authenticator's, until `PasskeyProving`'s
statics have derived a non-extractable handle from them and the gating's `spendClears` has zeroed them, once the
attempt is over (G2 says when a correctable refusal leaves them to the host); the handle exists in
`Proving.#wayinKey` until the proving is dropped; nothing of either is ever stored. Outside the core,
`safebyok-react`'s `bytesOf` (the package runs on the old core until it moves) copies the browser's PRF
result into the answer and zeroes the buffer it copied from, so the answer's bytes are the one copy.
Its dialogs try an answer as soon as it comes back, hidden or not, and zero it once its one attempt is done (`attemptOnce`).

## The secret values

Eight values are secret. Everything else safebyok writes or shows is either public or
*visible*: readable where it lies, authenticated by the ctx that binds it, and never secret.

| Value | Form | Where it may exist | For how long | Who touches it |
|---|---|---|---|---|
| passphrase | JS string | function arguments and locals of one gating's chain; the host's dialog | the call | the gating chain, `PassphraseProving.buildNovel`, `buildStored`, `passphraseKeyOf`; the host's `keyDeriver`, `strengthChecker` and dialog |
| passkey PRF answer | `Uint8Array` in the host's `PasskeyAnswer` | the answer object, until its attempt spends it: `spendClears` zeroes it, a proving derived from it or not (G2) | one attempt | `PasskeyProving`'s statics, `spendClears`; the host's `askPasskey` |
| passphraseKey bytes | the deriver's `Uint8Array` | a local in `passphraseKeyOf`, zeroed after import | one import | `passphraseKeyOf`; the host's `keyDeriver` |
| wayinKey | `CryptoKey`, non-extractable, `wrapKey`/`unwrapKey` | `Proving.#wayinKey` | the proving, which lives for its gating's chain | `Proving` |
| vaultKey | `CryptoKey` | locals only; stored only wrapped | one method | `Proving`, `Lease` |
| boxKey | `CryptoKey` | locals only; stored only wrapped | one cipher or decipher | `Lease` |
| leaseKey | `CryptoKey`, non-extractable, never bytes | a `LeaseRecord`: in `Lease.#record`, through the `DeviceDB` as a `LeaseRow`, and at rest in the device database | the lease | `Lease`, `Proving.buildLease`; the `DeviceDB` stows it opaque |
| whisper | the host's JSON object, then its JSON text, which crosses from box to lease, and the UTF-8 bytes only the lease makes | the host's value in and out; the text a string in arguments and locals, which cannot be zeroed (G6); the bytes locals in the `Lease`, zeroed; the value on a `Box` from `expose` until `unexpose`, a sweep, a vacate or a delete, a lock and a veil keeping it (*Open items*, 1) | one seal or open, but for that exposed value | `Box`, the Vault's seal verbs, `Lease` |

Not secret, by design: every salt (`salt_b64`, `prf_salt_b64`), a passkey's `credential_id`,
`device_id`, `key_deriver_label`, every label and `user_id` (a scope name; a host that counts its
user ids sensitive digests them before they reach safebyok), `vault_tok`, every epoch,
`registered_at` and `ask_passphrase_at`, a box's sidecar (visible, authenticated, never
encrypted), and every wrap and ciphertext. The snapshot shows no salt and no wrap, so an offline
guess has nothing to start from (README, *The passphrase and the passkey*).

## Access points, value by value

For each secret: the code that has its naked value (the string, the bytes, or an extractable
handle), and the code that operates on it as a non-extractable handle without ever having its
bytes. Everything not listed never sees the value. Private methods are named with their `#`.

**Passphrase.** Naked: the host's dialog (`safebyok-react`'s `modals/passphrase-modal.tsx` and
`provider/gating-modal.tsx`, on the old core until the package moves, keep what was typed in component state) →
`gating.attempt` → `#attemptOnce`, inside the gating's `outcomeOf` → its kind's prove (`ProveForGatingkind`,
`models/gating.ts`) → `checkedClears` (`GX.vaultBuildClears`, `vaultUnlockClears`, `passphraseReplaceClears`,
`passkeyAddClears`, `passkeyRevokeClears`, `vaultDelClears`: shape only, `passphraseCleartext`), and for
`revoke_passkey` and `del_vault` `provePassphrase` → `PassphraseProving.buildNovel`, `buildStored` (`models/proving.ts`);
`buildNovel` → `Proving.checkStrength` → the world's `strengthChecker`, as `guardStrengthChecker`
(`helpers/passphrase-strength.ts`) wraps it → the host's `strengthChecker`; both → `passphraseKeyOf` → the world's
`keyDeriver.deriveKeyBytes`, as `guardKeyDeriver` wraps it → `deriveKeyBytes` → the host's `keyDeriver.deriveKeyBytes`
(`argon2idDeriver`'s, from `deriver/argon2id-webv1.ts`, or the host's own). As the user types, before any attempt:
`gating.checkStrength` → `Proving.checkStrength`, as above.
Operates on it without having it: nothing; a passphrase has no handle form.

**Passkey PRF answer.** Naked: `safebyok-react`'s `createPasskey`, `askPasskey` → `answerOf`,
`bytesOf` (a copy of the authenticator's result) → the host → `gating.attempt` → `#attemptOnce` → its kind's
prove → `checkedClears` (`passkeyAnswer`, `freshPasskeyAnswer`; `passkeyAnswer`'s `prfBytes` check refuses all-zero
bytes by an inline `reduce`) → `PasskeyProving.buildNovel`, `buildStored` → `deriveWrappingKey`
(`subtle.importKey` as HKDF input, then `subtle.deriveKey`), none of which zeroes them. `spendClears`
(`models/gating.ts`) reaches the `passkeyClear.prfBytes` of whatever the attempt was handed, checked or not, a view
or a bare `ArrayBuffer`, and `fill(0)`s it: in `gating.attempt` for an attempt refused at the door, and in
`#attemptOnce` for one that concludes its gating. In `safebyok-react`, `PasskeyUnlockButton` and `GatingModal`'s
`put_passkey` form hand it on at once, whether or not an Activity has hidden them, and `attemptOnce` zeroes it
after its attempt.

**passphraseKey bytes.** Naked: `keyDeriver.deriveKeyBytes` → `passphraseKeyOf`
(`isSharedMemory`, `isSafelyAllZero`, the length check) → `importWrappingKeyBytes`
(`subtle.importKey`), then `keyBytes.fill(0)`.

**wayinKey.** Never naked: non-extractable from `importWrappingKeyBytes` or
`deriveWrappingKey`. Has: `Proving.#wayinKey`, set in the constructor. Operates: `#wrapVaultKey`
(`wrapKeyUnder`), `#unwrapVaultKey` (`unwrapKeyUnder`) through `buildWayin` and
`buildLease`, and `checkOpens` (`unwrapKeyUnder`).

**vaultKey.** Naked, as an extractable handle in a local: `makeVaultKey` in `buildWayin`;
`#unwrapVaultKey` with `RewrapUsage` in `buildWayin` and `buildLease`, handed to `#wrapVaultKey`
(`wrapKeyUnder`) and `Lease.buildGranted` (`wrapKeyUnder` under the leaseKey). Operates, as a
non-extractable one-usage handle in a local: `checkOpens` (`unwrapKeyUnder`, `CheckUsage`);
`Lease.#vaultKey` in `sealWith` (`wrapKey`) and `unsealWith` (`unwrapKey`), handed to
`#opened`.
Stored only as `vault_key_wayin_wrapped` (VaultDB) and `vault_key_lease_wrapped` (DeviceDB).

**boxKey.** Naked, extractable in a local: `makeBoxKey` in `Lease.sealWith`, wrapped by
`wrapKeyUnder` and used by `cipherBytes`. Operates, non-extractable `decrypt` only:
`unwrapKeyUnder` in `Lease.#opened`, for `unsealWith`, used by `decipherBytes`. Stored
only as `box_key_wrapped`.

**leaseKey.** Never naked, never bytes. Made: `makeLeaseKey` in `Lease.buildGranted`, called by
`Proving.buildLease`, from the vault's `#unlockByProof` and `#renewLease`. Carried, as the `lease_key` of a
`LeaseRecord`: `Lease.#record`, the Lease the vault has in `#lease` (`#attachLease`) → `lease.cacheAsCacheCan` →
the `LeaseFriend`'s `tryCacheLease` (made in `Vault.#makeFriend`) → `DeviceDB.stow`
(`storage/device-db.ts`; `IdbDeviceDB`'s structured clone into IndexedDB, or `MemoryDeviceDB`'s
`structuredClone` into a Map); read back, from
`vault.ensureUnlocked`, by `Lease.buildFromCache` (`peekLease` → `DeviceDB.peek`), which checks the row with
`leaseRecord` and builds a Lease around it. Dropped from memory by `lease.evict`: in `lease.revoke`, at a sweep
(`sweepContents`), and when the lease proves damaged (`Lease.#vaultKey`). Forgotten
from the device database by `DeviceDB.forget`: through `lease.revoke` or `Lease.forget` (`forgetLease`) from the
vault's `#revokeLease`, at `vault.lock()`, at a vacate and at a tombstone; through `tryForgetLease`, in
`Lease.buildFromCache`, for a row of another epoch or stamp; and row by row from `bank.vacate`
(`#forgetOwnLeases`). `bank.autolock` forgets a row by `vault.lock()`. The Bank's scan, `DeviceDB.listLeases`,
answers rows without one. Only `peek` and `listRawLeases`, which no Vault or Bank calls, answer a `lease_key`, to
whoever has the deviceDB (G9). Neither the Vault nor the Bank has a record.
Operates: `Lease.#vaultKey` (`unwrapKeyUnder`) alone.

**whisper.** Naked: the host → `vault.putBox`, `box.put`, `box.putExposed`, `vault.boxListing.create`, and
their `try*` forms → `box.put` → `demandPuttable` (`VX.boxPatch` or `VX.boxPatchNew`, whose whisper is `CX.whisper`, a
`structuredClone`) → `Box.#edit` → `sealedRecordOf` → `stableJsonify`, the text → `vault.sealStampedString`
(`GX.leaseSealArgs`) → `Lease.sealWith` → `TextEncoder`, `cipherBytes`, the bytes zeroed in a `finally`.
Out: `box.extractWhisper`, `tryExtractWhisper`, `box.expose`, and `#keptWhisper` for a put that leaves the
whisper out → `Box.#unseal` → `vault.unsealStampedString` → `Lease.unsealWith` → `#opened` (`decipherBytes`) →
`TextDecoder`, the bytes zeroed in a `finally` → `parseJsonOrNull` → `CX.whisper` → the host, or `Box.#exposed`
(*Open items*, 1). The core has no `mask` to show a whiff of one.

## The guarantees

**G1. A passphrase is never a field.** Inside the core a passphrase is only ever a function
argument or a local: the gating's `attempt` hands the clears to `#attemptOnce`, and that to its kind's prove
(`ProveForGatingkind`, `models/gating.ts`), whose `checkedClears` reads them; the prove hands the passphrase to
`PassphraseProving.buildNovel` or `buildStored`, `buildNovel` to `Proving.checkStrength`, each to
`passphraseKeyOf`, and that, through the `guardKeyDeriver` wrap and `deriveKeyBytes`, to the host's
`keyDeriver.deriveKeyBytes` (`models/proving.ts`).
`gating.checkStrength` hands one to `Proving.checkStrength` as the user types. No class, record, snapshot or
closure that outlives the call keeps it: no gate, vault or `run` hears a passphrase. The one comparison of two
passphrases is `antePassphraseClear === nextPassphraseClear` in `ProveForGatingkind`'s `replace_passphrase`, both
typed by the same user (`samePassphrase`). Three host functions hear it: the dialog that collects it, be it
`requestCleartext` or one rendered from the bank's `openGating`, the `strengthChecker` and the `keyDeriver`. *Caveat:* a JavaScript string cannot be zeroed, so copies
live until collected, and `safebyok-react`'s dialog, on the old core until the package moves, keeps what was typed
in component state until it closes. Kept by: `models/gating.ts` (chains), `models/proving.ts`. Checked by: `rg` for
a field or record with one finds none; `tests/models/vault-gate.test.ts`, *leaves the dialog open on a wrong
ante, a weak next or the same passphrase, storing nothing, and the next attempt lands*, finds the passphrase in no
`same_passphrase` refusal.

**G2. The strong key's bytes are locals, zeroed; its handle is non-extractable.** The deriver's
output is a view over the deriver's own buffer, imported non-extractable with `wrapKey`/
`unwrapKey` only, and zeroed in a `finally`, imported or refused (`passphraseKeyOf`,
`importWrappingKeyBytes`). No proving zeroes a passkey's PRF bytes: `spendClears` (`models/gating.ts`) does, for
an attempt refused at the door (while another runs, or after the gating is concluded) or one that concludes its
gating, a proving derived from them or not. So an answer is single-use, and one handed in again is refused
`bad_option` by its all-zero bytes (`passkeyAnswer`, `shapes-gateish.ts`). Only a refusal the user can correct,
`wrong_passkey` among them, past the derivation too, short of the last attempt, leaves them unspent, for the host to
hand in again or zero, and the gating keeps no reference to zero them by later. *Caveat:* that zeroing is then the
host's; `safebyok-react`'s dialogs do it (`attemptOnce`). The passkeyKey is HKDF-SHA256 of those bytes, its
`info` the wayin's whole ctx, derived non-extractable (`deriveWrappingKey`). The result, the
wayinKey, is not a local: it is `Proving.#wayinKey`, private, for the proving's life, and no
method returns it or a vaultKey (`models/proving.ts`). Bytes refused before import: anything but
32 bytes, 32 zero bytes, and shared memory. Checked by: `tests/models/proving.test.ts` (among them *the ctx a wayin is
wrapped under* and *a passkey proving's key*), `tests/helpers/crypto.test.ts` (*deriveWrappingKey*),
`tests/models/gating.test.ts` (*gating.attempt*, among them *refuses a second while one runs 'attempt_in_flight',
spending what it was handed, and the first goes on*, *concludes a malformed attempt, spends what came with it, and the
refusal has no passphrase* and *spends an answer from another realm, whose bytes are no instance of this realm's
Uint8Array*).

**G3. The vaultKey is never stored naked, and never persisted as a handle.** It exists (a) as an
*extractable* local where WebCrypto requires it to be wrapped: fresh in `buildWayin`
(`makeVaultKey`), and unwrapped `RewrapUsage` in `buildWayin` and `buildLease` (`#unwrapVaultKey`). An extractable
handle yields its bytes to anyone who has it, so each is dropped at the end of its method and
crosses no boundary: those methods return a `Wayin`, a `Lease` or a wrap. (b) As a
*non-extractable* local with one usage: `checkOpens` (`CheckUsage`), and `Lease.#vaultKey`
for each cipher or decipher, which keeps nothing between calls. The pantry has the vaultKey
only as `vault_key_lease_wrapped`, ciphertext bytes under the leaseKey; there is no handle to a
naked vaultKey anywhere at rest, and no cache of one in memory. Kept by: `models/proving.ts`,
`models/lease.ts`. Checked by: `tests/models/lease.test.ts`, `tests/models/proving.test.ts`.

**G4. The leaseKey never has bytes.** It is generated non-extractable (`makeLeaseKey`) and exists
only as a `CryptoKey` handle: a local in `Lease.buildGranted`; `Lease.#record` in memory, for the lease's life;
and the `lease_key` of a `LeaseRow` cached by `lease.cacheAsCacheCan` through a `DeviceDB`'s `stow` (the core's
`IdbDeviceDB` keeps it by IndexedDB's structured clone, its `MemoryDeviceDB` by `structuredClone`) and read back by
`Lease.buildFromCache` (`DeviceDB.peek`). A lease is dropped from memory at `lock()`, at a sweep, at a vacate, at a
tombstone, and when it proves damaged (`Lease.#vaultKey`), and its row is forgotten at `lock()`, at a vacate and at a
tombstone, among the sites the leaseKey's access chain names, **save one exception**: a lease row that fails its check is neither listed by `listLeases` nor forgotten by `forget`, and stays until a later `stow` over its scope or a host's `forgetRawLease`, by the scopepath `listRawLeases` answers beside it, which reaches a row filed under labels today's checks refuse (notes/wontfix.md). No lease is dropped at a time, and **autolock is a best-effort reminder process, not a
guarantee**: a lease granted in a page stays granted until something locks it. Two things answer to the autolock duration, against a row cached on
this device proved longer ago than it. `bank.autolock`, which only the host calls, locks each listed vault of such a row, and `lock()` forgets it. `Lease.buildFromCache`, at the
door, declines to load such a row, leaves it and throws nothing, so `ensureUnlocked` sees what it sees with no row and asks for a proof. **An expired row stays on disk**, the leaseKey handle and wrapped vaultKey in it, until the next proof's lease is written over it or a host's `bank.autolock` locks it; a host that never calls `bank.autolock` keeps it until then. `Lease.buildFromCache` never reaches a lease already attached, and `bank.autolock` reaches one only by its row: it misses a lease the deviceDB refused to cache, or whose row another page has forgotten or written over. Both go by the device's clock, as `Date.now()` reads it: a clock set back puts them off, and reopens an expired row still on disk. A record read back whose key is extractable, of another
algorithm, or for another use reads as `damaged_lease` (`isLeaseKey`, `shapes-gateish.ts`). *Caveat:*
non-extractable stops export, not use. Whoever has the handle in this page can unwrap the
vaultKey, extractable. So the `DeviceDB`, which is host-pluggable and is handed every lease
record, is inside the trust boundary, as the host already is (SECURITY.md, *What is outside
safebyok's protection*). Kept by: `models/lease.ts`, `storage/device-db.ts`, `shapes/shapes-gateish.ts`. Checked by:
`tests/models/lease.test.ts` (*makes its leaseKey non-extractable, usable only to wrap and unwrap*, and
*Lease.buildFromCache*'s *tells a cached record whose leaseKey is extractable as 'damaged_lease' bad news, quoting
none of it, answers null and leaves it in place*, one of a list of cases under one title).

**G5. A boxKey is a local.** Fresh and extractable only to be wrapped, in `Lease.sealWith`;
unwrapped non-extractable, `decrypt` only, in `#opened` for `unsealWith`; dropped at the
end of each.

**G6. The whisper's bytes are zeroed; its value is the host's.** A put (`putBox`, `box.put`, `putExposed`,
`vault.boxListing.create`) validates the host's value and takes a `structuredClone` (`CX.whisper`, in
`VX.boxPatch`), and `sealedRecordOf` (`models/box.ts`) serializes it with `stableJsonify` into its JSON text, a
string, which crosses from `Box` to `Lease` by the Vault's seal verbs (`vault.sealStampedString`,
`unsealStampedString`). `Lease.sealWith` encodes the text and zeroes the bytes once ciphered, refused or not;
`Lease.unsealWith` decodes the deciphered bytes and zeroes them; `Box.#unseal` parses the text
(`parseJsonOrNull`), checks it against `CX.whisper`, and hands the value to the host (`extractWhisper`) or keeps it
(`expose`). `Box` makes no bytes of its own. So the whisper's bytes are zeroed, and the copies of its text live
until collected, as a passphrase's do (G1). The core sizes no whisper, so it has no sizing copy to zero. A `Box`'s
record has ciphertext, never a whisper; the `Box` itself can keep the value, after `expose` (*Open items*, 1).
*Caveat:* the JSON value itself cannot be zeroed, and the core has no `mask` to show one. Kept by: `models/box.ts`,
`models/lease.ts`. Checked by: `tests/models/box-seal.test.ts` (*opens the whisper create sealed, and the one a
later put sealed: the sealed parts carry none of it*), `tests/models/lease.test.ts` (*round-trips a whisper's text
under the same stamp*, *refuses tampered ciphertext as 'damaged_box', quoting none of it*). No test checks that the
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
a schema keyed by its input in the refusal*). `tests/helpers/validator.test.ts`, *every checker a shapes module
exports*, hands each checker the shapes modules export, and each field under it at any depth, parsed alone, a marked
value, whole, in a list and in an object, and finds the marker in no refusal's message, stack, meta or cause. A check
over a whole object runs only once its fields pass, so the sweep does not reach it. The three host functions that hear the passphrase have their throws
replaced, never kept as a `cause`, by the wraps `Bank`'s constructor makes of them: `guardKeyDeriver`'s
`deriveKeyBytes` (`models/proving.ts`, `keyDeriverThrew`), `guardStrengthChecker` (`helpers/passphrase-strength.ts`)
through `HostErrorSanitizer.refusalFor`, and `guardRequestCleartext` (`models/bank.ts`), which drops the throw and
answers false, for `Gating.#askHost` to refuse as `requestCleartextThrew`, `unexpected_error`. The gating's
`checkedClears` does the same for a getter or proxy of the host's that throws as an attempt's clears are read:
`clearsThrew`, `unexpected_error`, with no cause; a `VaultError` a getter throws passes as it came (`notes/wontfix.md`).
A `keyDeriver`'s `load` and a strength checker's, which hear no passphrase, pass a `VaultError` they throw as it came, and keep any other throw as the cause of `keyDeriverLoadFailed` or `strengthCheckerLoadFailed`. A WebCrypto
failure that a wrong key or an altered record explains is caught and replaced, its error never
kept: the unwrap that proves a wayin (`Proving.checkOpens`, `wrongProof`), the unwrap of a lease's
vaultKey (`Lease.#vaultKey`, `damaged_lease`), and the unwrap and decipher of a whisper
(`Lease.#opened`, `damaged_box`). Each such catch has only WebCrypto calls, their ctx built before
it, so a bug in building the ctx never reads as a wrong proof or a damaged box. Where no wrong key or
altered record can explain a failure, a WebCrypto error is not caught where it is thrown: in sealing
a whisper (`Lease.sealWith`: `makeBoxKey`, `wrapKeyUnder`, `cipherBytes`), granting a lease
(`Lease.buildGranted`: `makeLeaseKey`, `wrapKeyUnder`), making a proving's key (`importWrappingKeyBytes` in
`passphraseKeyOf`, `deriveWrappingKey` in `PasskeyProving`'s statics) or making a wayin or a lease from a proving
(`Proving.buildWayin`, `Proving.buildLease`: `makeVaultKey`, and the unwrap and wrap of a vaultKey
already proved). A proving's key, a grant or a wayin is made inside the gating's `outcomeOf`, which makes the error an
`unexpected_error` with the DOMException as its `cause`. A seal's error reaches the host as thrown
from `putBox`, `box.put`, `putExposed`, `vault.boxListing.create` or the public `vault.sealStampedString`. From the
`try*` forms of the first four, `outcomeOf` makes it an `unexpected_error` with the DOMException as its `cause`. Either way it keeps no secret: a WebCrypto
error carries a name and a message, never key material. A device-database failure's cause never crosses to the host: `storeFailed`
(`refusals/throwers.ts`, from the catch in each `DeviceDB` verb) keeps neither what the device database threw nor its message,
only its `name`, as a `DeviceDB` is handed every lease record and the logger hands a condition to the
host whole (`tests/storage/device-db.test.ts`, *a deviceDB whose store throws*). `unexpectedError` keeps a foreign throw
as `cause` only where the thrower heard no secret. The invariant at the one catch that ends each
Lease and Box `try*` form (`outcomeOf`, `outcome.ts`) is checkable by reading what can reach it: a
refusal (passed as itself), the vault's demand, or a bug's own throw from this package's lines;
never a host function's throw or the device database's, each replaced before it gets there, and a
WebCrypto error only from the seal, key, grant and wayin paths named above. The Vault's, the Bank's and the box
listing's `try*` forms are each one `outcomeOf` over the throwing form too, and the throwing forms end in no such catch. The logger hears messages, a story bag of kinds and calls, and `VaultError`s;
`Proving.toJSON`, `Lease.toJSON` and `Wayin.toJSON` show no key material, and a lease that will
not read is warned of without its record (`Lease.buildFromCache` tells the friend a `damagedLease()` built from nothing of the row, as bad news, and answers null). *Host obligation, documented:* a `strengthChecker`'s
`reason` becomes the `weak_passphrase` message, so it must not quote the passphrase
(CUSTOMIZATION.md).

**G9. Only `Gating`, `Proving` and `Lease` have or use a key or its cleartext pre-image.** A passkey's PRF bytes count as a pre-image.
Beside them a passphrase passes through the host functions of G1, through their wraps, and through
`Proving.checkStrength` on its way to one. `src/models/proving.ts` and `src/models/lease.ts` are the only modules
that import `wrapKeyUnder`, `unwrapKeyUnder`, `cipherBytes`, `decipherBytes` or a key maker. The wayinKey lives only
in `Proving.#wayinKey`; the leaseKey only in `Lease.#record` and the row cached on the device. The Vault has its
`Lease` closed, in `#lease`, and neither the Vault nor the Bank has a lease record: `Proving.buildLease` makes the
Lease the vault has, and `Lease.buildFromCache` checks what `DeviceDB.peek` hands back and builds a Lease around
it. A `Box` reaches the Lease only through the public `vault.sealStampedString` and `unsealStampedString`, which hand
the lease a whisper's text and a stamp and hand back a sealed whisper or text, never a key. The `LeaseFriend` whose
`peekLease` answers the cached row with its leaseKey handle is kept in `Lease.#friend` and made
in `Vault.#leaseFriend`; no public `Vault` method takes a proving, as a gating's run (`RunForGatingkind`) comes to
`#unlockByProof` by `Vault.#gatingFriend`, private in the vault and the gating; nothing public on a
`Vault` or a `Lease` hands the friend out, and a test catches it with a spy on `Proving.prototype.buildLease`.
Neither class has a getter, field, spread, JSON or Symbol that yields a key. The row itself is also in reach of
whoever has the deviceDB (G4). The entry points export neither `Lease` nor `Proving`, so the published surface
has no route by which a host hands a friend of its own to `proving.buildLease`. Checked by:
`tests/models/lease.test.ts` (*what a lease shows*), `tests/models/vault-lease.test.ts` (*a vault and a
lease show neither the lease friend nor the lease key handle, one level deep, by identity*), `rg` for
the crypto imports.

**G10. Foundations the construction rests on.**

* *Authenticated encryption everywhere, bound by ctx.* AES-256-GCM only; a fresh 96-bit IV from
  `crypto.getRandomValues` per call; the ctx as additional data (above). Per key the number of
  ciphers is small (a vaultKey wraps once per box write, wayin and lease grant), far under the
  2^32 guidance for random IVs.
* *Key separation by usage and purpose.* Wrapping keys carry `wrapKey`/`unwrapKey` only; a boxKey
  `encrypt`/`decrypt` only; an unwrapped key gets the one usage its call needs, and WebCrypto
  enforces it. Each kind of field has its own purpose string (`PurposeForWayinkind`,
  `vault_key_lease_wrapped`, `box_key_wrapped`, `whisper_ciphered`), and the passkeyKey's HKDF
  `info` is its wayin's ctx, so the same bytes under another purpose make another key.
* *A memory-hard, labelled, salted derivation.* Argon2id under a stored `key_deriver_label` whose spec is fixed
  (`Argon2idWebV1`, `deriver/shapes.ts`: 64 MiB, 3 passes, 1 lane, 16-byte salt, 32-byte key), made by
  `argon2idDeriver` (`deriver/argon2id-webv1.ts`, over `@noble/hashes`); a fresh random salt per wayin
  (`mintPassphraseHeader`, `models/proving.ts`); a wayin under another label refuses `newer_format`
  (`PassphraseProving.buildStored`), so there is no silent downgrade (`tests/models/proving.test.ts`, *refuses a
  wayin made under another key deriver as 'newer_format', before the world's is asked*). A deriver `argon2idDeriver`
  makes under a supplied label must carry exactly its parameters, and it makes none under another label with the
  reserved prefix `argon2id_web_`: the refines of `keyDeriverSpec` (`deriver/shapes.ts`), reached through
  `parseKeyDeriverSpec` from `argon2idDeriver` alone. A host's own deriver is checked once, by `keyDeriverShape`
  (`shapes/shapes-core.ts`) in `guardKeyDeriver` as `Bank`'s constructor wraps it: by its interface, and by its
  `salt_bytes`, which every deriver's spec and every stored salt keep at 16 (`PassphraseSaltBytes`, `helpers/consts.ts`),
  but not by its other parameters, as a host bent on weak ones would find a way (`#the-host-is-not-our-threat-model`, the Coach, 2026-11-06). `safebyok/browser`
  exports `argon2idDeriver` and `argon2idWebV1Deriver` (the front door, `safebyok`, exports neither), and
  `tests/browser.test.ts` runs both, the refines through `parseKeyDeriverSpec`;
  safebyok-fastkey's hash-wasm deriver runs on the old core.
* *Randomness* from `crypto.getRandomValues`, `crypto.randomUUID` and `subtle.generateKey` alone (`randomBytes`,
  `randomId`, the key makers).
* *No secret is compared.* A wrong passphrase or passkey is learned from the AEAD tag failing to
  verify in `unwrapKey`, never from comparing key bytes.
* *Strict validation on read.* A stored record that fails its schema reads as damaged or absent and
  is never partly used; before 1.0.0 no older shape is read (CLAUDE.md).
* *A static vaultKey.* No rotation yet: removal is not revocation; a vault made anew has a new
  `vault_tok`, which voids every box (README, VOCABULARY *rotation*).

## Open items

Each is a Coach's call; none breaks a guarantee above. The old core's `vaultRecordHeldBy`, a test-only export once
listed here, has no counterpart in the core.

1. **The exposed whisper** (`src/models/box.ts`, `Box.expose` and `box.whisper`) is a whisper
   kept on the instance, a new form of a secret, which G7 says this note names first: the core's `Box` has
   it, a plain object the host may edit, after `expose` until the host calls `box.unexpose()` or the box is swept, deleted or vacated.
   A lock and `box.veil()` keep it, answering a frozen bag marked `Whispered` in its place (`'locked'`, `'veiled'`), so neither takes it out of
   memory: to make it go away is `unexpose`, and a bag or a copy of one refuses at a put, so it can never replace the secret. Forging the mark
   only refuses a put. `BoxFields` (`src/dom/box-fields.ts`, the `safebyok/dom` entry) writes a leaf of it to an element's `value`, through
   `Box`'s public surface alone, so it is also in the DOM while it shows. A lock or a veil writes a blank over it, an edit having been read back
   into the `Box` first by `box.patchWhisper`, which works while locked and writes nothing, and the element is never read while hidden. The last
   field to unbind unexposes. It is the host's decision, which a host would otherwise make for itself without the guard. "whisper is unsafe by design and its
   implementation may change as we tune its unsafeness" (the Coach, 2026-10-31).
