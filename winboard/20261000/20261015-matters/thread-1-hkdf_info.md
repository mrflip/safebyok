# Thread 1: hkdf_info (2026-10-15)

Branch `20261015-hkdf_info`, PR [#97](https://github.com/mrflip/safebyok/pull/97), cut from main
at `c4c070f`. Justify: green, every package (core 968 tests; indexeddb 104, postgres 156, react
71, convex 276, graphql 153, argon2-wasm 44, demo 124, root 123). `pnpm size` within every
budget.

* **Built**: the Coach's "make everything verifiable", as a sweep of every derivation and cipher
  binding in `packages/safebyok/src`.
  - `envelope.ts`: a passkey's HKDF `info` is now its wrap's whole additional data (format,
    scope, `vault_id`, the bundle's `registered_at`, purpose, the envelope's public header), not
    `[format, purpose, credential_id]`. Every envelope's wrap binds the bundle's `registered_at`
    too. The seal functions take a `BundleIdentity` (`vault_id`, `registered_at`; a whole
    `VaultBundle` is one) in place of a `vaultId`; `tryUnwrap` takes the binding and the wrap.
  - `vault.ts`: a lockbox's two encryptions bind its whole public header (every field but the two
    ciphered ones, so `note`, `registered_at`, `changed_at`, and any field added to the schema
    later); `store()` builds the header first, then encrypts. The remembered unlock binds
    `ask_passphrase_at`, under its own format tag `safebyok-unlock-v1` (it borrowed the bundle's).
  - `crypto.ts`: a record part of `cipherBinding` may hold an undefined field, left out as JSON
    leaves it (an absent note and an undefined one, as IndexedDB keeps it, bind alike).
  - Tests: the passkeyKey's construction pinned (HKDF with the full binding as `info` opens; the
    old vaultless `info` does not), `registered_at` tampering for both envelope kinds and through
    the vault, a lockbox's note, times and revision altered in storage, and a remembered deadline
    moved an hour either way. Each new test fails against main's code (checked by stashing `src/`).
  - `notes/security.md`: one new entry (the sweep, and what stays unbound and why), placed after
    the passkey entries, where the gripes line adds nothing; one-line pointers on five older
    entries that the sweep made untrue. `VOCABULARY.md`: the passkeyKey and cipherAdditionalData
    rows. The IndexedDB and Postgres READMEs say why a record must round-trip exactly.
* **Decisions taken**:
  - **HKDF `info` = the AAD bytes.** The Coach's ruling named `vault_id` and the scope; binding the
    whole envelope context (header included) costs nothing more, since the AAD already forces a
    rewrap on any header change, and leaves no field to argue about. Same bytes to different
    primitives (HKDF info, GCM AAD) is sound.
  - **Lockbox: whole header, not more positional parts** -- roadmap 3's "first decision", so a
    future field is bound the day it is added. Scope and `vault_id` stay positional (the record
    does not hold them).
  - **Device record and envelopes: explicit parts.** The device record's are built from what the
    vault expects (its scope, the bundle's `vault_id` and epoch), not from the record, so a record
    moved to another scope still fails its AEAD as well as the scope check (security.md promised
    this). An envelope's scope is the vault's own too, but its `vault_id` and `registered_at` are
    the stored bundle's: the bundle is the record being verified.
  - **Bundle: only the immutable fields** (`vault_id`, `registered_at`) go into envelopes.
* **Left unbound, with the reason in `notes/security.md`**: the bundle's `unlock_epoch` and
  `unlocks` list (each envelope's key is its own way in's; a change to one must not rewrap the
  rest); the passphraseKey's Argon2 derivation (salt fresh per envelope and bound in the wrap;
  binding further would push Argon2 associated data through the host-pluggable `KeyDeriver` seam
  and `safebyok-argon2-wasm`, for no added check); the PRF salt (random, already bound);
  ciphertexts and IVs (the tag covers them).
* **Deviations**: none from the plan. The test "reads a remembered deadline of exactly FarFuture
  as unlocked, under Infinity hours" edited a stored deadline, which now fails as it should; it
  became the "deadline moved an hour either way" pair. The FarFuture edge stays covered by "writes
  the clamped deadline to the device, ... and a reopen picks it up".
* **Discoveries**:
  - The gripes line (#90's stack) rewrites `vault.ts` from a pre-envelope base, and its #93 /
    host `validators` touch the lockbox note. On the restack: `boxBinding` now takes a
    `LockboxHeader`, and if `validators` widens the note's type past `string`,
    `CipherBindingPart`'s record values need widening to match. Its `store()` over a damaged box
    builds a fresh lockbox: it must build the header first, as `store()` here does.
  - A tampered bundle (`registered_at`, or any envelope field) reads as `wrong_passphrase`, as
    header tampering did before: the user hears "check for typos". Not new, but now reachable by
    one more field.
  - Every development vault written before this stops opening (passphrase refused as
    `wrong_passphrase`); `destroy()` needs no unlock, so a host can clear one. The changeset says
    so.
* **For the Coach**: the Argon2 associated-data reason (above) is a judgment call: say if you want
  the passphraseKey's derivation bound too, and it becomes a `KeyDeriver` interface change. A
  tampered `registered_at` (or any envelope field) reads as `wrong_passphrase` or `wrong_passkey`,
  not `corrupt_record`: the AEAD cannot tell a wrong proof from an altered bundle (going to the
  Coach as a matter).
* **Review's minor leftovers** (thread-reviewer, no change made): `CipherBindingPart` accepting
  `undefined` also silently drops a field set to undefined by mistake; the lockbox format tag is
  bound twice (the leading tag and the header's `format`), harmless.
* **For thread 4 (TODO.md)**: roadmap 3's "Every field the library writes is in the binding" is
  built for the lockbox (whole header) by this thread; the `whisper_codec` and `public` bag
  reservations remain, and will be bound automatically when added to the schema.
