# gating_proving: preplan

**No back-compat layer, no migrations, no catering to vestigial names or methods.** Old records
fail safe (read as absent or damaged), and each changeset says what a host will see.

Branch `20261021-gating_proving`, cut from `20261021-trust_lines` (stacked on it; it has no PR
yet). `20261018-reformx` and its `vault2.ts` spike never merge to main: read the spike for the
Coach's intent, take nothing from it by cherry-pick.

The base already has, from trust_lines: `vault_key_epoch` gone from every record, expectation and
ctx; the vaultKey held only by an opened Lease, which owns `wrapBoxKey`/`unwrapBoxKey`; Box, Wayin
and Lease taking the vault they are of.

## Why

The names and concerns among Wayin, Proof, Lease and Vault are soupy; Vault holds slots for
semi-coordinated named wayins; and the passphrase crosses the public surface five times
(`vault.unlock`, `putWayin`, `delWayin`, `ask.attempt`, the `Attempter`) and lives as a string in
a `PassphraseProof` from parse until a late derivation.

## Rulings so far (Coach, 2026-10-21)

- **Crypto gravity.** Everything that smells of a secret, or of key and wrap, to the security
  reviewer or the duffer, lives in Proving or Lease, even at the price of feature envy. Lease
  wraps and unwraps boxKeys and ciphers the whisper; Box keeps its fields.
- **The line between Proving and Lease** is what keeps a key and wrapping in an instance field or
  method: Lease does, a Proving holds its derived key only for its gating. A Proving does the
  grant's work.
- **The naked vaultKey never crosses a class boundary.** The Proving unwraps it, makes the
  leaseKey, wraps the vaultKey under it, and pours the leaseKey and the wrapped vaultKey straight
  into the new Lease. Lease never asks for a naked vaultKey.
- **`unlock_epoch` becomes `gate_epoch`**: bumped on every addition, removal or change of a wayin,
  and what voids every other device's lease. `vault_key_epoch` is gone (trust_lines, 1d3cb29e);
  per-device invalidation is a later pass.
- **Names:** `Gate`, `Gating`, `Proving` (was Proof). Gatingkinds `unlock_vault`, `new_vault`,
  `change_passphrase`, `add_passkey`, `del_passkey`.
- **No renew kind.** A lease inside the staleness window counts as locked: the call raises an
  `unlock_vault`, and declining cancels the call. `lease_ending` and `carry_on` go.
- **The Gating controls the flow.** The dialog calls `gating.attempt(...)` and
  `gating.decline()`; the gating settles itself. A landed lock makes it drop its provings.
- **No capability split.** The library offers no probabilistic advice: a device's passkey support
  is not known with certainty ahead of a create, so no gatingkind encodes it. Revisit only if a
  certain signal exists.
- **Never store a passphrase**, wrapped or not. The lease is the stored capability.

## The model

| Class | Lifetime | Owns | Secret held |
|---|---|---|---|
| `Proving` | one gating | one entered secret, turned into a non-extractable wayinKey at once; opens a wayin, seals a new one, grants a lease | its wayinKey |
| `Gating` | one dialog | the provings of one attempt to get in, matched against the gate; `gatingkind`, `attempt`, `decline`, `lockLanded`, one at a time | its provings, until it settles |
| `Wayin` | durable (VaultDB) | one stored way in: fields, header, ctx, `isDamaged`, summary | none (the wrap) |
| `Gate` | durable (VaultDB) | the gathering of one identity's wayins: the passphrase and passkey slots, the policy (one passphrase, at most one passkey, passphrase first, the last one stays), `gate_epoch` | none |
| `Lease` | durable (pantry) | the leaseKey and the vaultKey wrapped under it, `ask_passphrase_at`; the one holder of the vaultKey; box key wrap and unwrap, whisper cipher | leaseKey, opened vaultKey |
| `Box` | durable (VaultDB) | its fields, sidecar, ctx | none |

Success of a gating earns a new or changed wayin, or a lease.

## Provings: the cleartext's life is one call

- **Passphrase.** The salt is always known when the user types: the passphrase wayin's own for
  `unlock_vault` and as the current passphrase, a fresh one for a chosen passphrase. The proving
  is made by deriving at once (key deriver, then a non-extractable import, bytes zeroed, as
  `passphraseKeyOf` does today); it holds the wayinKey, never the string. A chosen passphrase is
  put to the strength checker in the same call.
