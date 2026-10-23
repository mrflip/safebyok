# Thread 9: gating (2026-10-23)

Branch `20261023-gating`, PR (not yet opened), stacked on #260. Justify: not yet run whole.

**Status:** building. (a) core built and committed (local checkpoints): `src/gating.ts`, the
vault's `ensureUnlocked` / `putWayin` / `delWayin` / `del`, `requestCleartext`, the chains, the
pantry consult. Core tests being ported by two helpers (lease/demand/boxes/bank + a new
`tests/gating.test.ts`; races/wayins/del/storage/hello/twins/make). React src adapted minimally
(builds); React tests, demo tests, e2e not yet run.

* **Built**:
  * `src/gating.ts`: `Gating`, a union on `gatingkind` (six kinds), each with its typed attempt,
    `vault`, `decline()`, `lockLanded`; `RequestCleartext`; `RaisedGating` (the slot: settle,
    land, `attempt_in_flight`, the four correctable kinds left open, `gating_landed` after); the
    six chains; `GatingInside` (what a gating reaches of the vault: `freshen`, `putGate`,
    `delVault`, `afterDel`, `takeUp`, `badOutcome`, `request`).
  * `vault.ts`: `ensureUnlocked` / `tryEnsureUnlocked` (was `ensureLease`; `renewMinutes` > 0 and
    ≥ the lease refuses `bad_option`); `putWayin(slotlabel)`, `delWayin(slotlabel)`, `del()`
    raising gatings, joins by kind (`#gatingFor`); `#takeUpFromPantry` (the gating's first step);
    `#freshen` (hello at 0 through the join); `#delVault` / `#afterDel`; `unlock()` / `tryUnlock()`,
    `Ask`, `#takeUp`'s AbortController, `#standDownTakeUp`, `#discardLease`, `#grantAfterChange`,
    `#unlockCreating`, `#provingOf` gone.
  * `vault-opts.ts`: `requestCleartext` (guarded: a throw is `unexpected_error`), `getProof` gone.
  * `proving.ts`: `ProvingGating` carries the raising `call`; `ProvingInside.demand(thing, call)`
    so refusals log `ensureUnlocked` / `putWayin` / `delWayin` / `del`; `resealWayinFor` and
    `sealWayins` demand on the other proving.
  * New kinds `attempt_in_flight`, `passphrase_required`, `same_passphrase`.
  * Test helpers `tests/test-helpers/gating.ts`: `scriptedRequestCleartext` (the default in
    `memoryVaultOpts`, `makeWorld` and `settledVault`), `answering`, `unlock` / `putWayin` /
    `delWayin` / `del` and their `try` forms.
  * React: `PassphraseModal` / `PasskeyUnlockButton` take a `gating`; `BankProvider` takes
    `requestCleartext` and shows its dialog for `unlock_vault` / `initialize_gate` only.

* **Decisions taken**:
  * **Chains live in `gating.ts`**, reaching the vault through `GatingInside`, registered per
    raise (as the provings reach theirs): `#putGate` stays private.
  * **`seal`'s `{ gating }`** stays the trailing option; every vault path passes its real gating.
    `StandingGating` survives only as the default for a proving made outside a gating (tests).
  * **Seal order**: `put_passkey` seals and checks (`checkWayin`) the passphrase before sealing the
    passkey's answer, so a typo returns to the dialog with the answer unspent. `change_passphrase`
    seals and checks the current before sealing the next (a typo or a damaged wayin costs no second
    derivation). The strength check runs before any derivation in `initialize_gate` and
    `change_passphrase`. So no chain has the spec's parallel junction but `initialize_gate`'s two
    seals.
  * **requestCleartext resolving with the gating open declines it.** Its return value means nothing.
  * **A malformed attempt argument refuses `bad_option` and leaves the gating open.**
  * **The pantry consult never erases** a lease that does not fit (the "record don't fix" erase
    goes for free); an unreadable record is warned of and left.
  * **A storage refusal that locks** (`identity_revoked`, `vault_behind`) lands the gating with
    that refusal, so waiters hear it, not `vault_locked`.
  * **`vault_not_novel` is not added**: the spec's `initialize_gate` row names it, its *Gating*
    paragraph says the same state settles `gate_made_elsewhere`; built as the paragraph.

* **Deviations / refusals where today coped** (ground rule 17, for toldjaso):
  * `del()` needs the passphrase (ruled); on a `novel` vault it refuses `absent_vault`.
  * A `lock()` during `putWayin` / `delWayin` now stops them: no lease attached; the call refuses
    `vault_locked`, the attempt `gating_landed`.
  * `absent_wayin`, `damaged_wayin`, `passkey_unavailable`, `gate_made_elsewhere`,
    `storage_unavailable` met by an attempt settle the gating (only the four correctable kinds
    keep it open).
  * A twilight gating (`renewMinutes`) the user declines refuses `vault_locked` (no `carry_on`).
  * React's start over is off: a forgotten passphrase can no longer delete the vault (ruling on
    proven delete). Demo ways-in changes are declined by the provider's dialog until thread 10.

* **For the Coach**: see the PR's open questions.
