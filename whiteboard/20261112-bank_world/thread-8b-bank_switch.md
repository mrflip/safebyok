# Thread 8b: bank_switch (2026-11-12)

Branch `20261112-bank_switch`, PR #667, stacked on #665 (8a). **Partial: stopped under the release valve** (second
compaction) after the renames. Justify: red exactly as 8a's tip is, no wider: safebyok tsc 51 errors, 23 in
`src/models/{bank,gating,vault,vault-listing}.ts` and 28 in 9 test files; vitest 19 files, 397 of 3218 cases failing (the
same cases as at 8a's tip, `vault_locked` renamed in their titles); safebyok-react tsc red as 8a left it.

* **Built** (commit `refusals: ...`):
  - `vault_locked` is `bank_locked` everywhere (errors.ts, eslint `CustomerKinds`, tests); phrase `BankLocked`,
    "The bank is locked, so nothing was read or written: unlock it (bank.ensureUnlocked) and call again." It names
    `bank.ensureUnlocked`, which the rest of this thread makes.
  - One thrower, `needUnlocked`; `unlockFirst` and `Phrases.UnlockFirst` are gone.
  - `BankAnnouncement`, `BankAnnounce`, `BankPanic` are `DeviceAnnouncement`, `DeviceAnnounce`, `DevicePanic`
    (exported; the ruling named the first and last; `BankAnnounce` went with them). `bankPanic`/`bankFriend` checker
    names are unchanged.
  - Changeset `.changeset/20261112-bank_switch.md`.

* **Not built: everything else in 8b.** `thread-8b-bank_switch-wip.patch`, beside this file, holds two uncommitted
  starts, set aside because each breaks compilation until the rest lands: `listing.ts` asking `bankDB`, delivering
  `answer.parent` to `world.receiveParent`, `vaultTokOfWorld()` replaced by an abstract `demandOfWorld(record)`,
  `deliverListing` protected; and `gatingkindVals = ['build_bank', 'unlock_bank']`. `git apply` it to start.

* **Plan** (the working design; a fresh agent picks up here, in this order):
  1. `shapes-vaultish.ts`: import `BankDB`, `BankDBVerbnames`, `Answer`, `GoodAnswer` from `storage/bank-db`;
     `ListingOpts.bankDB`, `brandedBankDB` (needs `Phrases.BankDBExpected`), `deviceOpts.bankDB`;
     `ListingWorld = Pick<Device | Bank | Vault, 'isLocked' | 'ensureTimely' | 'receiveParent'>`; `listingWorld`
     checks `receiveParent`; `storableArgs.listing` takes `bank_listing`, `gate_listing` too; a new `VX.storableBase`
     (revision, times, am) replaces `SX.sparseBase` in `storableArgs` and `tombstone`; `SparseBase` loses `Vaulted`;
     `ProbeStep` carries `parent: BX.VaultRow`; `boxWorld` adds `bank_tok`; `BankSnapshot` gains `isLocked`.
     (A perl pass at this failed on quoting; do it by Edit.)
  2. `Storable` stops tattooing `vault_tok`; `Vault` and `Box` do (**pulled forward from thread 10**).
  3. `Gate extends Storable` of the gate row through a stub `GateListing` (one slot); `Gate.recordOfBirth(bank,
     gate, main, passkey0): GateRecord` replaces `Gate.make`; `main`/`passkey0` are getters over the record.
  4. `Bank extends Storable` of the bank row through a stub `BankListing`, whose world is the `Device` (ducks as a
     `ListingWorld`: `isLocked` false, `ensureTimely` answers itself, `receiveParent` no-op). vault.ts *[Unlocking]*,
     *[The lease]*, *[The lease's friend]* move to bank.ts nearly verbatim; `maingate`, `ensureUnlocked`, `unlock`
     (`unlock_bank`), `lock`, `sealWith/unsealWith(text, stamps)` demanding the lease; `ensureVault` = putVault
     `ifAbsent:'add'`, `ifPresent:'get'`, refusing `bank_locked` only where it would put (judged by the listing).
  5. `Device.ensureBank` asks `bankDB.ensureBank({op:'ensure', user_id, banklabel, gates:['main']})` once: val null
     launches `build_bank` (Device is its proving world, keeps `device_tok`); else the bank row goes to
     `BankListing.deliverRecord`, and `vaultListing.deliverEnsured(answer)` delivers the gate row to the bank's
     `GateListing` and the vault rows via `deliverListing` with `parent: null`. `VaultListing.doTryList` asks
     `ensureBank` the same way; val null there lists empty.
  6. Vault listing's `isOwnRow` excludes bank and gate rows; bank/gate listings' `watchRows` are no-op stubs.
     Box listing asks the BX box verbs with `bank_tok`, `vault_tok`.
  7. `Vault` loses gate, lease, prompts, friend; seals through `world.sealWith(text, [vaultStamp, boxStamp])`.
     Its snapshot keeps `isLocked` (= world's) to limit churn.
  8. Gating holds the `Device` and a proving world; `BankForGatingkind {build_bank: null, unlock_bank: Bank}`;
     `UnlockByProving = (bank, proved) => Promise<Bank>`; `GatingSnapshot extends BankScope`.
  9. Fixture builders (`models-world`, `bank-world`, `vault-world`) move to the bank; skip by name with a line
     naming 8c: `vault-gate`, gating's gate-kind cases, bank-ending's delete and tombstone cases, bank.test's autolock.
  10. React: minimal edits; VOCABULARY's vault-record entry (nested gate, `gate_epoch`) retired.

* **Decisions taken**: commit only what keeps the red set at 8a's (verified: identical tsc error counts per file
  and identical failing-case list, before and after); the half-done listing and gatingkind edits went to a patch
  rather than a non-compiling commit, so the next agent starts from a known red.

* **Deviations**:
  - Rebased onto `origin/main` before building: 8a's branch was cut before thread 4 (BankDB, #663) merged, so the
    BankDB this thread asks was not under it. Tag `20261112-bank_switch-prerebase` keeps the old base.
  - Stopped short of the thread's goals under the release valve.

* **Discoveries**: the thread is larger than one context: the vault-to-bank move touches about 15 src files and
  every model test helper. Splitting it (shapes and Storable first; Bank/Gate/listings; then Device, gating,
  fixtures) would let each piece land in one context.

* **For the Coach**:
  - `BankAnnounce` was renamed `DeviceAnnounce` beside the two the ruling named.
  - Open matters carried from the plan: `ensureVault`'s `bank_locked` judged by the listing; vault listing lists
    empty on a val-null `ensureBank` until 8c delivers the bank tombstone; `Gate.make` becomes `recordOfBirth`;
    vault snapshot keeps `isLocked`.
