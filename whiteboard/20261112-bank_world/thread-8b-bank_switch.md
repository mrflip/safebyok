# Thread 8b: bank_switch (2026-11-12)

Branch `20261112-bank_switch`, PR #667, base main. **Partial: rework leg 2 landed plan steps 3 to 8; `src` compiles
and lints clean.** Red by design (ground rule 20): safebyok tsc 639 errors, every one in `tests/` (fixtures and
suites: step 9); safebyok-react tsc (step 10, and 8c). vitest: `tests/storage` passes; `tests/shapes` fails 7, all
through `models-world` fixtures. `src` since the base: +1314 / -991 lines (leg 2 alone: +988 / -738).

* **Built**, earlier legs: `vault_locked` is `bank_locked` (one thrower `needUnlocked`); `Device...` announcement
  types; `Listing` asks `bankDB` and hands `answer.parent` to `world.receiveParent`; `Storable` tattoos only the
  scope (`vault_tok` moved down, pulled forward from thread 10).
* **Built**, leg 2 (commits 97e81d750, b4c4836f7, bfa81d650, 09b9529ff):
  - `Gate extends Storable` (`gate.ts`), made in the stub `GateListing` (`gate-listing.ts`). `BX.gateSparse` is
    the row without `wayins`, `am` any; `wayins`, `main`, `passkey0` are getters over the full record, memoized
    by its identity; `bankStamp` is the bank's `stamp`. `Gate.recordOfBirth` replaces `Gate.make`.
  - `Bank extends Storable` of the bank row (`bank.ts`), made in the stub `BankListing` (`bank-listing.ts`),
    world the `Device`. The Vault's unlocking, lease and lease's friend moved in nearly verbatim; `maingate` is
    the gate listing's `main`; `sealWith`/`unsealWith(text, stamps)`; `ensureVault` puts `ifAbsent:'add'`,
    `ifPresent:'get'`, `demandUnlocked` only where none is listed. `autolock` peeks the one lease row (**pulled
    forward from 8c**: the old one no longer compiled). `DefaultLeaseMillis` moved to `bank.ts`.
  - `Device` answers the `ListingWorld` duck, keeps `device_tok` (null before `ensureBank`) and `#bankListing`.
    `#fetchBank` asks `ensureBank` once: val null launches `Bank.launchBirth`; else the bank row goes to the bank
    listing, then `bank.vaultListing.deliverEnsured(answer)` delivers bank row, gate row, vault rows. Startup no
    longer calls `vaultListing.list()`. Sweep and vacate discard the bank listing.
  - `VaultListing` and `BoxListing` on BX rows and verbs (`bank_tok`, `vault_tok`); vault `doTryList` is
    `ensureBank` through the same `#listingOfEnsured` (no live bank lists none); `recordOfBirth(scope, expected)`.
    Gate verbs and `buildVault` gone from the vault listing.
  - `Vault` lost gate, lease, prompts, friend, `launchBirth`; tattoos `bank_tok`; seals through
    `world.sealWith(text, [vaultStamp, boxStamp])`; `isLocked` is the bank's; `lock()` aligns itself and its boxes.
    `VaultWorld` is now `scope, bank_tok, boxRefreshMillis, sealWith, unsealWith, gateListing` (lighter).
  - `Box` tattoos `bank_tok`; its life is `vaultLifeOf-box_tok`; its stamp `BX.boxSparse` (with `bank_tok`).
  - Gating (**step 8, pulled into this leg**): holds the Device; `BankForGatingkind {build_bank: null, unlock_bank:
    Bank}`; `UnlockByProving = (bank, proved)`; `GatingSnapshot extends BankScope`. Build act: stamps from
    `BankListing.stampsOfBirth()`, `Gate.recordOfBirth`, `BankListing.recordOfBirth`, `BankListing.build` (calls
    `tryBuildBank`, delivers bank row then gate row); another device's bank first refuses `gate_made_elsewhere`.
    The proving world is `GX.provingWorld.parse(device)` at launch. `bankBuildCleartexts`/`bankUnlockCleartexts`
    renamed; replace/add/revoke checkers kept for 8c.
  - Exports: types `Gate`, `GateListing`, `BankListing`, `GateSnapshot`, `BankGatingkind`; `VaultForGatingkind`
    is `BankForGatingkind`. Changeset brought up to date.

