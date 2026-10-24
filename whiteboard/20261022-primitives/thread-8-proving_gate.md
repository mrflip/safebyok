# Thread 8: proving_gate (2026-10-23)

Branch `20261023-proving_gate`, PR [#260](https://github.com/mrflip/safebyok/pull/260), stacked on
#259. Justify: green at each pushed commit (core 1779 -> 1804 `it(` cases). Fifteen retired tests,
each with its ruling, in `tests-retired.md` (thread 8's rows).

**Status:** ready. Primitives built and today's paths rewired through them; `proof.ts` and
Wayin's `seal` / `tryOpen` removed, their tests ported to `proving.test.ts` and `wayin.test.ts`.

* **Built**:
  * `src/proving.ts`: `Proving` (abstract), `PassphraseProving.seal` / `PasskeyProving.seal(vault,
    header, cleartext, { gating? })`, the header the current wayin's (`headerOf(record)`) or
    `{ slotlabel }` for a fresh one whose salt, `device_id` and `registered_at` seal mints;
    `wrappedWith`, the private `#unwrap`, `checkWayin()`, `sealWayins(passkeyProving?)`,
    `resealWayinFor(newProving)`, `grantLease()`; `isCarriedBy(vaultProps)`; `passphraseKeyOf`
    (moved from `proof.ts`), `checkedPasskeyAnswer`, `checkFreshSalt`. A Proving holds its vault,
    slotlabel, header, stamp (scope, `vault_tok`, `gate_epoch` at seal), gating and wayinKey.
  * `src/gate.ts`: `Gate.make(vault, { base, passphrase, passkey })` (epoch base + 1, `base_epoch`
    recorded), `Gate.of(vault, props)` (the stored gate), `isHeldBy`, `storedFields`.
  * `vault.ts`: `#putGate(gate, call)` (demand on the gate; `putVaultProps` expecting `vault_tok`
    and the base epoch; demand after, failures included; picture; device record raised);
    `#gateWriteRefusal`; `#provingOf`; `#unlockCreating` and `unlock()`, an ask's attempt,
    `putWayin()`, `delWayin()` all call the primitives in the spec's order. `#grantLease`,
    `#reviseWayins`, `#unwrapWith`, `#draftGate`, `#settleUnlock`, `#demandGranting` are gone.
  * The demand takes a Proving (header carried by the gate's wayin at its slotlabel, or the gate
    unchanged since a fresh one was sealed; then `gating_landed`) and a Gate (its base in hand, or
    itself held).
  * `vault.checkStrength` / `tryCheckStrength`. New kind `gating_landed` (condition).
  * Wayin is record only; `VaultKeyPair`, `WayinStamp`, `wayinKeyFor`, `Wayin.seal`, `tryOpen`,
    the unused `sessionKey` unwrap are gone.

* **Decisions taken**:
  * **The gating placeholder**: `ProvingGating = { readonly landed: boolean }`. An ask's attempt
    binds its provings to the Ask's `#over` signal (lands on a lock, an answer or a decline);
    `unlock()`, `putWayin()`, `delWayin()` bind to `StandingGating`, which never lands, keeping
    today's contract that a `lock()` does not stop them. Thread 9 replaces both with the gating.
  * **A fresh proving's demand**: its header is in no gate until the gate carrying it is stored,
    so until then it asks that the gate it was sealed under still stands (`gate_epoch` equal).
  * **`grantLease`'s demands**: step 5 demands on the proving and on the stamp the lease record
    names (the gate captured at step 1); step 7 on the proving and on the stored record's stamp
    (scope, `vault_tok`, `gate_epoch`), never asking the record for a lease (audit 1).
  * **"We sign all immutable fields"**: already so. The wayin ctx is `cipherCtx('safebyok-vault-v6',
    applabel, user_id, vaultlabel, vault_tok, purpose, header)`, the header every visible field:
    `wayinkind`, `device_id`, `registered_at`, and `key_deriver_label`, `salt_b64` (passphrase) or
    `credential_id`, `prf_salt_b64` (passkey). No ctx change, no stored change.
  * **Passkey bytes** are zeroed in `PasskeyProving.seal`'s `finally`, whatever happens: a host
    hands a fresh answer per call (tests updated where one answer was reused).
  * **`checkStrength` runs before the seals**, sequentially, keeping today's "weak before any
    key derivation"; the spec's parallel junction is thread 9's to take.
  * **`checkPassphrase` stays** beside `checkStrength`: React's modal reads its verdict live.
  * **`seal` takes `{ gating }` as a trailing option**, after the cleartext: the spec's
    three-argument shape has no place for the gating. Thread 9 may move it.
  * **A write refused with another `vault_tok` standing** (or none) makes the Vault object gone,
    `vault_remade` / `vault_gone`, as a refresh finding it does (ground rule 18).
  * **A proving's stamp is not enumerable** (`decorate`, as the Box's stamp): readable for the
    demand, but a spread, JSON or a log line shows only its slotlabel, as its doc says.
  * **`wrappedWith` returns a `Ciphered`** (the record's wrap object), not a string.
  * `Wayin.make` keeps `(vault, vaultTok, record)`; `#putGate` stays private (thread 9's
    `gating.ts` will need it reachable); provings reach the vault's inside through
    `registerProvingInside`, as boxes reach the lease through `heldLeaseOf`.
  * The lease-expiry TODO ("only the passphrase proving, or some parent, should have the lease
    expiry"): weighed, not built; the lease length is still the vault's `leaseMillis`.

* **Deviations / refusals where today coped** (ground rule 17, for toldjaso):
  * An ask's attempt overtaken by a lock or the prompt's end refuses `gating_landed`, where it
    refused `vault_locked`.
  * `putWayin()` / `delWayin()` whose `putVaultProps` lands as the vault is deleted or made anew
    elsewhere refuse `vault_gone` / `vault_remade` (they resolved; nothing was unlocked either way).
  * A gate change refused by storage after this device heard of another device's change refuses
    `gate_moved`, where it refused `stale_write`; one not yet heard of still refuses `stale_write`.
  * `putWayin` unwraps the vaultKey extractable twice (reseal, then grant), each confined to one
    method; it was once.

* **Contract lines made untrue**: getProof's "attempt refuses: vault_locked" (now
  `gating_landed`); putWayin's "Refuses: stale_write" (also `gate_moved`); unlock/putWayin's "a
  passkey's answer" may be reused (now zeroed); the Proof and Wayin.seal / tryOpen rows.

* **Discoveries**: `vault.demandConsistentWith` distinguishes a Proving and a Gate by
  `instanceof` in `#inconsistencyWith`; `Gate.isHeldBy` was needed so a stored gate taken by a
  late read passes while another device's gate at the same epoch does not.

* **For the Coach**: the placeholder gating, the fresh-proving demand rule, and `seal`'s
  trailing `{ gating }` are guesses for thread 9 to confirm or flip.
