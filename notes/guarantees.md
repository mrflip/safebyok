# Security guarantees: where secret material lives

What safebyok promises about its secret material: which values are secret, in what form each may
exist, for how long, and which code may hold or use it. SECURITY.md says what is in scope for a
report; this note says what a report would show broken. VOCABULARY.md names every key and its
encrypted form.

Each guarantee names the code that keeps it and, where there is one, the test that checks it. A
guarantee changes only with a Coach's ruling and a changeset. A guarantee a reader finds broken is
a bug: report it, do not amend the guarantee. **Changing any file named under *Where the
guarantees are kept* means reading *The guarantees* first and checking the change against them.**

Last verified against the code 2026-10-27, on `main` after #302, with
[#305](https://github.com/mrflip/safebyok/pull/305) applied; the access points, G5 and G8 amended
2026-10-28 for [#316](https://github.com/mrflip/safebyok/pull/316) and the aead_narrow thread.

## Where the guarantees are kept

Ten files hold every line of code that touches a secret: the old core's six, and the four of the
`models/` that build the same constructions. A change to one of them is a change to these
guarantees until shown otherwise.

| File | What it keeps |
|---|---|
| `packages/safebyok/src/crypto.ts` | every call into WebCrypto: key makers, import, HKDF, wrap, unwrap, cipher, decipher, randomness, ctx |
| `packages/safebyok/src/proving.ts` | the passphrase and PRF answer made into a wayinKey; every wrap and unwrap of the vaultKey under one; the lease grant |
| `packages/safebyok/src/lease.ts` | the leaseKey and the vaultKey wrapped under it; every cipher and decipher of a box; `CachedLease`, the store's edge, which holds a lease record read back closed |
| `packages/safebyok/src/gating.ts` | the chains that carry a passphrase or an answer from the host's dialog to a proving |
| `packages/safebyok/src/box.ts` | the whisper serialized, sealed, opened and zeroed |
| `packages/safebyok/src/types/types.ts` | the `leaseRecord` and `whisper` checks, which say what a stored leaseKey and a whisper are |
| `packages/safebyok/src/models/proving.ts` | the wayinKey, and the vaultKey unwrapped per call and moved from proving to proving inside `makeWayin(source)`, handed only to `Lease.grant`; the PRF bytes, spent in a `finally` |
| `packages/safebyok/src/models/lease.ts` | the leaseKey handle and the vaultKey wrapped under it, unwrapped per call in `#vaultKey`; every seal and unseal of a box's whisper; `evict` and `forget` |
| `packages/safebyok/src/models/gate.ts` | holds no key: wayin pickles and the vault's stamp; `Gate.build` hands the passphrase proving back to the listing, which drops it after the birth lease |
| `packages/safebyok/src/models/box.ts` | holds no key: hands the lease the bytes and stamps and gets bytes back; zeroes the opened bytes in a `finally` |

Beside them, three host functions hear the passphrase and are guarded where they are called:
`keyDeriver.deriveKeyBytes` (`proving.ts`, `deriverThrewRefusal`), `strengthChecker`
(`passphrase-strength.ts`, `guardStrengthChecker`) and `requestCleartext` (`vault-opts.ts`,
`guardRequestCleartext`). Each guard hands what it caught to `HostErrorSanitizer.refusalFor`
(`host-error-sanitizer.ts`), the one function that stands a refusal in for a foreign throw, and it reads
nothing of it. The `DeviceDB` (`device-db.ts`, `idb.ts`) stores the leaseKey opaque, and what a
store throws is replaced at `deviceTrouble` (`device-db.ts`), which keeps nothing of it (G8).

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
(scope, `vault_tok`, `registered_at`, and for a wayin its `format`), a purpose string unique to
the kind of field, and the record's own visible header or stamp. So a wrap or a ciphertext moved
to another vault, slot, box, lease or purpose does not open, and a visible field altered in
storage (a sidecar, a salt, a deadline) makes its record refuse to open.

## Bytes, handles, and the three stores

Three layers hold key material, and the words for each matter.

* **Bytes** are a `Uint8Array` in JavaScript memory. Any code holding a reference can read or copy
  them. safebyok zeroes every array of secret bytes it holds once it is done with it, and holds
  such an array only as a local.
* **A handle** is a `CryptoKey`: an object WebCrypto (`crypto.subtle`) hands back whose material
  lives inside the browser's crypto implementation. Code holding a handle can *use* it, for the
  usages it carries, and can read its bytes only if it was made `extractable`. A non-extractable
  key's bytes are never observable from JavaScript, by anyone, including the code that made it.
  `crypto.ts` is the only module that calls `crypto.subtle`.
* **IndexedDB** keeps a `CryptoKey` by structured clone: the handle survives a page load, its
  material still inside the browser, never as bytes JavaScript sees. The one key safebyok stores
  this way is the leaseKey (`idbDeviceDB.putLease`). No other key is ever written anywhere: not to
  IndexedDB, not to the host's VaultDB, which receives only ciphertext and visible fields. The
  wayinKey (the strong key) in particular lives only as a handle in a `Proving`, for one gating,
  and is never persisted.

So for the strong key the minimal path is: the deriver's bytes, or the authenticator's, exist until
`passphraseKeyOf` or `PasskeyProving.seal` has imported them into a non-extractable handle and
zeroed them; the handle exists in `Proving.#wayinKey` until the proving is dropped; nothing of
either is ever stored. Outside the core, `safebyok-react`'s `bytesOf` copies the browser's PRF
result into the answer and zeroes the buffer it copied from, so the answer's bytes are the one copy.
Its dialogs try an answer at once or zero it untried, never keeping one for a hidden dialog to show
again, and zero it once its one attempt is done (`attemptOnce`).

## The secret values

Eight values are secret. Everything else safebyok stores or shows is either public or
*visible*: readable where it lies, authenticated by the ctx that binds it, and never secret.

| Value | Form | Where it may exist | For how long | Who touches it |
|---|---|---|---|---|
| passphrase | JS string | function arguments and locals of one gating's chain; the host's dialog | the call | the gating chain, `PassphraseProving.seal`, `passphraseKeyOf`; the host's `keyDeriver`, `strengthChecker` and dialog |
| passkey PRF answer | `Uint8Array` in the host's `PasskeyAnswer` | the answer object, until its attempt spends it: `PasskeyProving.seal` zeroes it, or `spendAnswer` an attempt that never sealed it | one attempt | `PasskeyProving.seal`, `spendAnswer`; the host's `askPasskey` |
| passphraseKey bytes | the deriver's `Uint8Array` | a local in `passphraseKeyOf`, zeroed after import | one import | `passphraseKeyOf`; the host's `keyDeriver` |
| wayinKey | `CryptoKey`, non-extractable, `wrapKey`/`unwrapKey` | `Proving.#wayinKey` | the proving, which lives for its gating's chain | `Proving` |
| vaultKey | `CryptoKey` | locals only; stored only wrapped | one method | `Proving`, `Lease` |
| boxKey | `CryptoKey` | locals only; stored only wrapped | one cipher or decipher | `Lease` |
| leaseKey | `CryptoKey`, non-extractable, never bytes | a `LeaseRecord`: in `Lease.#record` and `CachedLease.#record`, through the `DeviceDB`, and at rest in the device store | the lease | `Lease`, `CachedLease`, `Proving.grantLease`; the `DeviceDB` stores it opaque |
| whisper | the host's JSON value, then its UTF-8 bytes | the host's value in and out; bytes as locals, zeroed | one seal or open | `Box.seal`, `box.extractWhisper`, `Lease` |

Not secret, by design: every salt (`salt_b64`, `prf_salt_b64`), a passkey's `credential_id`,
`device_id`, `key_deriver_label`, every label and `user_id` (a scope name; a host that counts its
user ids sensitive digests them before they reach safebyok), `vault_tok`, every epoch,
`registered_at` and `ask_passphrase_at`, a box's sidecar (visible, authenticated, never
encrypted), and every wrap and ciphertext. The snapshot shows no salt and no wrap, so an offline
guess has nothing to start from (README, *The passphrase and the passkey*).

## Access points, value by value

For each secret: the code that holds its naked value (the string, the bytes, or an extractable
handle), and the code that operates on it as a non-extractable handle without ever holding its
bytes. Everything not listed never sees the value. Private methods are named with their `#`.

**Passphrase.** Naked: the host's dialog (`safebyok-react`'s `passphrase-modal.tsx` and
`gating-modal.tsx` hold what was typed in component state) → `gating.attempt`,
`attemptPassphrase` (`gating.ts`, `attemptOf`, `#attempt`) → `checkText`, `checkTexts`,
`checkFirstGate`, `checkNewPasskey` (shape only) → one chain: `#initializeGate`,
`#unlockByPassphrase`, `#changePassphrase`, `#putPasskey`, `#delPasskey`, `#delVault`;
`#strengthUnder` → `vault.tryCheckStrength` → `guardStrengthChecker` → the host's
`strengthChecker`; `PassphraseProving.seal` → `passphraseCleartext.parse`,
`checkedPassphraseHeader` (its `trim`) → `passphraseKeyOf` → the host's
`keyDeriver.deriveKeyBytes` (`argon2idDeriver`'s, or `safebyok-fastkey`'s `deriveWithWasm`).
Operates on it without holding it: nothing; a passphrase has no handle form.

