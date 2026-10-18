# Thread 14: people_words (2026-10-18)

Branch `20261018-people_words`, PR #TBD, stacked on #170. Justify: green (core 2161 passed, 35
skipped; react 229; demo 191, 16 skipped; every package green, no size line moved).

A follow-up carrying the Coach's rulings on three matters from thread 11's review.

* **Built**:
  * **Remove for people.** React's `Messages.startOverQuestion` ("Remove this vault and start a
    new one?") and `startOverConfirm` ("Remove and start over"); the sample `confirm()` in
    react's README and in `VaultProvider`'s doc block; the demo's damaged-vault confirm, button
    and gripe, its lockbox confirm ("Remove the lockbox '…'?") and row button (`remove`), its
    "clearing this site's data removes it", the account-deletion confirm ("Delete this account
    and remove its vault?"), and the demo README's list of what the dashboard does. Tests follow.
  * **Lease terms.** The lifecycle, audited in `packages/safebyok/src/vault.ts`, has these cases,
    each now named one way:

    | Case | Term | Where |
    | --- | --- | --- |
    | an unlock (or a passphrase-proven change) writes one | **grant** | `grantLease` |
    | a hello reads it and unlocks with it | **take up** (after a fetch) | `fetchLease` |
    | it reaches its askPassphraseAt | **expire**; the key goes a minute later | `armExpiry` |
    | `lock()`, `retire()`, untrusted storage, `lockSoon(0)` | **hard revocation**: lock generation raised, then erased; counts in `revokesSoFar` | `shut` → `hardRevokeLease` (was `revokeLease`) |
    | `lockSoon()` with a grace | **soft revocation**: erased, generation left be; counts in `revokesSoFar` | inline in `lockSoon` |
    | expired, other vault, older unlockEpoch, deadline past a shorter `leaseHours` | **discard**, silent; counts for nothing | `fetchLease` |
    | unreadable, other scope, will not unwrap | **discard**, with a warning | `discardUnreadableLease` (was `revokeUnreadableLease`) |
    | a refresh finds the vault props outlived (new epoch, other vault) | **discard**, key dropped | `takeStorage` |
    | a grant that lands after a shut in this handle | erased as part of that shut's revocation | `grantLease` |
    | `retireDamagedVault`, no handle | erased with the vault | `retireDamagedVault` |
    | the storage act behind all of these | **erase** (`DeviceDB.eraseLease`) | public, unchanged |

    "Revoke" now means only a lock's withdrawal, the thing `revokesSoFar` counts; everything
    else that removes a lease that cannot be taken up is a discard. Doc blocks, comments, the
    logger's warning ("…so it was discarded"), README (the lowered-`leaseHours` paragraph, the
    logger list, "the lease expiring while…"), `notes/wontfix.md`, and test titles follow. The
    lock generation's doc blocks (`DeviceMark`, `LeaseExpectation`, `lockedMeanwhile`'s) say
    *hard* lock, since a soft revocation leaves it be. VOCABULARY.md's lease entry gains a short
    account of expire / revoke (hard and soft) / discard / erase; its lock generation entry says
    "hard locks" and names lockSoon()'s soft revocation.
  * **Sidecar clause.** VOCABULARY.md's sidecar entry: guaranteed unchanged once `readBox()`
    opens the lockbox; until then the snapshot shows it as storage holds it.
* **Decisions taken**:
  * **"discard"** for a lease that cannot be taken up: plain, and not a cache word with a
    capacity sense (evict) or a mark-without-erase sense (invalidate). The adapters' own
    dropping of a mangled record (`idbDeviceDB`'s doc, `memoryDeviceDB`'s test, idb's sweep test
    title) says "discards" too.
  * **"hard"/"soft" revocation** rather than a new word such as "fence": the lock generation is a
    fencing token in all but name, but the cast already says hard lock and soft lock, and
    `hardLocksSoFar` set the adjective-first pattern for `hardRevokeLease`.
  * `fetchLease` kept: it fetches, then takes up or discards; no conflation.
  * `shut`'s doc block claimed an unlock under way loses to a `lockSoon()` with a grace too; it
    does not (only `shutsSoFar` stops one, and lockSoon leaves it). Reworded to say what the code
    does. Wording only.
  * Developer-facing `lockedMeanwhile` message ("A lock on this device revoked…") left as is:
    `lock()` is a lock; only its doc block says hard.
* **Discoveries**: no conflation in the public lease names (`readLease`, `writeLease`,
  `eraseLease`, `leaseHours`, `leaseMillis`): `eraseLease` is the storage act every case uses.
* **For the Coach**: old → new pairs, for anyone writing about the lease (thread 16's security
  note): `revokeLease` → `hardRevokeLease`; `revokeUnreadableLease` → `discardUnreadableLease`;
  warning "…so it was revoked" → "…so it was discarded"; a lease past a lowered `leaseHours` is
  "discarded", not "revoked"; "the lease running out" → "the lease expiring".
