# 20261014-crypto: the cryptography lands

The thread that retired the plaintext stub. Decisions made under the Coach's "make good
decisions and update me later", with the reasoning a reviewer would want.

## Dependencies (each needed a yes; the Coach was away — flag for review)

* **@noble/hashes** for Argon2id. Over hash-wasm (the relic's pick) because: formally audited
  (Cure53), zero dependencies, pure JS so it runs wherever the host does (React Native included,
  no WASM asset, no CSP wrinkle, no worker requirement), and measured fast enough — ~560 ms per
  derivation at the pinned 64 MiB × 3 in V8, via `argon2idAsync` which yields to the event loop.
  hash-wasm remains the upgrade path through the KeyDeriver seam if that ever hurts.
* **@scure/base** for base64url (`_b64` stored fields): same author and audit trail as noble;
  hand-rolling base64 is exactly the small-utility trap CLAUDE.md names.
* **idb-keyval** for the safebyok/idb adapters: ~600 bytes, ubiquitous, and IndexedDB's event-soup
  API is nobody's to hand-roll. Regular dependency rather than optional peer: it is loaded only
  through the `safebyok/idb` entry point, so a Node consumer never touches it, and an optional peer
  would make every browser app install it by hand. (Open question for the Coach.)
* **fake-indexeddb** (dev) to test the adapters under Node — it structured-clones a CryptoKey
  correctly, so even the non-extractable localUnlockKey round-trips in tests.

## Shapes

* **Stored records are plain JSON**; binary fields are base64url with `_b64` suffix
  (VOCABULARY's convention). This is the adapter-author kindness: any backend that holds JSON
  holds a vault, no bytes plumbing. Cost: ~33% size on ciphered fields — noise at API-key sizes.
* **cipherAdditionalData is a stableJsonify'd array** of context parts: deterministic, and parts
  can never smear together the way a string join would let them.
* **DeviceUnlock carries the localUnlockKey in the record** (one record, one read), not beside
  it as the relic had. The record has no JSON form — structured clone or memory only — which is
  what forced `localDeviceDB` (StringStore) out in favor of `memoryDeviceDB` + `idbDeviceDB`.
* **The vaultKey lives extractable in memory** while unlocked: unlock immediately re-wraps it
  for the device, and changePassphrase re-wraps it for the bundle. A lockboxKey is unwrapped
  non-extractable, decrypt-only, per read.
* **Creation races settle through `createBundle`** (fetch-or-create compound): the loser's
  passphrase must prove itself against the winner's bundle like any other unlock.

## The KeyDeriver seam

The spec is pinned; the *deriver* is `openVault({ keyDeriver })`, defaulting to the pinned
Argon2id. A vault stores its deriver's label and refuses unlock under any other
(`unknown_key_deriver`). Exists for tests (cheap SHA-256 stand-in; the suite would otherwise pay
64 MiB of Argon2 per unlock) and for vetted native substitutions — CLAUDE.md's "pluggable
second". The doc block says plainly that substituting is committing every user's vault to it.

## Rulings implemented from the relic survey

* **Preserve, don't delete**: `corrupt_record` refuses and leaves remote data standing; only a
  device-local remembered unlock is dropped on failure (costs one prompt).
* The relic's recovery kits are stripped everywhere, per the Coach.
* Relic rewrite notes and the full slop survey: `relic-slop-survey.md` beside this file.

## Carried forward (not built)

CAS writes (revision_id/epoch are stored and bound, so no format change needed), a Convex
adapter, auto-lock and abort signals, whisper_schema_version (needs a read-side channel first),
`navigator.storage.persist()` guidance in the demo.
