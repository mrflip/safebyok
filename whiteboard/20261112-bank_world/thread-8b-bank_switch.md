# Thread 8b: bank_switch (2026-11-12)

Branch `20261112-bank_switch`, PR #667, base main. **Partial: rework leg 1 stopped under the release valve
(second compaction) after plan steps 1 and 2.** Red by design (ground rule 20): safebyok tsc 226 errors in 26
files, 93 in `src/models/{vault-listing,vault,gating,box-listing,listing,bank}.ts`, every one a seam steps 3 to 10
own; vitest 39 of 82 files fail (model fixtures, vault, gating: steps 7 to 9). `tests/storage/bank-db.test.ts`
passes.

* **Built**, earlier leg (commit `refusals: ...`): `vault_locked` is `bank_locked`; one thrower `needUnlocked`;
  `BankAnnouncement`/`BankAnnounce`/`BankPanic` are `Device...`; changeset `.changeset/20261112-bank_switch.md`.
* **Built**, leg 1:
  - **Step 1** (d537ee876): the WIP patch applied and deleted (`listing.ts` asks `bankDB`, hands
    `answer.parent` to `world.receiveParent`, abstract `demandOfWorld(record)`; `gatingkindVals = ['build_bank',
    'unlock_bank']`). `shapes-vaultish.ts` as the plan's step 1 says, except `storableArgs.listing`'s new kinds
    (below). `VX.storableBase` (revision, times, am) is the storable base and `tombstone`'s. `Phrases.BankDBExpected`
    replaces `VaultDBExpected`. `receiveWorld` is `receiveParent` throughout src and tests. `shapes-gateish.ts`
    `gatingLaunchOnArgs` excludes `build_bank` (was `build_vault`) so the shapes load; gating's shapes stay step 8's.
    The `brandedVaultDB` test moved to `tests/storage/bank-db.test.ts` as `brandedBankDB`. Changeset line:
    `Device.make` takes a `bankDB`.
  - **Step 2** (dff295ea6, **pulled forward from thread 10**): `Storable` tattoos only the scope; `Vault` and
    `Box` each declare `vault_tok` and override `assignInitialProps` to tattoo it before `super`.