* **Next leg starts at step 9.** Nothing of 9 or 10 is in the tree.
  9. Fixtures: `tests/test-helpers/models-world.ts` first (TestableBoxListing passes no `bank_tok` world),
     then `bank-world`, `vault-world`; `proving-world.ts` `builtGateOf` uses `Gate.make` (now `recordOfBirth`
     plus a Gate made through a bank's gate listing). `gate.test.ts` rewrites around a listed Gate. Skip by name
     with a line naming 8c: `vault-gate`, gating's gate-kind cases, bank-ending's delete and tombstone cases.
     Autolock in `bank.test` may pass as built here: try before skipping. `tests/index.test.ts` lists exports.
  10. React: minimal edits for the renamed gatingkinds and `gating.bank`; the vault prompts' callers are 8c's.
     VOCABULARY's vault-record entry (nested gate, `gate_epoch`) retired.

* **Decisions taken**:
  - Steps 3 and 4 landed as one commit: `consts.ts` names both new modelkinds.
  - A stub's `nothingStoredError`/`damagedStoredError` reuse existing throwers (Coach): the gate `mainGateMissing`
    (param widened to `BankSparse`), the bank `actRefused('vault', 'bank_void')`. `rowOfOtherVaultTok` became
    `rowOfOtherWorld(received, tokname)`, used by the gate, vault and box listings.
  - Stub `doTryPut`/`tombstoneOver`/`doTryDel` throw one new thrower, `writtenByOwnVerbs` (`bad_option`): no
    existing one says "use the bank's verbs". Reachable through `Storable.del` on a bank or gate.
  - Stubs' `watchRows` start nothing; the vault listing watches the bank scope and keeps vault rows only.
  - `Bank.ensureTimely` resolves at once, as before: the bank row arrives as every gate and vault answer's parent.
    The unlock refreshes `maingate` (one `ensureBank`), which also refreshes the bank row.
  - `lease_revoke_failed` carries `bank` (was `vault`); the default vacates that Bank, as it vacated the vault.
  - The bank snapshot gains `isLocked` only, not `maingate` (8c, with the gate prompts' dialogs).
  - `Device.device_tok` is `string | null`; the Bank checks it through the existing `bankArgs` at construction.
* **Deviations**:
  - Rebased onto `origin/main` before leg 1 (tag `20261112-bank_switch-prerebase`).
  - Steps 6 to 8 done in this leg though the handoff named 3 to 5: the vault listing's switch, the Vault losing its
    lease and the gating are one step (cut: *Atomic*), and `src` would not compile at a narrower seam.
* **Discoveries**:
  - A gate row changed on another device is heard only on the next `ensureBank`: no listing delivers gate
    notices. 8c (gate verbs) should decide.
  - A newer bank life delivered as a parent remakes the Bank in its listing while the Device keeps the old one in
    `#bank`, and a vault listing mid-delivery meets its bank vacated. 8c (tombstones).
  - The old vaultDB stack (`storage/vault-db.ts`, adapters, classifier) is still in `src`, unreferenced by models.
* **For the Coach**:
  - `writtenByOwnVerbs`, the one new thrower (kind `bad_option`).
  - `lease_revoke_failed` names the bank, and the default vacates the bank: a contract change.
  - `vault.lock()` no longer locks anything; a host must call `bank.lock()`.
  - Carried: `ensureVault`'s `bank_locked` judged by the listing; vault listing lists empty on a val-null
    `ensureBank` until 8c; vault snapshot keeps `isLocked`.
