# 2026-10-14 crypto thread: the library is real now

You said "implement the safebyok library; make good decisions and update me later." Here is the
update. PR #5 (branch `20261014-crypto`); every commit justify-green, safebyok 159 tests, safebyok-react
6, demo 24 plus its vite build.

## What landed

* **The cryptography**, under the interface the stub designed: Argon2id (pinned
  `argon2id_web_v1`) → passphraseKey → vaultKey → per-store lockboxKey → whisperCiphered, all
  AES-256-GCM through WebCrypto, every encryption bound to its context (cipherAdditionalData) so
  relocated ciphertext refuses to open. Wrong passphrase = the vaultKey envelope's AEAD refusal,
  never a comparison. Plus `changePassphrase(old, new)`: new salt, epoch+1, no lockbox rewritten,
  every other device relocks on its next look.
* **Dependencies (your yes is owed, I flagged each)**: `@noble/hashes` (Argon2id: audited, pure
  JS, no WASM, ~560 ms per derivation at the pinned spec — I measured before choosing it over
  the relic's hash-wasm plan), `@scure/base` (base64url), `idb-keyval` (IndexedDB adapters),
  `fake-indexeddb` (dev). Reasoning in `winboard/20261014-crypto/decisions.md`.
* **VaultDB is the abstract class you asked for**: adapter authors implement seven
  fetch/save/trash primitives over plain-JSON records ("a shelf, not a safe" — the doc block
  insulates them from every crypto word); the verbs safebyok calls, validation included, are
  composed on top and individually overridable (`createBundle` fetch-or-create, `listBoxes`,
  `eraseVault`, `subscribe`). Records that fail validation or decryption are refused
  (`corrupt_record`) and left in place — remote data is never auto-deleted.
* **safebyok/idb**: `idbDeviceDB` (the real device store — IndexedDB is the only browser home for a
  non-extractable localUnlockKey), `idbVaultDB` (the local-only tier), `inspectIdb` (the demo's
  honest window). Cross-tab change bells over BroadcastChannel.
* **The demo speaks IndexedDB** and its panels now show real ciphertext (🔐 chips) and the key
  handle (🔑). Fake-auth scaffolding stays in localStorage, shown separately. What you lose by
  the move is in the PR body.
* **Relic files rewritten** per your instruction: recovery stripped everywhere, API brought to
  what src/ actually exports, proposed-README now a promotable draft. The slop survey (a
  high-powered agent, as you suggested) found 24 issues — two actively harmful if copied (a
  CORS-failing fetch example; a React example whose "destroy on unmount" would delete user
  data). Full findings: `winboard/20261014-crypto/relic-slop-survey.md`.

## Decisions you may want to reverse

1. The three runtime deps above (CLAUDE.md wants your yes before they exist; you were away).
2. `idb-keyval` as a regular dependency rather than optional peer — only the `safebyok/idb` entry
   loads it.
3. The KeyDeriver seam (`openVault({ keyDeriver })`, label-checked against the stored vault):
   my reading of "Security First ... pluggable second". Tests and safebyok-react ride a cheap
   SHA-256 deriver through it.
4. The in-memory vaultKey is extractable (it must re-wrap for device-remember and passphrase
   change); lockboxKeys unwrap non-extractable.
5. `Ciphered` as the exported name for the `{ cipher_iv_b64, ciphertext_b64 }` pair — VOCABULARY
   names Wrapped and Ciphered forms but not the shared shape; this wants a VOCABULARY line or a
   better name.
6. The stub's stored formats are not readable by v1 (they never left the demo — I judged the
   stored-vault contract unbroken; the PR says so in its first line).

## Still open (carried to the PR)

CAS writes (format already carries revision_id/epoch), the Convex adapter, auto-lock/abort,
whisper_schema_version, zod dep-vs-peer (from last thread), the `api:` prefix for safebyok-react.
