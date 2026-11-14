# Thread 6: tests_vault_box (2026-10-31)

Branch `20261031-tests_vault_box`, PR #415, stacked on #411 (`20261031-tests_models`, 7a0edfe9),
in the line main → #408 → #410 → #412 → #413 → #414 → #411 → this one. Justify: green; core
4769 passed, 37 skipped. Tests only: no change to `src/`, an empty changeset.

* **Built**:
  * `tests/models/vault-life.test.ts` (11), the vault's story through real vaults, a real
    lease and a models-world box listing, one describe per chapter:
    1. *Birth*: a vault born with its gate seals its first box under the birth lease.
    2. *Locking, and the sessions after it on this device*: `lock()`, then the next session
       asks for the passphrase (`vault_locked`, then `wrong_passphrase`, then it opens);
       `goodbye()`, then the next session's `hello()` takes the kept lease up, and a lock there
       means the third session asks again; the first session opens a whisper the next sealed,
       taking up the same kept lease at `ensureUnlocked`.
    3. *The autolock, with a box in hand*: the timer locks, `box.whisper` answers LOCKED, the
       unseal refuses `vault_locked`, the kept lease is erased and the next session is locked;
       the exposed whisper is kept through it and answers again after a passphrase unlock with
       the autolock reset.
    4. *Changing the gate, with a box sealed before the change*: `replacePassphrase` (a held
       lease still seals, the old passphrase is `wrong_passphrase`, the new one opens, the
       passkey opens a third session); `addPasskey` (the next session unlocks by passkey
       alone); `revokePasskey` (the passkey's lease held through it seals; the next session's
       passkey is `wrong_passkey`; the passphrase opens).
    5. *Another device, over the same vaultDB and boxes*: it must give the passphrase, keeps
       its own lease, opens the box, and stays unlocked after this device's `lock()`; it seals
       a whisper this device opens.
  * `tests/models/vault.test.ts` gains the Coach's pin: a vault held sparse, with no edit
    before, fetches its full record on `send` and stores the gate (the case of an edit over a
    sparse record and of a gate kept from another device were pinned already).
  * `tests/loosened/vault.test.ts` (5) and `tests/loosened/box.test.ts` (1), see below.
  * Housekeeping: `grantedLeaseOf` is `makeGrantedLease`; loosened.test.ts's header gives the
    per-model rule. Hoisted into `vault-world.ts` as a `tests:` commit of its own:
    `NewPassphrase`, `byPassphrase`, `byPasskey`, `makeBornVault` (was vault-gate's and
    vault-unlock's `bornVault`), `makeBornVaultWithPasskey` (was `bornWithPasskey`),
    `roundTrip`, and `demandStored` on every vault world (was vault-gate's local helper).
* **The loosened pins**, each as the model does it today:
  * vault.test, *the ways in changing under a vault unlocked*:
    * README.md:844, "Every change locks the other devices": a vault receiving a record whose
      wayins are not the ones in hand takes its gate and stays unlocked, its lease sealing.
      (Gap review: gate epoch voiding, ruled "implement".)
    * README.md:844, "must unlock again": a lease another device kept under its passkey is
      taken up at its next `hello()` after the passkey was revoked here, and opens what this
      device seals.
  * vault.test, *an older copy of the vault record*: README.md:1204, "Storage handing back an
    older copy could otherwise bring back a way in that was removed": the next session holds
    a record restored from before a `replacePassphrase`, and the replaced passphrase opens it.
    (Gap review: the rollback guard, ruled "proceed".)
  * vault.test, *a vault record stored damaged*:
    * README.md:810, "the other still opens the vault": a passkey wayin with a salt too short
      to be one passes the record's check, then refuses the passphrase unlock `bad_record`.
    * README.md:1085, the `damaged_vault` row: a record stored without its gate reads as
      sparse, so `ensureUnlocked`, `edit` and `send` refuse `bad_option`, asking for a hydrate
      that cannot bring a gate, and store nothing.
  * box.test: README.md:617, "under way refuses with `vault_locked` too, handing nothing
    back": an unseal whose lease was handed out just before `lock()` resolves with the whisper.
* **Decisions taken**:
  * Makers are `makeBornVault` and `makeBornVaultWithPasskey`, not `bornVault`/`bornWithPasskey`
    (a maker is `makeFoo`); `byPasskey(tag)` beside `byPassphrase`, for the story's passkey
    sessions. loosened.test.ts's own copies of these (in *Changing the gate*) stay, per "move
    nothing out".
  * `whisperBytesOf` and a PRF-copy helper were not added: no two tests wanted them.
  * The gap review's seal-across-`lock()` is not pinned: the seal stages and its `send` then
    refuses `vault_locked`, which README.md:619 allows (a lock spares the transactional part).
  * A storage rollback served at a *higher* revision (the old gate under a new
    `revision_seq`) behaves as the restored-backup pin does; one pin covers the guard.
* **Deviations**: the handoff gave `revokePasskey` one closure and the other two one each;
  `replacePassphrase` and `addPasskey` take a proof closure and a new-cleartext closure,
  `revokePasskey` the proof closure alone. The tests call them as they are.
* **Discoveries**:
  * The stored-record check (`vaultRecord`, `gateProps`) accepts a passkey wayin whose
    `prf_salt_b64` `new Gate` refuses, so a damaged wayin passes the listing and fails at
    `vault.gate`, blocking both ways in (the README.md:810 pin). The fix is one checker, not
    two; it is for whoever builds the damaged-wayin item.
  * A gateless stored record reads as a sparse one, so its refusal is `bad_option` with
    "hydrate it, and call again", which can never help; README.md:1085 wants `damaged_vault`.
  * I looked up thread 6's entries in the sprint plan and progress documents, and read the
    gap review (`missing-functionality.md`) with the Coach's rulings for the pins.
* **For the Coach**: each loosened pin is a ruling to make; the 844 pair and the 1204 pin are
  items already ruled "implement" or "proceed", so they flip when those are built. No
  `eslint-disable` or `ts-expect-error`; one cast, `'short' as PrfSalt`, forges the damaged
  wayin.
