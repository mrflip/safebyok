# Thread S: seams (2026-11-01)

Branch `20261101-seams`, PR #439, stacked on #437 on the restacked line (main → #426 → #427 →
#428 → #429 → #430 → #431 → #433 → #435 → #432 → #434 → #436 → #437), cut from the local
`v6line/devicedb` (b7812b65). Justify: green (safebyok 5159 passed, 37 skipped; every package
green; no size budget moved). Empty changeset: nothing under `src/models/` is exported yet, and
the deriver's refusals keep their kind and sentence.

* **Built**:
  * `Vault` keeps `#asking` and drops `#gatings`: gatings take turns, so at most one asks.
    `#dropLease` (lock and let-go) declines `#asking` through the new `Gating.declineAtLock()`,
    which settles it as `lockedWhileAsking()` (kind `declined`, its sentence now "while this
    prompt was open or waiting its turn"), nulls `#asking`, and empties `#launches`.
  * Every launch carries the `lockSeq` it launched at (`#launchInTurn` reads it; `#launchGating`
    no longer takes one). `#askInTurn`, at its turn and after its `fetch`, refuses
    `lockedWhileAsking()` where a lock or let-go landed since: queued launches of every kind are
    declined, not only the unlock (which used to refuse `lockedWhileUnlocking`, 'vault_locked').
  * A queued `unlock_vault` finding `#lease` in force at its turn returns without asking;
    `#unlockByGating` then answers `demandLease()`.
  * `#askInTurn`'s `finally` deletes its `#launches` entry only when no lock landed since its
    launch (the `#unlocking` idiom): a lock has emptied the map, and the entry may be a later
    launch. So a gated call after a lock never joins the dying launch.
  * `Gate.passkeyHeader` is `omit(passkey_wayin, ['vault_key_wayin_wrapped'])` (es-toolkit) of
    the wayin `gateProps` just checked, not a second parse. `Gating`'s declares realigned;
    `passkeyHeader` docs trimmed to "for `askPasskey`"; `#askInTurn`'s doc names `fetch`.
  * `reservedLabel(prefix)`, `suppliedSpecChanged`, `saltDoesNotFit` live in
    `helpers/refusal-funcs.ts` § *Key derivers*, through `listedRefusal` (all `bad_option`).
    `reservedLabel` takes the prefix rather than refusal-funcs importing `deriver/shapes`.
  * `checkKeyDeriver`'s doc says it trusts its argument to be a `KeyDeriver` in shape.
  * notes/guarantees.md G2: "or spent, where the gating closes before the call answers".
  * Tests: `gating.test.ts` (`declineAtLock`); `vault-lock.test.ts` (lock message, a waiting
    `replace_passphrase` declined, a call after the lock asks afresh though the declined gating
    still runs an attempt, the fetch-race test now expects 'declined'); `vault-gate.test.ts` (a
    waiting unlock asks nothing once a lease is taken up). Each new test fails on the base.

* **Decisions taken**:
  * A sibling method, `declineAtLock()`, over `decline(refusal?)`: the host never picks the
    refusal its gated verb throws, and there is nothing to validate.
  * Queued launches refuse `declined` (as the gating a lock declines), so a lock's refusal of
    any gating not yet attempting is one kind; 'vault_locked' stays for an unlock whose attempt
    a lock overtakes (`#unlockByProof`). `ensureUnlocked`'s doc already says so.
  * The lockSeq check stays after the turn's `fetch` (one check, covering a lock during the
    fetch); a lock that landed before the turn costs one needless fetch.

* **Discoveries**:
  * The README's refusal table still speaks of the legacy vault; nothing here touches it.

* **For the Coach**:
  * `declineAtLock` is public on `Gating` (a `#` method cannot be reached from `Vault`); harmless
    for a host to call, and not exported until the models are.
