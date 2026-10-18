# Thread 3: the envelope becomes the wayin (2026-10-18)

Branch `20261018-wayin`, PR [#161](https://github.com/mrflip/safebyok/pull/161), stacked on [#160](https://github.com/mrflip/safebyok/pull/160)
(line main → #159 → #160 → this). Justify: not yet run. Nothing renamed yet: **blocked** on the
question below, which the handoff told me to stop on.

## Blocked: renaming the wayin's stored fields changes its ctx bytes

The handoff: "If a cipher context today includes a field *name* or the format tag string as
bytes, renaming it would change ciphertext: stop and report." It includes both.

`packages/safebyok/src/envelope.ts`, `binding()`, is every wayin's ctx (and, for a passkey, its
HKDF `info` too):

```ts
cipherBinding(BundleFormat /* 'safebyok-vault-v2' */, applabel, user_id, vaultlabel,
  vault_id, registered_at, PurposeForMethod[header.method], header)
```

`cipherBinding` is `TextEncoder(stableJsonify(parts))`, and `header` is the whole stored wayin
but its wrap, so its **field names** are bytes of the ctx: `method`, `unlock_id`, `unlocklabel`
(renamed by the map to `wayinkind`, `wayin_id`, `wayinlabel`), beside the unchanged
`vault_key_epoch`, `device_id`, `registered_at`, `key_deriver_label`, `salt_b64`,
`credential_id`, `prf_salt_b64`. The first part is the vault's format tag, which this thread
bumps to `safebyok-vault-v3`. (The purpose strings `vault_key_passphrase_wrapped` and
`vault_key_passkey_wrapped` are constants, not field names; nothing obliges a rename, and I
would keep them under any answer.)

Precedent: `6acb67d2` (the v1 → v2 bump) moved `BundleFormat` in the ctx with the record's tag
in the same commit, and added header fields, so changed the bound bytes, with a security note.

* **A (recommended): let the bytes follow the names.** The construction is unchanged -- the same
  parts in the same order, the whole header, the record's own format first -- only the
  spellings differ. No v2 vault is read after the bump (it fails safe as damaged), so no
  existing ciphertext ever has to open under the new ctx; the byte change has no consequence the
  format bump does not already have. This is what VOCABULARY.md already says ("format ... is also
  the first part of the ctx"; `wayinCtx` is "its whole header"). A `notes/security.md` entry,
  via a `sonnet` subagent, says so.
* **B: freeze the bytes.** `binding()` translates back to the old spellings (`method`,
  `unlock_id`, `unlocklabel`) and keeps `'safebyok-vault-v2'` as its first part. Ciphertext
  identical for records no one reads, at the cost of a name-translation table in the crypto path
  that a reviewer must check, a ctx naming fields and a format the record no longer has, and a
  contradiction of VOCABULARY.md.
* **C: keep the wayin's stored names this sprint** (rename in code only). Contradicts the name
  map and VOCABULARY.md, and the tag bump still moves the ctx's first part unless also frozen.

**The same question recurs later in the sprint**: the lockbox ctx (`vault.ts`, `boxBinding`) is
`LockboxFormat` plus the whole lockbox header (`public_json` → `sidecar_json`, `revision_id` →
`revision_tok`), and the lease ctx (`localBinding`) begins `'safebyok-unlock-v1'` (→
`safebyok-lease-v1`) and ends with the purpose `'vault_key_local_wrapped'`. One ruling should
cover threads 3, 5, 6 and 7.

## The plan, once answered (for whoever resumes)

All mechanical; under B only `binding()` differs.

* Core `src/`: `git mv envelope.ts wayin.ts` (and its test), star-imported as `Wayin`.
  `types.ts`: `UnlockEnvelope`/`PassphraseEnvelope`/`PasskeyEnvelope` → `Wayin`/
  `PassphraseWayin`/`PasskeyWayin`; `UnlockMethod(Vals)` → `WayinKind(Vals)`, stored `method` →
  `wayinkind`; `unlock_id` → `wayin_id`, `unlocklabel` → `wayinlabel`, `vault_key_wrapped` on a
  wayin → `vault_key_wayin_wrapped` (`prior_vault_key`'s keeps its name); `unlocks` →
  `wayins`; `UnlockSummary` → `WayinSummary`; format `safebyok-vault-v3`. `UnlockProof` →
  `Proof`; `EnvelopeHeader`/`EnvelopeStamp` → `WayinHeader`/`WayinStamp`; `absentUnlock` →
  `absentWayin`; `removeUnlock` → `retireWayin`; the `unlockId` option → `wayinId`;
  `passphraseKey`/`passkeyKey` → `wayinKey` only where it wraps or unwraps the vaultKey;
  `FirstUnlocklabel` → `FirstWayinlabel`. `vault-db.ts`: `OlderBundleFormats` gains
  `'safebyok-vault-v2'` (so a v2 record reads as damaged, not `newer_format`), and `mayBeNewer`
  reads `wayins`/`wayinkind`. Refusal kinds `absent_wayin`, `damaged_wayin`, `last_wayin`,
  `too_many_wayins` in `errors.ts`, their messages, `refusal-policy.ts`, the README table.
  Untouched: `unlock()`, `lock()`, `addPassphrase`, `addPasskey`, `changePassphrase`,
  `MaxUnlocks`, every `*_epoch`, every `binding` name (thread 4).
* Adapters: postgres (columns, SQL), graphql (`SafebyokUnlockEnvelope` → `SafebyokWayin`,
  schema), convex (component validators), indexeddb; react (`VaultProvider`,
  `PassphraseModal`, passkey helpers; `PasskeyUnlockButton` keeps its name); `demos/`, `e2e/`,
  READMEs, `VAULTDB.md`, `notes/`, fixtures and snapshots.
* Changeset `minor`, every package that changes. Retirement grep per the handoff, quoted in
  the PR.
