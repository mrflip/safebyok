# Thread 10: one_enabled (2026-11-12)

Branch `20261112-one_enabled`, PR #TBD, stacked on #674 (thread 9). Justify: green (safebyok 3382 tests; every
package green). `src/`: 515 lines added, 517 removed (rule 16, barely). Tests: 413 added, 386 removed.

* **Built**
  * **One enabled.** `Storable` and `Listing` lose `world`, `#isEnabled`, `sweep`, `vacate` and their contents hooks.
    A thing is enabled while its listing is and it is the instance listed (`listing.isListed(thing)`); a listing while
    the thing above it is: `BankListing` its device, `GateListing`/`VaultListing` their bank, `BoxListing` its vault
    *and* `vault.vault_tok === this.vault_tok` (tattooed at construction). `Bank` adds `#isLiveOfLife` (present, and
    `central.bank_tok === bank_tok`). Each `demandEnabled` throws `instanceDisabled()` ('disabled').
  * **The world goes.** `ListingWorld`, `VaultWorld`, `BoxWorld`, `BankFriend`, `DevicePanic`, `DeviceAnnounce` gone
    (`shapes-vaultish.ts`). New checks: `listingOpts` (bankDB, horizon), `bankListingOpts` (+ guarded `askUser`),
    `listedUnder.{device,bank,vault}` (by modelkind), `storableArgs` (listing, central). Constructors:
    `new BankListing(device, opts)`, `new GateListing(bank, opts)`, `new VaultListing(bank, opts)`,
    `new BoxListing(vault, opts)`, `new Thing(listing, central)`, `new Bank(listing, central, bankListingOpts)`.
  * **Device tells.** `device.tellBadNews(badnews)` and `device.announce(announcement)` are public; a listing panics
    with `void device.vacate({ cause })`. `askUser` goes Device → `BankListingOpts` → Bank (`#askUser`).
  * **The lock.** `Storable.alignLock()` is a thing's one duty at a lock and at its end: Box drops an exposed whisper
    once not enabled; Vault locks its box listing, or lets it go once not enabled. `Listing.lock()` calls it on each.
    `Bank.lock()`: enabled → `#revokeLease('lock')`; past its end → evict the lease, leave the row, `goodbye` the vault
    listing, `#alignAll()`. `Device.#disable` sets the cause, then `bankListing.at(scope)?.lock()`.
  * **One tell per lock and unlock** (Coach, #667): `Bank.#alignAll()` aligns the vaults (`alignLock`) then the bank;
    the bank's subscription to its vault listing skips while `snapshot.isLocked !== isLocked`. proof.test pins one
    paint each way.
  * **Vault through its lives** (R6). `remake`, S2 and `isOneLifePerInstance` gone (`deliveryMakingVals` is
    `none · listed · make`); `vault_tok` is a getter over `central`; `Vault.adopt` of another life lets its box listing
    go (`goodbye` + `lock`), and `vault.boxListing` makes the next one lazily.
  * **Gate through its lives** too: `gate_tok` is a getter over `central`, only `bank_tok` tattooed.
  * **Bank one life per instance.** Device keeps one `BankListing`, and makes another (`#bankListingInHand`) only
    when the bank listed no longer answers; `device.bank` filters on `isEnabled`. A bank row of another life (tombstone
    or live) is adopted by the listed Bank, which then revokes `'tombstone'`, says goodbye to its vault listing and
    dismisses its gating.
  * **Damaged row** takes the listed thing down: delist + `alignLock` (`Listing.#takeDown`).
  * Stub listings: `SX.putOpts`' `expected` no longer requires `vault_tok`, so a bank or gate listing's `put` reaches
    `writtenByOwnVerbs()` without a fabricated tok.
  * `notes/deliver-contract.md` promoted from `deliver-contract-bank.md`, corrected to the code (below).
  * `VX.Promptly` in `Bank.unlock`, `Bank.delPrompt`, `ensureUnlocked` (orchestrator directive 1). TODO entry for the
    gate-row/lease-grant race, #673 (directive 2, own `docs:` commit).

* **Decisions taken**
  * **`alignLock`, not `lock`**, for the thing's duty: `Vault.lock()` is the scaffold that locks the bank (rule 11),
    and `Bank.lock()` the bank's verb. A Box has no `lock()` now.
  * **B2, a live bank row of another `bank_tok`**: ends the Bank as a tombstone does; the next `ensureBank` makes the
    new life's Bank in a new bank listing. Settles the *What moves* open question.
  * **Gate row of another `gate_tok`**: adopted, the Gate standing through its lives (Open 4 in the note).
  * **`addPasskey`/`revokePasskey` acts** stay `added`/`revoked` in `as_sent` (Open 5).
  * **Names**: `receiveParent` kept; F3 is `rowOfOtherWorld(record, tokname)`; each listing keeps its own rows of a
    bank watch notice through `deliverNotice`.
  * Default `onLifecycle`, refused lock revoke: vacates the **device** (the bank has no vacate), only while enabled.
  * Each listing writes `isEnabled`/`demandEnabled`/`receiveParent` out (three small members) rather than a shared
    `above` getter in the base: plainer by the debug test, at ~15 lines.

* **Set aside**: a BankListing per bank life made in `#fetchBank` (breaks the join of concurrent `ensureBank`s);
  the Bank delisting itself at its end (`deliverRecord` would hand back the ended Bank); `Object.seal` on Device
  (private fields are unaffected by freeze).

* **Discoveries**
  * An ended bank's and box listing's snapshots still list their vaults and boxes (nothing empties them now);
    `device.snapshot.bank` is null, so a host following the device sees nothing.
  * A `vault.del(ante)` naming the old life after a fetch adopted the new one refuses `stale_write` (not
    `vault_reborn`): the revision check comes first.
  * `Vault`'s new life does not restart the box watch; React (thread 12) re-asks `vault.boxListing`.
  * `alreadyListed` and `recordForNewBox` throwers were dead before this thread; left.

* **For the Coach**: lines of `notes/guarantees.md` now false (left for thread 8d / G, per the orchestrator): line 43
  "a bank's friend"; line 56 "passed along in the `BankFriend` ... The vault listing keeps it ... gives it to each
  vault" (now: the device hands it to its bank listing, which hands it to each Bank, private `#askUser`); lines 60-61
  "a sweep or a vacate disables both" (now: the device's end, read live); line 468 "swept, deleted or vacated" (now:
  the device swept or vacated, the box deleted, or its vault taking another life).
