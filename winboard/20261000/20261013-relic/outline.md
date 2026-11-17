# safebyok — design outline

The relic that seeded this project, rewritten (2026-10-14, crypto thread) to describe the
interface as built. `src/` is the signature authority: where this document and the code disagree,
the code has moved on and this page needs the edit. What remains here is the *why* behind the
shapes, for the next design conversation.

The original relic's recovery-kit machinery (mnemonics, bip39, recovery envelopes) is stripped by
ruling of the Coach. Its schema registry, principal plumbing, branded label types, and
five-state status union were not adopted; `outline-with_user.md` records what survived of the
identity discussion.

## The shape of the thing

- **Key deriver:** Argon2id via `@noble/hashes` (audited, pure JS, no WASM), pinned spec
- **Encryption and key wrapping:** WebCrypto `crypto.subtle`, AES-256-GCM
- **Device persistence:** IndexedDB via `idb-keyval` (`safebyok/idb` entry point)
- **Validation:** plain Zod

VaultDB stores only encrypted records. The passphrase derives the passphraseKey, which unwraps a
random vaultKey; the vaultKey wraps per-lockbox lockboxKeys. VOCABULARY.md's "Which key opens
which" block is the canonical diagram.

The vaultKey layer earns its place in one sentence: changing the passphrase re-wraps the small
vaultKey and rewrites no lockbox.

## Pinned keyDeriverSpec

`argon2id_web_v1`: Argon2id, 64 MiB (65_536 KiB), 3 passes, 1 lane, 16-byte salt, 32-byte key —
`Argon2idWebV1` in `src/key-deriver.ts`. There is no caller-selected algorithm or parameter set.

What the implementation added beyond the relic: the *deriver* (not the spec) is a seam.
`openVault({ keyDeriver })` defaults to the pinned Argon2id deriver; a vault stores its deriver's
`key_deriver_label` and refuses to unlock under any other (`unknown_key_deriver`). The seam exists
for tests (a cheap SHA-256 stand-in) and for a host with a vetted native Argon2id — never for a
different recipe. This is CLAUDE.md's "implement the strong thing first, make it pluggable
second".