- **Passkey.** The PRF answer is imported as a non-extractable HKDF key at parse, and the bytes
  are zeroed. The wayinCtx is the `info` at `deriveKey`, as now.
- **Still seeing the cleartext, by their nature:** `KeyDeriver.deriveKeyBytes`,
  `StrengthChecker.check`, and the host's own dialog. JS strings cannot be wiped: we shrink our
  copies, not the host's.
- **A proving is bound to the salt it was derived over.** If another device changes the
  passphrase between derive and use, the proving opens nothing: refuse it as a reason to ask
  again, not as `wrong_passphrase`. *(Exact refusalkind open.)*
- Wayin's `tryOpen` and `seal` move to the Proving; `VaultKeyPair` goes.

## Guesses, with arguments each way

- **How a fresh lease gets its opened vaultKey.** (a) The Proving pours leaseKey, wrap, *and* a
  non-extractable vaultKey handle into the Lease; (b) the Proving pours only leaseKey and wrap,
  and the Lease opens its own vaultKey through the same unwrap a lease read from the pantry uses.
  (b) gives one path for fresh and stored leases and costs one AES unwrap; (a) skips the unwrap
  and passes a key, if a non-extractable one, across the boundary. Leaning (b).
- **Who raises a change gating.** If every cleartext enters through `gating.attempt`, the vault's
  calls take none: `putWayin('passphrase')` raises a `change_passphrase` gating to the host's
  hook, `putWayin('passkey')` an `add_passkey`, `delWayin('passkey')` a `del_passkey`. One door
  for cleartext, at the price of a settings page reaching the hook, not a form of its own.
  Alternative: the calls take provings the host made (`vault.prove(typed)`). Leaning one door.
- **Gate in storage.** The gate's fields stay flat in the vault props (`passphrase`, `passkey`,
  `gate_epoch`), and `Gate` is the class over them; a nested `gate` field buys nothing yet.
- **`new_vault` with a passkey.** The passkey is optional to the user. A create that comes back
  without the PRF answer is refused for that passkey, and the vault is made on the passphrase
  alone. Whether that is one gating or a `new_vault` then an `add_passkey` is open.

## Names still open

- **The host's hook** (today `getProof`). The Coach wants it redolent of "the user's secret is in
  the clear here", with the pair `hostX` (as given) and `guardedX` (ours, catching throws and
  holding one at a time). Proposed: `requestCleartext` (`hostRequestCleartext`,
  `guardedRequestCleartext`); second choice `requestSecrets`.
- The refusalkind of a proving overtaken by a gate change.
- `gating.attempt`'s argument per gatingkind: one shape with optional fields, or one per kind.

## Threads (first guess at the split)

1. **gate_epoch**: `unlock_epoch` renamed in core, every adapter (Postgres columns, Convex
   validators, GraphQL schema), records and ctx; the vault props, lease and mark formats bump.
   Rename only, no behaviour.
2. **proving**: `Proof` becomes `Proving`, derived at the door; passkey bytes imported and zeroed
   at parse; `tryOpen` and `seal` move off Wayin; the Proving grants the lease as ruled;
   `VaultKeyPair` goes. Wayin is record only.
3. **gate**: the slots and the policy come off Vault into `Gate`; changes return a new Gate with
   `gate_epoch` bumped.
4. **gating**: `Ask` becomes `Gating` with `gatingkind`, `attempt`, `decline`, `lockLanded`; the
   hook renamed; `lease_ending`, `carry_on` and the renew path go; vault calls stop taking
   cleartext (if the one-door guess stands).
5. **react**: the dialogs dispatch on `gatingkind`, one per kind; `passphrase-modal`,
   `passkey-unlock-button`, `attempt-refusals`, `messages` follow.
6. **docs**: README, VOCABULARY (Gate, Gating, Proving, gatingkind, gate_epoch), the Contract,
   and `notes/old_vocabulary.md` (Proof, Ask, AskWhy, ProofAnswer, getProof, unlock_epoch,
   lease_ending, carry_on). Each security decision goes to `notes/security.md` in its own
   thread's PR, through the subagent.

## Later, not here

- **One-time recovery.** Another way in multiplies the gating paths; evaluate it late, once the
  five kinds stand.
- A device-capability split, only if a certain signal exists.
- Per-device invalidation.
- Argon2id in SubtleCrypto (a WICG draft, not widely shipped): once it is, a passphrase could be a
  non-extractable key from the input handler on.
