# Thread 5b: lease_plumbing (2026-11-01)

Branch `20261101-lease_plumbing`, PR [#438](https://github.com/mrflip/safebyok/pull/438), stacked on [#440](https://github.com/mrflip/safebyok/pull/440) (`20261101-vault_boxes`), the top of the line.
Justify: green. safebyok 5223 passed / 37 skipped; root 290; react 326; demo 230/17; indexeddb 167/11; postgres 322/15; fastkey 49; convex 375/9; graphql 345/15; e2e 107/116.

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
  * **Tests** in `vault.test.ts`, `bank-close.test.ts`, `bank-devicedb.test.ts` and
    `devicedb.test.ts`; the G4 and reload tests were red on the pre-fix `vault.ts` and
    `vault-listing.ts`.

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
  * An `onBadNews` that throws fails the find (documented on `OnBadNews`). The bank's
    `tellBadNews` never throws, so only a host calling the DeviceDB directly could meet this.

* **Rework after review** (commits d0371329, 3be71027). The reviewer found G4 held per instance
  but not per scope.
  * **One lease mutex per scope.** `VaultListing` keeps a `Map<scopepath, Mutex>`; a Vault
    object's `#withLeaseDB` calls `listing[WithLeaseDB](scope, work)` (a Symbol from
    `models/vault.ts`, beside `UnlockAtBirth`; defined there because `vault-listing.ts` imports
    `Vault` as a value, so the other way would be a runtime import cycle). An evicted vault's
    erase and a new instance's take-up now queue on the same mutex. `#lockSeq`/`BirthLockSeq` stay
    per instance: a scope-wide count would let a host's stray `lock()` on an evicted object void
    the live object's unlock.
  * **`VaultListing.close(scope)`** takes over the bank's `#closeVault`. It counts closes per
    scope (`#closeSeqs`). Where no vault is held, it erases the kept lease on the scope's mutex
    (a refused erase is told as bad news).
  * **Item 2, done.** `ensure` reads the scope's close count before it builds and again once
    `putDraft` answers; if a close landed, it grants no lease and returns the vault locked (held,
    not evicted). It does not replay the close: a host that closed and reopened meanwhile would
    have its reopened vault evicted. With the erase on an unheld close, a `hello` or `fetch`
    whose vault was not yet held when the close landed takes up nothing either: its look queues
    behind the erase.
  * **Behaviour change:** `closeVault` of a vaultlabel the bank holds no vault of used to do
    nothing; it now erases that vault's kept lease, so `closeVault`'s "erasing the lease this
    device keeps" holds whatever is held.
  * **`OnBadNews`** is derived from `MSX.onBadNews` in `models-shapes.ts`, and named by
    `bankDeviceDB.vaultCache` and the DeviceDB. `BankOpts.onBadNews` and `ListingOpts.onBadNews`
    still spell the type out: a different hook, whose doc would not fit.
  * **Tests** (`bank-close.test.ts`): the reviewer's probe (a reopen while the evicted vault's
    look is in flight), a close while `ensure` stores, an unheld close erasing the kept lease,
    its refused erase told to `onBadNews`. The first three were red without the `src/` change.
  * G4 in `notes/guarantees.md` ("erased from the store at `lock()`") stays true, now across
    instances; no edit.

* **For 7b**: read `wroteOverDamaged` in `Bank.#keepDeviceRecord` and tell the reset guard as bad
  news there; the highest epoch, keyed by `vault_tok`, is still yours.
* **For 8**: `clearCachedVault` erases lease and copy. A lock after deletion also erases the lease
  through the vault's mutex, so it queues behind any grant.

* **Final rework** (2026-11-01). Rebased from the pre-restack 5a onto #440. Thread S's `#asking`,
  3d's fetch-first `#unlockByProof`, 7a's try forms, 13's `BoxListing` and the `listedRefusal`
  factories all stand beside 5b's substance. `ensure` now tests for the birth grant rather than
  returning early (`sonarjs/no-invariant-returns`).
  * **The Coach's rulings on the second review.** A close before `VaultListing.ensure` begins, and
    the lease lock across banks, are won't-fixes: `notes/wontfix.md` has both, `TODO.md` the
    singleton line, and `bank-close.test.ts` (*A close before ensure begins*) pins the first, over
    fresh banks, as the same every time. `closeVault`'s doc says a vault may stay held, locked.
  * **Siblings of that race:** [thread-5b-sibling_races.md](thread-5b-sibling_races.md), for the
    Coach and thread 8. None fixed.
