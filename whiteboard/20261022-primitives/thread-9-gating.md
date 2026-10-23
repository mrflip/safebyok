# Thread 9: gating (2026-10-23)

Branch `20261023-gating`, PR [#261](https://github.com/mrflip/safebyok/pull/261), stacked on #260. Justify: core green (3086 passed), adapters green; React and demo tests in port.

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
  * **A grant after a change to the ways in that the device store refuses only warns**, as today
    (no ruling to change the contract): the change landed, `putWayin` resolves. A grant stopped by
    `gating_landed` or the vault moving on still throws.
  * **A let-go during a deletion's own write** (its bell heard before the write answered) does not
    preempt the chain: the `del_vault` gating settles by its chain. A let-go lands any other
    gating with the gone refusal itself.
  * **An ended lease is dropped before a gating is raised** (the threshold is the truth, as
    `#whyAsk` did).
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

* **Discoveries**:
  * The refresh's revocation compares `readAt >= #leaseSince` in whole milliseconds: under load a
    refresh begun in the same millisecond as a grant revokes it (seen once in
    `safebyok-convex`'s "locks over a ConvexClient while idle", passing on rerun). Thread 5's.
  * A storage refusal that locks lands the gating before its read has unwound, so a call made right
    after the refused unlock may join that read and hear the same refusal: two tests wait a tick.

* **For the Coach** (also the PR's open questions):
  * **Start over**: a proven `del()` means a user who forgot the passphrase cannot delete a sound
    vault from the client; React's start over is off. Rec: a `bank.startOver(draft)` that deletes
    without proof (the server lets the owner delete anyway), or accept the loss.
  * **Joins across calls**: `ensureUnlocked` joining a `put_passkey` gating means a declined passkey
    dialog refuses an unrelated `getWhisper`; `putWayin` waiting out an unlock then raising its
    own shows two dialogs for one click. Rec: keep, as built, until the dialogs (thread 10) show it.
  * **Grant failure after a change**: kept today's warn; the spec's "never catches" would refuse.
    Rec: keep the warn.
  * **Settling kinds**: `absent_wayin`, `damaged_wayin`, `passkey_unavailable` settle the gating
    (spec); today they asked again. Rec: add them to the correctable list.
  * **`vault_not_novel`**: not added; `gate_made_elsewhere` covers the state. Rec: drop it from
    the kinds list.
  * **A lease of zero**: `leaseHours` must be above zero, and a zero lease would end as granted;
    the README says to `lock()` once done instead. Rec: keep the floor.
  * **Demo**: its ways-in buttons and Delete account are declined by the provider's dialog until
    thread 10 (a loosening, closed by 10).
