# Thread 5b: lease_plumbing (2026-11-01)

Branch `20261101-lease_plumbing`, PR #TBD, stacked on [#437](https://github.com/mrflip/safebyok/pull/437) (`20261101-devicedb`).
Justify: green. safebyok 4956 passed / 37 skipped; root 290; react 326; demo 230/17;
indexeddb 167/11; postgres 322/15; fastkey 49; convex 375/9; graphql 345/15; e2e 107/116.

* **Built**
  * **G4 at birth** (commit 9edf2685). `VaultListing.ensure` used to take up its birth lease
    through `vault.takeUpLease(await proving.makeLease(...))`: outside `#withLeaseDB`, with no
    lock count. A lock landing mid-put queued its erase on a free mutex, the erase ran first, the
    put wrote after, and the vault read unlocked with a lease kept. Now `ensure` calls
    `vault[UnlockAtBirth](proving)`, a Symbol-keyed method exported from `models/vault.ts` and from
    no entry point (G9's `provingTools` is the precedent). It runs the grant through the same
    `#unlockBy(proving, lockSeq)` that `#unlockByProof` now wraps, with `lockSeq` pinned to
    `BirthLockSeq = 0`: any lock or let-go since construction voids the grant, the lease is
    evicted, and a lock's erase, queued behind the put, removes the record.
  * **Take-up at birth by fetch.** `VaultListing.fetch` is overridden: a vault that the fetch
    builds, as opposed to one already held, first takes up the cached lease
    (`takeUpCachedLease`). With `hello`, which already took up every revived vault's lease, this
    covers a reload: a cached copy revived at hello, or a cache miss born at `bank.ensureVault`.
  * **The DeviceDB's bad news** (commit 66b843aa).
    * `findCachedVaults(scope, onBadNews?)` and `vaultCache(scope, onBadNews?)` tell each
      erased copy as `RefusalFuncs.misfiledCachedCopy()`, a fresh `corrupt_record` that quotes
      nothing of the row, after its erasure. `MSX.onBadNews` checks the hook. The bank passes
      `(news) => { this.vaultListing.tellBadNews([news]) }`.
    * `advanceDeviceRecord` resolves `DeviceRecordAdvance`, `{ record, wroteOverDamaged }`. The
      flag comes from the last run of the update callback, since an IDB store may run it again.
      `#keepDeviceRecord` reads `.record`; the flag is unread until 7b.
  * **The filing check.** `isCopyFiledAt` now checks the scope of `central`, and of `staged`
    where non-null, against the scopepath the copy is filed under.
  * **Tests.**
    * `vault.test.ts`: a lock and a let-go landing mid-birth, and fetch-born take-up.
    * `bank-close.test.ts`: `closeVault` landing mid-birth.
    * `bank-devicedb.test.ts`: a reload over the models' `memoryDeviceDB` (hello, and a cache
      miss), closeVault then reload, and a misfiled copy told to `onBadNews`.
    * `devicedb.test.ts`: central and staged filing, the onBadNews telling and its check,
      `wroteOverDamaged` true and false, and a retried update.
    * The G4 tests and the two reload tests were red on the pre-fix `vault.ts` and
      `vault-listing.ts`, checked by restoring them from HEAD.

* **Decisions taken**
  * **A mid-birth lock returns the vault locked; `ensure` does not refuse.** The vault is stored,
    and `ensure`'s promise is "the vault as stored". The passkey answer is still spent.
  * **A let-go mid-birth keeps the lease put**, as a let-go keeps any (`goodbye` leaves the kept
    lease for the next load). Only a lock erases.
  * **`corrupt_record` for a misfiled copy**, not a new kind: `refusalKindVals` is public, and a
    new kind would be a minor bump for one internal sentence.
  * **The hook rides `vaultCache`, not the DeviceDB's constructor.** The deviceDB is shared
    across banks; each bank's listing hears its own scope's news.
  * **A take-up in `makeThing` (every birth, notice-born included), and a Bank-only take-up, were
    set aside.** `makeThing` is synchronous and also makes drafts and orphans. The `fetch`
    override sits where the reload actually lands.
  * **`takeUpLease` stays public** though `src/` no longer calls it; tests and later threads may.

* **Deviations**
  * **Pulled forward: the staged scope check.** The handoff named `central`; `staged` is revived
    from the same row, so the check covers it too.
  * **`fetch` now checks `scope` before `opts`.** The override reads `this.at(scope)` before
    `super.fetch` validates, so a call bad in both refuses `bad_scope` first. No test pins the old
    order.

* **Discoveries**
  * The old `memoryDeviceDB` (`src/device-db`) was still imported by vault-unlock's
    real-deviceDB test; it now runs over `src/devicedb/memory`.
  * An `onBadNews` that throws fails the find (documented on `OnBadNews`). The bank's
    `tellBadNews` never throws, so only a host calling the DeviceDB directly could meet this.

* **For 7b**: read `wroteOverDamaged` in `Bank.#keepDeviceRecord` and tell the reset guard as bad
  news there; the highest epoch, keyed by `vault_tok`, is still yours.
* **For 8**: `clearCachedVault` erases lease and copy. A lock after deletion also erases the lease
  through the vault's mutex, so it queues behind any grant.