**Passkey PRF answer.** Naked: `safebyok-react`'s `createPasskey`, `askPasskey` → `answerOf`,
`bytesOf` (a copy of the authenticator's result) → the host → `gating.attempt`,
`attemptPasskey` → `checkedPasskeyAnswer` (`passkeyAnswer`, `isAllZero`),
`checkFreshSalt`, `checkNewPasskey` → `#initializeGate`, `#unlockByPasskey`, `#putPasskey` →
`PasskeyProving.seal` → `deriveWrappingKey` (`subtle.importKey` as HKDF input, then
`subtle.deriveKey`), and `prfBytes.fill(0)`; or, for an attempt that never sealed it,
`spendAnswer` (`gating.ts`: `passkeyAnswer.safeParse`, then `prfBytes.fill(0)`). In
`safebyok-react`, `PasskeyUnlockButton` and `GatingModal`'s `put_passkey` form hand it on at once
or zero it untried (`useWhenShown`'s `isShown`), and `attemptOnce` zeroes it after its attempt.

**passphraseKey bytes.** Naked: `keyDeriver.deriveKeyBytes` → `passphraseKeyOf`
(`isSharedMemory`, `isAllZero`, the length check) → `importWrappingKeyBytes`
(`subtle.importKey`), then `keyBytes.fill(0)`.

**wayinKey.** Never naked: non-extractable from `importWrappingKeyBytes` or
`deriveWrappingKey`. Held: `Proving.#wayinKey`, set in the constructor. Operates: `wrappedWith`
(`wrapKeyUnder`), `#unwrap` (`unwrapKeyUnder`) through `checkWayin`, `resealWayinFor` and
`grantLease`; `PassphraseProving.sealWayins`.

**vaultKey.** Naked, as an extractable handle in a local: `makeVaultKey` in `sealWayins`;
`#unwrap` with `RewrapUsage` in `resealWayinFor` and `grantLease`, handed to `wrappedWith`
(`wrapKeyUnder`) and `sealLeaseRecord` (`wrapKeyUnder` under the leaseKey). Operates, as a
non-extractable one-usage handle in a local: `checkWayin` (`#unwrap`, `CheckUsage`);
`Lease.#vaultKeyOrNull` in `cipheredWith` (`wrapKey`) and `decipherWith` (`unwrapKey`), handed to
`#openedOrNull`.
Stored only as `vault_key_wayin_wrapped` (VaultDB) and `vault_key_lease_wrapped` (DeviceDB).

**boxKey.** Naked, extractable in a local: `makeBoxKey` in `Lease.cipheredWith`, wrapped by
`wrapKeyUnder` and used by `cipherBytes`. Operates, non-extractable `decrypt` only:
`unwrapKeyUnder` in `Lease.#openedOrNull`, for `decipherWith`, used by `decipherBytes`. Stored
only as `box_key_wrapped`.

**leaseKey.** Never naked, never bytes. Made: `makeLeaseKey` in `sealLeaseRecord`, called by
`Proving.grantLease`. Carried, as the `lease_key` of a `LeaseRecord`: `grantLease` →
`DeviceDB.putLease` (`idb.ts` `set`, structured clone; `memoryDeviceDB`'s map; the
`device-db.ts` guard) → `Lease.make`, in `grantLease` → `Lease.#record`, the Lease the vault is
handed to hold; read back by `CachedLease.tryGet` (`lease.ts`), which checks `DeviceDB.getLease`'s
answer and holds it closed in `CachedLease.#record` for `bank.ts`'s birth read, `vault.#loadFromStorage`
(`#applyVault`, whose `leavesInForce` reads the cached stamp alone), `#takeUpFromPantry` and `#takeUpAtBirth`,
which take it up with `cached.leaseOn(vault)` → `Lease.make`; erased by `DeviceDB.delLease` from
`vault.#lockNow`, `del-damaged-vault.ts` and the bank. Neither the Vault nor the Bank holds a
record. Operates: `Lease.#vaultKeyOrNull` (`unwrapKeyUnder`) alone.

**whisper.** Naked: the host → `vault.putBox`, `tryPutBox` → `#checkWhisperFits`
(`whisperBytesOf`, zeroed) → `#sealAndPutBox` → `Box.seal`, `trySeal` → `checkedWhisper`
(`whisper`, a `structuredClone`) → `whisperBytesOf` (`stableJsonify`, `TextEncoder`) →
`lease.sealProps`, `trySealProps` → `cipheredWith` (`cipherBytes`), bytes zeroed in both.
Out: `vault.getWhisper`, `tryGetWhisper`, `useWhisper` → `box.extractWhisper`,
`tryExtractWhisper` → `lease.decipherWith` (`decipherBytes`) → `TextDecoder`, parse, zero →
the host, or its `useWhisper` callback. `mask` (`safebyok/utils`) reads one to show a whiff of it.

## The guarantees

**G1. A passphrase is never a field.** Inside the core a passphrase is only ever a function
argument or a local: the gating's `attempt` hands it to its chain (`gating.ts`, `attemptOf`), the
chain to `PassphraseProving.seal` and `vault.tryCheckStrength`, `seal` to `passphraseKeyOf`, and
that to `keyDeriver.deriveKeyBytes`. No class, record, snapshot or closure that outlives the call
holds it; the one comparison of two passphrases is `current === next` in `change_passphrase`,
both typed by the same user. Three host functions hear it: the dialog that collects it, the
`strengthChecker` and the `keyDeriver`. *Caveat:* a JavaScript string cannot be zeroed, so copies
live until collected, and the React dialog holds what was typed in component state until it
closes. Kept by: `gating.ts` (chains), `proving.ts`. Checked by: `rg` for a field or record
holding one finds none.

**G2. The strong key's bytes are locals, zeroed; its handle is non-extractable.** The deriver's
output is a view over the deriver's own buffer, imported non-extractable with `wrapKey`/
`unwrapKey` only, and zeroed in a `finally`, imported or refused (`passphraseKeyOf`,
`importWrappingKeyBytes`). A passkey's PRF bytes are zeroed in `PasskeyProving.seal`'s `finally`,
whatever happens, so an answer is single-use, and one handed in again is refused `bad_option` by
its all-zero bytes (`checkedPasskeyAnswer`). An attempt that never seals the answer it was handed
zeroes it too (`spendAnswer`): one refused before the seal, after the gating is over, while
another attempt runs, or when a lock lands first. Only a refusal the user can correct leaves it
unspent, for the host to hand in again or zero. The models hold to the same rule: each export
that takes cleartexts runs through `spendAnswerAfter` (`models/proving.ts`), which spends the
answer unless the export refused as `isCorrectable` says, a kind in `correctableKindVals`
(`models/models-shapes.ts`); an answer that derived a key is spent all the same, so a
'wrong_passkey' from a key that does not open the wayin (`Proving.attempt`) leaves it spent, as
the core's `seal` does; a call that joins an unlock in flight spends its answer untried
(`models/vault.ts`, `#joinUnlocking`); and `attemptPasskey` on a gating whose kind a passkey does
not prove spends it (`models/gating.ts`). `spendPrfBytes` zeroes bytes by the tag the checker
tests (`isBytes`), so PRF bytes made in another realm are zeroed too. *Caveat:* that zeroing is
then the host's; `safebyok-react`'s dialogs do it (`attemptOnce`), and never keep an answer for a
hidden dialog to show again. The passkeyKey is HKDF-SHA256 of those bytes, its
`info` the wayin's whole ctx, derived non-extractable (`deriveWrappingKey`). The result, the
wayinKey, is not a local: it is `Proving.#wayinKey`, private, for the proving's life, and no
method returns it or a vaultKey (`proving.ts` header). Bytes refused before import: anything but
32 bytes, 32 zero bytes, and shared memory. Checked by: `tests/proving.test.ts`,
`tests/wayin.test.ts`, `tests/gating.test.ts` (*a passkey's answer handed to an attempt*);
`tests/models/proving.test.ts` (*another realm*), `tests/models/gating.test.ts` (*the passkey
path*).

**G3. The vaultKey is never stored naked, and never persisted as a handle.** It exists (a) as an
*extractable* local where WebCrypto requires it to be wrapped: fresh in `sealWayins`
(`makeVaultKey`), and unwrapped `RewrapUsage` in `resealWayinFor` and `grantLease`. An extractable
handle yields its bytes to anyone holding it, so each is dropped at the end of its method and
crosses no boundary: those methods return a `Wayin`, a `Lease` or a wrap. (b) As a
*non-extractable* local with one usage: `checkWayin` (`CheckUsage`), and `Lease.#vaultKeyOrNull`
for each cipher or decipher, which keeps nothing between calls. The pantry holds the vaultKey
only as `vault_key_lease_wrapped`, ciphertext bytes under the leaseKey; there is no handle to a
naked vaultKey anywhere at rest, and no cache of one in memory. Kept by: `proving.ts`,
`lease.ts`. Checked by: `tests/lease.test.ts`, `tests/proving.test.ts`.

**G4. The leaseKey never has bytes.** It is generated non-extractable (`makeLeaseKey`) and exists
only as a `CryptoKey` handle: a local in `sealLeaseRecord`; the `lease_key` of a `LeaseRecord`
written by `DeviceDB.putLease` (IndexedDB keeps it by structured clone) and read back by
`CachedLease.tryGet`, which holds it closed until a Vault object takes it up; and `Lease.#record` in
memory for the lease's life, dropped at its
`ask_passphrase_at`, at `lock()`, when it proves damaged, or when the Vault object goes, and
erased from the store at `lock()`. A record read back whose key is extractable, of another
algorithm, or for another use reads as `corrupt_record` (`isLeaseKey`, `types.ts`). *Caveat:*
non-extractable stops export, not use. Whoever holds the handle in this page can unwrap the
vaultKey, extractable. So the `DeviceDB`, which is host-pluggable and is handed every lease
record, is inside the trust boundary, as the host already is (SECURITY.md, *What is outside
safebyok's protection*). Kept by: `lease.ts`, `idb.ts`, `types.ts`. Checked by:
`tests/lease.test.ts` (*makes its leaseKey non-extractable*, *refuses a leaseKey that is
extractable*).

**G5. A boxKey is a local.** Fresh and extractable only to be wrapped, in `Lease.cipheredWith`;
unwrapped non-extractable, `decrypt` only, in `#openedOrNull` for `decipherWith`; dropped at the
end of each.

**G6. The whisper's bytes are zeroed; its value is the host's.** `putBox` validates the host's
value and takes a `structuredClone` (`whisper`), serializes it (`whisperBytesOf`), and zeroes the
bytes once ciphered, refused or not (`Box.seal`, `Lease.cipheredWith`, and the sizing copy
in `#checkWhisperFits`). `extractWhisper` decodes the deciphered bytes, parses them, zeroes them,
and hands the parsed value to the host. A `Box` holds its record, ciphertext, never a whisper.
*Caveat:* the JSON value itself cannot be zeroed; `mask` from `safebyok/utils` is how to show one.

**G7. The set of secrets is closed.** The eight values above are the secrets. A new one, or a new
form of one (a cache, a copy in a snapshot, a key kept between calls), is a design change that
amends this note first.

**G8. No secret reaches a refusal, a log, or a thrown value.** A `VaultError` carries none in its
message, `cause`, `meta` or any property (`errors.ts`); no refusal interpolates anything but a
kind, a limit, a field name, or the `name` of an error it replaces (`thrownNameOf`, `errors.ts`: a
DOMException's or an Error's class name such as `QuotaExceededError`, or whatever name a host's own
device store gave its error, kept by the device-store conditions and `crypto_failed` until a redact
lands; the Coach, 2026-10-28). Every validator's refusal quotes no input: `tests/validators.test.ts`,
*no refusal repeats its input*, hands each one a marked key and value and finds the marker in no
message, stack, meta or cause. The three host functions that hear the passphrase have their throws
replaced by `HostErrorSanitizer.refusalFor`, never kept as a `cause`: `deriverThrewRefusal` (kind only,
logged), `guardStrengthChecker` (nothing), `guardRequestCleartext` (kind only, logged). A WebCrypto
failure is caught and replaced, its error never kept: `wrongProof`, `damaged_lease` and
`damaged_box` where a wrong key or an altered record explains it, and `crypto_failed`
(`Lease.cipheredWith`) for a key made, wrapped or a cipher under fresh keys that failed all the
same, which keeps the error's `name` alone. Each such catch holds only WebCrypto calls, their ctx
built before it (`Proving.#unwrap`, `Lease.#vaultKeyOrNull`, `Lease.#openedOrNull`, the cipher step
of `Lease.cipheredWith`), so a bug in building the ctx never reads as a wrong proof or a damaged
box. A device-store failure's cause never crosses to the host: `deviceTrouble` (`device-db.ts`)
keeps neither what the store threw nor its message, only its `name`, as a `DeviceDB` is handed
every lease record and the logger hands a condition to the host whole (`tests/device-db.test.ts`,
*keeps nothing of a store's throw that quotes the record*). `unexpectedError` keeps a foreign throw
as `cause` only where the thrower heard no secret. The invariant at the one catch that ends each
Lease and Box throwing form (`refusalOf`, `outcome.ts`) is checkable by reading what can reach it: a
refusal (passed as itself), the vault's demand, or a bug's own throw from this package's lines;
never WebCrypto's error, a host function's throw or the device store's, each replaced before it
gets there. The Vault and Bank forms map a bug in their `try` form. The logger hears messages, a story bag of kinds and calls, and `VaultError`s;
`Proving.toJSON`, `Lease.toJSON` and `Wayin.toJSON` show no key material, and a lease that will
not read is warned of without its record. *Host obligation, documented:* a `strengthChecker`'s
`reason` becomes the `weak_passphrase` message, so it must not quote the passphrase
(CUSTOMIZATION.md).

**G9. Only `Proving` and `Lease` hold or use a key.** `src/proving.ts` and `src/lease.ts` are the
only modules that import `wrapKeyUnder`, `unwrapKeyUnder`, `cipherBytes`, `decipherBytes` or a
key maker. The wayinKey lives only in `Proving.#wayinKey`; the leaseKey only in `Lease.#record`,
`CachedLease.#record` and the record at rest. Neither the Vault nor the Bank holds a lease record:
`Proving.grantLease` makes the Lease the vault holds, and `CachedLease.tryGet` (`lease.ts`) checks what
`DeviceDB.getLease` hands back at the store's edge and holds it closed, so the bank's birth read,
the vault's refresh (`#loadFromStorage` and `#applyVault`, whose `leavesInForce` reads the cached stamp) and its take-ups
(`#takeUpFromPantry`, `#takeUpAtBirth`) carry a `CachedLease` and take it up with `leaseOn(vault)`
([#305](https://github.com/mrflip/safebyok/pull/305)). A `Box` reaches the Lease through the
module-private `heldLeaseOf` and is given cipher and decipher services, never a key; a proving
reaches the vault's tools through a package-private route (the Symbol-keyed accessor
`vault[provingTools]` from [#311](https://github.com/mrflip/safebyok/pull/311) on, the module-private
`registerProvingTools` before it), which hands it `putLease` and `holdLease`, not a key: what that
route reaches is no key and yields none. Neither class has a getter, field, spread, JSON or Symbol
that yields a key, and no module exports a route to one: `leaseRecordOf`, which did, is gone
([#305](https://github.com/mrflip/safebyok/pull/305)). The entry points export `Lease` and
`Proving` as types and classes alone, and none of the registries. Checked by:
`tests/lease.test.ts` (*hands out no record*), `rg` for the crypto imports.

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
* *A memory-hard, labelled, salted derivation.* Argon2id (`@noble/hashes`, or hash-wasm in
  safebyok-fastkey) under a stored `key_deriver_label` whose spec is fixed (`Argon2idWebV1`: 64 MiB,
  3 passes, 1 lane, 16-byte salt, 32-byte key); a fresh random salt per wayin; a wayin under
  another label refuses `unknown_key_deriver`, so there is no silent downgrade; a deriver wearing a
  supplied label must carry exactly its parameters (`Bank.make`).
* *Randomness* from `crypto.getRandomValues` and `subtle.generateKey` alone (`randomBytes`,
  `randomId`, the key makers).
* *No secret is compared.* A wrong passphrase or passkey is learned from the AEAD tag failing to
  verify in `unwrapKey`, never from comparing key bytes.
* *Strict validation on read.* A stored record that fails its schema reads as damaged or absent and
  is never partly used; before 1.0.0 no older shape is read (CLAUDE.md).
* *A static vaultKey.* No rotation yet: removal is not revocation; a vault made anew has a new
  `vault_tok`, which voids every box (README, VOCABULARY *rotation*).

## Open items

Each is a Coach's call; none breaks a guarantee above.

1. **`vaultRecordHeldBy`** (`src/proving.ts`) is a test-only export of the shape `leaseRecordOf`
   had, but hands out ciphertext and headers, no key: it breaks no guarantee. Listed so a reader
   does not mistake it for one. It reads through the proving-tools route, the Symbol-keyed
   accessor from [#311](https://github.com/mrflip/safebyok/pull/311) on, which changes no guarantee:
   what the accessor reaches is no key and yields none. The held-lease registry stays a WeakMap,
   as a test of the Vault object's surface asserts no `Lease` is reachable from it without a method call.
2. **The exposed whisper** (`src/models/box.ts`, `Box.expose` and `box.whisper`) is a whisper
   kept on the instance, a new form of a secret, which G7 says this note names first: the models' `Box` holds
   it after `expose` until the host sets `box.whisper` null, and keeps it while the vault locks,
   answering `LOCKED` in its place until it unlocks. It is the host's decision, which a host would
   otherwise make for itself without the guard. "whisper is unsafe by design and its
   implementation may change as we tune its unsafeness" (the Coach, 2026-10-31). The core's `Box`
   of G6 holds no whisper; the models are not yet exported.
