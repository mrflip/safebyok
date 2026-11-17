# Thread 2: unlock_envelopes (2026-10-15)

Branch `20261015-unlock_envelopes`, PR [#71](https://github.com/mrflip/safebyok/pull/71), stacked on #82 (gripe_fixes' top), in the line #82 → #71 → #76 → #73 → #78 → #74 → #77. Justify green: root 105,
core 759 (was 705), Convex 269 (was 265), React 28, demo 61; `pnpm size` within the raised limits.

* **Built**:
  - **The stored bundle** (`types.ts`): `key_deriver_label`, `passphrase_salt_b64` and
    `vault_key_passphrase_wrapped` are gone; `unlocks` is a list of 1 to `MaxUnlocks` (8)
    `UnlockEnvelope`s, a `Z.discriminatedUnion('method', [PassphraseEnvelope])`, with no
    `unlock_id` or `unlocklabel` twice (checked on read). `format` stays `safebyok-vault-v1`;
    `vault_id`, `passphrase_epoch`, `registered_at` and the scope are unchanged.
  - **Field names, for the adapters (thread 5 reads these).** The bundle is `{ format, applabel,
    user_id, vaultlabel, vault_id, passphrase_epoch, unlocks, registered_at }`. `unlocks` is plain
    JSON, strings and `Ciphered` objects only, for one jsonb column; each element is
    `{ method: 'passphrase', unlock_id, unlocklabel, key_deriver_label, salt_b64,
    vault_key_wrapped: { cipher_iv_b64, ciphertext_b64 } }`. Nothing a verb compares is in it.
  - **`src/envelope.ts`**, imported whole as `Envelope`: `sealPassphrase`, `openWithPassphrase`
    (tries each passphrase envelope in order, or the one `unlockId` names), `summarize`, and
    `VaultKeyPair` (moved from `vault.ts`). Internal; not exported.
  - **The vault** (`vault.ts`): `addPassphrase(passphrase, newPassphrase, { unlocklabel })` returns
    the new `unlock_id`; `removeUnlock(passphrase, unlockId)`; `changePassphrase(old, new,
    { unlockId? })` replaces only the envelope `old` opens, keeping its id and label;
    `unlock(passphrase, { unlockId? })`. All three changes go through one `reviseUnlocks` (refresh,
    cheap checks, proof, epoch + 1, versioned write, take up the unlock). The snapshot gains
    `unlocks: UnlockSummary[]` (`method`, `unlock_id`, `unlocklabel`), listed while locked.
  - **Errors**: `absent_unlock`, `too_many_unlocks`, `last_unlock`, all conditions; a taken
    `unlocklabel` is `bad_label`. README tables and `errors.ts` updated.
  - Convex validators and table (`PassphraseEnvelope`, `UnlockEnvelope = v.union(...)`, `unlocks:
    v.array(...)`), the field-for-field test taught arrays and unions; `TH.envelopeOf` beside a
    reshaped `TH.bundleOf`; React's empty snapshot; VOCABULARY (unlock, unlock envelope);
    `notes/security.md` (three entries); core README *Several passphrases*; changeset.
* **Decisions taken**:
  - **Every change needs a passphrase as proof, even unlocked.** The session vaultKey is
    non-extractable (a deliberate 2026-10-14 decision), so wrapping it under a new passphrase needs
    the extractable transient a proof unwraps. It is also the stronger posture: a walked-away
    unlocked screen cannot add a way in or strip the user's others. Removal takes a proof too, so
    this device's remembered unlock can be rewritten under the new epoch.
  - **The binding** is `[format, scope, vault_id, purpose-per-method, header]`, the header being
    the envelope minus its wrap, key-sorted (`cipherBinding` now takes a flat record part). The
    epoch is out: one envelope's change must not need the other passphrases. So a backend can
    splice an older envelope back in (security note). Purpose stays `vault_key_passphrase_wrapped`;
    a passkey's would be its own.
  - **Unlock cost**: unaimed, one Argon2id per passphrase envelope in list order, first success
    wins. Measured 570-620 ms per derivation (noble, Node 24), so 8 envelopes is ~4.8 s for a wrong
    passphrase. The cap is enforced on read, so a backend cannot raise it. `{ unlockId }` aims at
    one: a host with a picker pays one derivation.
  - **`MaxUnlocks = 8`**, one cap over every method. **Fresh salt per envelope**, never shared.
  - **`unlocklabel`** is a Label, unique per vault; the first envelope is labelled `passphrase`.
    There is no relabel verb (the label is bound into the wrap, so relabelling needs a proof).
  - **Mixed derivers**: envelopes by another deriver are passed over; `unknown_key_deriver` only
    when none is left to try (relevant once `kdf_configs` lets hosts choose configurations).
  - Format literal kept at `safebyok-vault-v1`, as earlier pre-1.0 reshapes did.
  - **After review** (the thread-reviewer's `ca94bf5`: an aimed `unlock` on a vault destroyed
    elsewhere created a new vault; now `absent_unlock`), two **YOLO calls of the orchestrator's**:
    an envelope whose `salt_b64` does not decode, or is not the deriver's `salt_bytes` long,
    refuses the unlock as `corrupt_record` before any derivation -- noble throws a plain Error under 8 bytes, which
    would otherwise escape and stop the search. And a blank proof passphrase is refused at once in
    `addPassphrase`, `removeUnlock` and `changePassphrase`, as `unlock` refuses one.
    *Deviation*: the decode check sits in `envelope.ts`, at unlock, not in the schema at read as
    asked: in the schema it pulled `@scure/base` into every entry (top-level zod schemas are kept
    by the bundler, unmarked pure), `idbDeviceDB` +1.1 kB and `browserOpts` +1 kB over budget.
* **Deviations**: the size budget rose (`openVault` 16.5 to 17.5 kB, everything 24 to 24.5 kB;
  measured 17.21 and 24.22). No `eslint-disable` or `ts-expect-error` added in `src/`; tests
  keep one `sonarjs/no-hardcoded-passwords` disable on a fake salt, as before.
* **Discoveries**:
  - **Thread 3 (passkey)**: add `PasskeyEnvelope` to the union and `UnlockMethodVals`, a purpose to
    `PurposeForMethod` in `envelope.ts`, its public fields to `UnlockSummary` (today a `Pick` of
    the passphrase member; make it a union) and `Envelope.summarize`. `openWithPassphrase` has a
    comment where non-passphrase envelopes must be filtered out (lint refuses the always-true
    check today). Adding a passkey "requires an unlocked vault" -- but it also needs the
    extractable vaultKey, so it needs a proof (a passphrase, or a passkey's PRF bytes), exactly as
    `addPassphrase` does. Generalize `reviseUnlocks`' proof rather than keep the vaultKey
    extractable.
  - **Threads 4-6**: any adapter test that builds a bundle by hand with
    `vault_key_passphrase_wrapped` or `passphrase_salt_b64` breaks on rebase; `TH.bundleOf` /
    `TH.envelopeOf` give the new shape. A Convex test padded `passphrase_salt_b64` to make a heavy
    bundle; it now pads the envelope's `salt_b64`.
  - The gripe_fixes sprint's hunks in `vault.ts` (`keyDeriverShape`, `LockboxFieldsBytes`, the
    two "pretending" comments) are untouched here; `rememberDevice` and `rememberedUnlock` lines
    changed only in their binding call (`localBinding`), which `vaultdb_validation` may also touch.
* **Restacked onto #82** (the Coach's word): gripe_fixes' `derivePassphraseKey` (refusing a
  deriver's output that is not 32 bytes) moved from `vault.ts` into `envelope.ts`, since every
  derivation now runs there; `addPassphrase` and `removeUnlock` take its `parsePassphrase` type
  check; the tests use `TH.expectRefusal`. The size budget rose again: everything 26, openVault
  18.5, idbDeviceDB 9.5, browserOpts 14.5 kB (the record schemas now reach the IndexedDB entry).
* **Open questions (minor, in the PR too)**: a taken `unlocklabel` refuses as `bad_label`
  (misuse) rather than a condition; envelopes of another deriver are passed over silently; small
  cleanups the review left.
* **For the Coach**:
  - The proof-for-every-change rule (above) departs from the plan's "adding requires an unlocked
    vault": confirm.
  - `passphrase_epoch` keeps its name (YOLO 2); `unlock_epoch` would now fit it better.
  - A Convex deployment holding old bundles refuses the new schema until those rows are deleted.
