# Thread B4: put_wayin (2026-10-19)

Branch `20261019-put_wayin`, PR pending, stacked on #207 (`slots`). Justify: not yet run.

Built in YOLO to the section below, written before the build as the plan's B4 row asks. Its
drift from the Contract tab is listed under *Open matters*.

## The Contract section, as built

### vault.putWayin(proof, newProof)

```typescript
vault.putWayin(proof: string, newProof: string | PasskeyAnswer): Promise<Outcome<Vault>>
// a new passphrase replaces the passphrase; a passkey's answer puts the passkey, replacing the one standing
```

Works locked or unlocked: the standing passphrase is proof enough. For a passkey, make it first
(`createPasskey(...)` in `safebyok-react`), then hand its answer here: the call holds no UI.

**Does**

1. Validates the inputs. Synchronous; the only refusals before any await: `proof` is the
   standing passphrase as text; `newProof` is a new passphrase as text, or a passkey's answer
   over a fresh salt of 32 bytes.
2. Puts a new passphrase to the `strengthChecker`, before any key derivation.
3. `hello()`, then reads the vault props as storage holds them now, as `attempt` does.
4. Proves `proof` against the vault's passphrase: one key derivation.
5. Seals the new way in around the vaultKey: a passphrase under a fresh salt (one more
   derivation), a passkey under its answer. Stamped with this device and the clock.
6. VaultDB: `putVaultProps`, one conditional write of the vault props with the new way in and
   `unlock_epoch` moved on, expecting the props step 4 proved against.
7. Raises this device's mark and grants this device a lease from now. Neither refuses: the change
   has landed, and a failure here goes to the logger; the vault then asks at its next open.

**Guarantees**

- Only the standing passphrase proves a change. A passkey unlocks, but never changes a way in.
- Nothing is written unless the vault props proven against are the ones standing.
- Every other device's unlock lapses: `unlock_epoch` moved, so each asks at its next `hello()`.
- No box is rewritten: the vaultKey is unchanged. So a replaced passphrase or passkey still
  opens a copy of the vault props taken before; replacing is not revoking.
- The passphrases are never stored or logged, and the passkey's answer is not kept.

**Returns** `{ ok: true, val: vault }`, unlocked under the new way in, its lease starting now.

**Refuses**

- *Fix the code:* `bad_option` (a `proof` that is not text, a passkey's answer among it; a
  `newProof` of neither shape; an answer over anything but a fresh 32-byte salt; a strength
  checker answering no verdict), `unknown_key_deriver`, `vault_closed`; `unexpected_error` when
  the strength checker or the key deriver throws, carrying nothing of what it threw.
- *Show in place, ask again:* `wrong_passphrase` (the standing passphrase did not open the vault,
  or is blank); `weak_passphrase` (the new one, the checker's reason the message; a blank one
  too).
- *The state already says it:* `absent_vault`: there is no vault yet; the first unlock makes it.
- *Nothing to retry:* `damaged_wayin`, the passphrase stored damaged: nothing can prove a change,
  so the vault is to be removed and made again.
- *Read again, then decide:* `stale_write`: another device changed the vault between step 3 and
  step 6. Nothing was written; a passkey made for the call stays on its authenticator, a way into
  nothing.
- *Try again later:* `storage_unavailable`.
- *Bad news, told to `onBadNews` and returned:* `damaged_vault`, `rolled_back`,
  `identity_revoked`, `newer_format`, as `hello()` returns them.

### vault.delWayin(proof)

```typescript
vault.delWayin(proof: string): Promise<Outcome<Vault>>   // the passkey only: the passphrase stays
```

**Does**

1. Validates `proof`, the standing passphrase as text. Synchronous.
2. `hello()`, then reads the vault props as storage holds them now.
3. Refuses `absent_wayin` when the vault has no passkey, before any key derivation.
4. Proves `proof` against the vault's passphrase: one key derivation.
5. VaultDB: `putVaultProps` with `passkey: null` and `unlock_epoch` moved on, as `putWayin` does.
6. Raises this device's mark and grants it a lease from now, as `putWayin` does.

**Guarantees** as `putWayin`'s, and that the passphrase is never removed. Removing the passkey
stops it opening the vault from here on; it cannot take back what it opened before, nor a copy of
the vault props taken before.

**Returns** `{ ok: true, val: vault }`, unlocked, with no passkey.

**Refuses** as `putWayin` does, but for `weak_passphrase`, and:

- *Nothing to do, the state already says it:* `absent_wayin`, no passkey to remove (it may have
  been removed on another device).

### Vault.make: `strengthChecker`

```typescript
strengthChecker?: (passphrase: string, scope: VaultScope) => PassphraseVerdict | Promise<PassphraseVerdict>
type PassphraseVerdict = { strong: true } | { strong: false, reason: string }
```

Optional. The checker's contract is to answer a verdict, good or bad. It runs on every new
passphrase: the one the first unlock creates the vault with, and each `putWayin` sets. Left out,
the default refuses every passphrase as too weak, and logs once per vault, through the host's
logger, that the customer must choose a checker (CUSTOMIZATION.md, *Pluggable Passphrase
Strength Checker*). `safebyok/browser` exports `zxcvbnStrengthChecker`, which `browserOpts()`
supplies. A throw from the checker is `unexpected_error`, naming it, carrying none of the thrown
value's kind, meta or cause; an answer that is no verdict is `bad_option`.