Measured: ~560 ms per derivation in V8 at the pinned spec, via `argon2idAsync` (yields to the
event loop, so a browser unlock doesn't freeze the page). The relic's Web Worker + WASM plan
(hash-wasm) stays available as a future deriver substitution if half a second ever hurts.

## Stored records (the formats are a contract)

All in `src/types.ts`; every binary field is base64url text with a `_b64` suffix, so records are
plain JSON and any backend holds them as-is. Underbar_case throughout — the relic's camelCase
stored fields (`vaultId`, `createdAt`) were a style violation it did not survive.

- **VaultBundle** (`safebyok-vault-v1`): scope (applabel, user_id, vaultlabel), `vault_id`,
  `passphrase_epoch`, `key_deriver_label`, `passphrase_salt_b64`,
  `vault_key_passphrase_wrapped`, timestamps. Decrypting the wrap IS the passphrase check —
  there is no separate verifier field, and a wrong passphrase is learned from AEAD refusal,
  never a comparison.
- **Lockbox** (`safebyok-lockbox-v1`): `boxlabel`, `revision_id`, `lockbox_key_wrapped`,
  `whisper_ciphered`, public `note`, timestamps. Every store mints a fresh lockboxKey and
  revision_id.
- **DeviceUnlock** (`safebyok-unlock-v1`): scope, `vault_id`, `passphrase_epoch`, the
  **non-extractable** `local_unlock_key` CryptoKey handle, `vault_key_local_wrapped`,
  `expires_at`. No JSON form — structured clone (IndexedDB) or memory only.

### cipherAdditionalData

Every encryption binds its context; ciphertext moved between apps, users, vaults, boxes or
revisions refuses to open. Encoded as a JSON array (`stableJsonify`), so parts can never smear
together:

```text
['safebyok-vault-v1',   applabel, user_id, vaultlabel, vault_id, passphrase_epoch, 'vault_key_passphrase_wrapped']
['safebyok-vault-v1',   applabel, user_id, vaultlabel, vault_id, passphrase_epoch, 'vault_key_local_wrapped']
['safebyok-lockbox-v1', applabel, user_id, vaultlabel, vault_id, boxlabel, revision_id, 'lockbox_key_wrapped']
['safebyok-lockbox-v1', applabel, user_id, vaultlabel, vault_id, boxlabel, revision_id, 'whisper_ciphered']
```

`revision_id` is minted per write and bound into both lockbox encryptions. The relic wanted it as
a compare-and-swap token too; CAS has not landed (see Open edges).

## Storage seams

**VaultDB is an abstract class** (`src/vault-db.ts`): an adapter author implements seven small
`fetch`/`save`/`trash` primitives against plain JSON records — a shelf, not a safe — and the
verbs safebyok calls (`readBundle`, `listBoxes`, `createBundle`, `eraseVault`, `subscribe`) are
composed on top, validation included. Each compound documents its default composition; a backend
that can do better (atomic create, projected list, push subscription) overrides that one method.
This replaced the relic's flat interface after the Coach's ruling: do the work for the adapter
author, and keep them out of the library's operation.

Records are validated on every read; a record that fails, or that names a different scope or
boxlabel than asked for, is refused (`corrupt_record`) and **left in place** — remote data is
never repaired or auto-deleted. (The one exception is device-local: a remembered unlock that no
longer opens is dropped, and the user types the passphrase again.)

**DeviceDB stays a small interface** (`readUnlock`/`writeUnlock`/`eraseUnlock`/`eraseAll`): safebyok
ships the two that matter, `idbDeviceDB` (IndexedDB, the real one) and `memoryDeviceDB` (tests,
and anywhere without IndexedDB). The relic's capability flags, active-principal markers and
localUnlockKey-management methods dissolved into the DeviceUnlock record itself.

## The vault surface

`src/vault.ts` is the authority. The relic's `BYOKVault.findOrCreate` + `initialize` +
`status()`/`refresh()`/`list()`/`remove()`/`rotateLockbox()` surface became:

- `openVault(opts)` — reads, never prompts, never creates; settles into
  `opening → absent | locked | unlocked` (remembered unlock permitting)
- `getSnapshot()`/`subscribe()` — `useSyncExternalStore`-shaped; summaries ride the snapshot
- `unlock(passphrase)` — creates on an absent vault (racing creators settle via `createBundle`
  and the loser's passphrase must prove itself against the winner's bundle), opens otherwise
- `changePassphrase(old, new)` — new salt, epoch+1, vaultKey re-wrapped, lockboxes untouched;
  every other device's unlock lapses on its next look
- `store`/`read`/`use`/`erase` — unlocked-only; `use` scopes the whisper to a callback
- `destroy()` — deletes everything, deliberately without requiring unlock (an authenticated
  owner can always delete their own rows server-side; pretending otherwise is false comfort)
- `close()` — releases the handle, forgets nothing stored

Errors are `VaultError` with snake_case `kind`s (`src/errors.ts`), not the relic's PascalCase
codes. The relic's `stale`/`corrupted`/`destroyed` states dissolved: epoch drift just relocks
(the UI sees `locked`), corruption throws `corrupt_record` from the operation that met it, and a
closed handle refuses with `vault_closed`.

## Open edges (carried forward, not designed here)

* **Compare-and-swap writes.** `revision_id` and `passphrase_epoch` are stored and bound, so a
  CAS-checking backend needs no format change; the seam and the conflict `kind` don't exist yet.
* **A Convex adapter** — the first real proof of the abstract-VaultDB shape.
* **Auto-lock** (tab hidden, idle) and an abort signal for a long derivation.
* **whisper_schema_version** (VOCABULARY names it): deferred until read() has a channel to hand
  it back through; adding an optional stored field later reads old records fine.