* **Next leg starts at step 3.** Nothing of step 3 is in the tree. Design worked out for it:
  - `Gate extends Storable<GateScope, GateRecord, GateSparse, GateSnapshot>`. `GateSparse` is the record
    **without `wayins`** (`BX.gateRecord.omit({ wayins: true })`), so `sparse` and `toJSON()` never carry a
    wrapped vault key (offline brute-force material); today's `toJSON` shows only wayin headers, and the snapshot
    keeps that by `wayinlabel`. `isFullRecord`: `'wayins' in fetched`. `lifeTokPathOf`: bank_tok, gate_tok.
    `assignInitialProps` tattoos `bank_tok`, `gate_tok`. `main`/`passkey0`: getters over
    `demandFullProps().wayins`, memoized by the wayins' identity as `Vault.gate` is today. `stamp` =
    `gateStamp.parse(this)`; `bankStamp` from the world (the Bank). `pickle`, `demandPasskeyAddable` stay.
  - `Gate.recordOfBirth(bank, gate, main, passkey0): GateRecord` is `Gate.make`'s body without the `new`. Callers:
    `gating.ts` (`Gate.make`, the build act), `tests/test-helpers/proving-world.ts`; `new Gate(` in `vault.ts`
    and tests.
  - `GateListing` stub (vault-listing.ts the template; world = the Bank; `isOneLifePerInstance` true; modelkind
    `gate_listing`, added to `Modelkind`/`ClassForModelkind` in `helpers/consts.ts` and to `storableArgs.listing`):
    `doTryGet`/`doTryList` ask `bankDB.tryEnsureBank` and answer `gates.main` (or null / `[]`), parent the bank
    row; `doTryPut`/`doTryDel` throw a new thrower (a gate is written only by `buildBank` and the gate verbs);
    `demandOfWorld` refuses another `bank_tok` through a new `rowOfOtherBankTok`, sibling of
    `rowOfOtherVaultTok` in throwers.ts *[Listing Throwers]*; `watchRows` a no-op; `nothingStoredError` an open
    matter (there is no `absent_bank` kind).
  - Step 4, `BankListing`, the same shape with the Device as world; the Device answers the `ListingWorld` duck.
    The lease and its friend: `lease.ts` needs no edit; `device-db.ts`'s `peek`/`forget`/`tryForget` take a
    `LeaseQuery {user_id, banklabel, bank_tok}`, `tryStow(row)`.
  - Read for the stubs: sprint `design.md` § *Bank* and § *Gate* ("`BankListing` and `GateListing` are stubs
    (ruled)"), `threads.md` § 8 item 8. If a stub wants real work, say so: the Coach's fallback is a subclass
    `Listable` of `Storable` for `Vault` and `Box`.

* **Plan, remaining** (steps 1 and 2 done):
  3. `Gate extends Storable` through a stub `GateListing` (above).
  4. `Bank extends Storable` of the bank row through a stub `BankListing`, world the `Device` (`isLocked`
     false, `ensureTimely` answers itself, `receiveParent` no-op). vault.ts *[Unlocking]*, *[The lease]*, *[The
     lease's friend]* move to bank.ts nearly verbatim; `maingate`, `ensureUnlocked`, `unlock` (`unlock_bank`),
     `lock`, `sealWith/unsealWith(text, stamps)` demanding the lease; `ensureVault` = putVault `ifAbsent:'add'`,
     `ifPresent:'get'`, refusing `bank_locked` only where it would put (judged by the listing).
  5. `Device.ensureBank` asks `bankDB.ensureBank({op:'ensure', user_id, banklabel, gates:['main']})` once: val
     null launches `build_bank` (Device is its proving world, keeps `device_tok`); else the bank row goes to
     `BankListing`, the gate row to the bank's `GateListing`, the vault rows via `deliverListing` with
     `parent: null`. `VaultListing.doTryList` asks `ensureBank` the same way; val null lists empty. Startup asks
     `ensureBank` once, not twice.
  6. Vault listing's `isOwnRow` excludes bank and gate rows. Box listing asks the BX box verbs with `bank_tok`,
     `vault_tok` (`BoxWorld` already picks `bank_tok`, red until step 7).
  7. `Vault` loses gate, lease, prompts, friend; seals through `world.sealWith(text, [vaultStamp, boxStamp])`;
     gains `bank_tok`. Its snapshot keeps `isLocked` (the bank's) to limit churn.
  8. Gating holds the `Device` and a proving world; `BankForGatingkind {build_bank: null, unlock_bank: Bank}`;
     `UnlockByProving = (bank, proved) => Promise<Bank>`; `GatingSnapshot extends BankScope`. Drop the
     `build_bank` exclude bridge in shapes-gateish if it no longer fits.
  9. Fixture builders (`models-world`, `bank-world`, `vault-world`) move to the bank; skip by name with a line
     naming 8c: `vault-gate`, gating's gate-kind cases, bank-ending's delete and tombstone cases, bank.test's autolock.
  10. React: minimal edits; VOCABULARY's vault-record entry (nested gate, `gate_epoch`) retired.

* **Decisions taken**: each step committed once its own files compile, the rest left red at named seams.
  `storableArgs.listing` gains `gate_listing`/`bank_listing` in steps 3/4, with their `Modelkind` entries.

* **Deviations**:
  - Rebased onto `origin/main` before building (BankDB, #663, was not under 8a). Tag
    `20261112-bank_switch-prerebase` keeps the old base.
  - Step 1 applied by exact-match scripted replacements with asserts, not Edit (equivalent, avoided the quoting
    trouble perl had).
  - The `build_bank` exclude bridge in shapes-gateish, step 8's file, so test files load.
  - Stopped short of the thread's goals under the release valve, twice.

* **Discoveries**: the thread is larger than one context. Leg 1 landed two steps in about 160 src lines
  changed; Gate and Bank (steps 3, 4) are each about a leg.

* **For the Coach**:
  - `BankAnnounce` was renamed `DeviceAnnounce` beside the two the ruling named.
  - Open: the gate's (and bank's) `nothingStoredError` kind, with no `absent_bank`; `GateSparse` without
    `wayins`; the stubs' put and del throw.
  - Carried: `ensureVault`'s `bank_locked` judged by the listing; vault listing lists empty on a val-null
    `ensureBank` until 8c; `Gate.make` becomes `recordOfBirth`; vault snapshot keeps `isLocked`.
