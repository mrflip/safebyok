# Thread 8b, leg 2: what it built

For whoever reworks 8b or builds 8c and needs the shape of the Gate, Bank, Device and gating as leg 2 left them.

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

