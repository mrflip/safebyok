# Thread 12: bank (2026-11-03)

Branch `20261103-bank`, PR #460, stacked on #459. Justify: green; safebyok 4746 passed, 37 skipped, `bank.test.ts` 31.

* **Built**: `models/bank.ts` to the spec's Bank and Public tables.
  * `hello` / `tryHello`: loads the deriver and checker, `listing.fetchBank()` (new in `vault-listing.ts`: `getBank` lists every vault and tombstone, a damaged row is `damaged_record` bad news naming its vaultlabel), `#cacheDeviceRecord` (first `device_id` wins; `rewrote` is bad news), `listing.hello()`, `tidy`, then `listing.demandEnabled()`.
  * `tidy`, `lock`, `vacate`, `sweep`; `vaultOf` and `ensureVault` demand ready.
  * `identity_revoked`: `Listing.deliver` and `fetchBank` send it through the new `tellIfRevoked` to the bank's `#hearBadNews`, which vacates before the caller hears the throw. The host's `onBadNews` hears it too.
  * `snapshot`, `getSnapshot`, `subscribe`, `toJSON`: `{ ...scope, stage, err, device_id, vaults }`, a new object only where a field differs, listeners' throws to `reportToPlatform`.
  * `tests/test-helpers/bank-world.ts`: `makeBankWorld`, `makeBankWithVault`, `RefusingVaultDB._cheat_refuseGets`. Thread 13 can stand on it.
* **Removed**: `Bank.goodbye` (now `sweep`), `closeVault`, `closeVaults` (now `lock`, or `vaultOf(bag)?.lock()`), `ensureVault`'s fetch and its `stale_write` fallback, and the public `device_id` and `vaultListing` fields, now getters over private fields, as `sweep` and `hello` change them on a frozen bank. `Listing.goodbye` stays; it is the listing's.
* **Decisions taken**:
  * `stage` is `made`, `ready`, `refused`, with no `starting`: a re-hello on a timer must neither flicker nor refuse in between.
  * `sweep` swaps in a fresh listing at once, rather than at the next `hello`, so no `isDisabled` check is needed anywhere, and stage returns to `made`. Set aside: the spec's "next hello builds a fresh listing", which needs one.
  * `ensureVault` follows the spec: a listed present vault is answered with no fetch, else `buildVault`. A crossing refuses; another's vault that won is answered locked by `ifPresent: 'get'`. Set aside: the old fetch and `stale_write` retry.
  * Before any `hello`, `vaultOf` and `ensureVault` refuse `bad_option` with `BankHelloFirst`; after a refused one they throw its refusal.
  * `bank.vacate` goes per vault, not `listing.vacate`, since that disables the listing and the bank stays ready here. It leaves the watch on.
  * `tidy` per the Coach's ruling: `leasesProvedBefore` keeps its all-banks scan, `bank.tidy` filters to its own applabel and user_id. A listed vault of that life locks (which erases or panics); else `tryVacate`, refused going to `#panic`.
  * Spec's `#keepDeviceRecord` is `#cacheDeviceRecord`: say cached.
* **Deviations**:
  * Preconditions says every bank call needs ready; `tidy`, `lock`, `vacate`, `sweep` do not. They never throw, and each only makes the device safer, so a refusal would serve nobody. See For the Coach.
  * **A lease that should drop:** `bank.vacate` also erases every own row (`FarFuture` scan), beyond the spec's "each listed vault". An `identity_revoked` on a fresh page has nothing listed, and would leave cached leases behind. No machinery.
  * Spec's end-of-method checks not written: a later thread's, per the handoff.
* **Discoveries**:
  * `DS.cutoff` is `epochMillis`, bounded by `FarPast` and `FarFuture`: `Math.max(0, …)` or `MAX_SAFE_INTEGER` fails as silent bad news. `autolockMinutes: Infinity` gives `FarPast`, tested.
  * `hydrate` and `listing.fetch` both `ensureTimelyWorld`: harmless under the Bank, whose `ensureTimely` is a no-op, but a box under a vault with `maxMillis` 0 could fetch the vault twice. Left.
  * Node has no `globalThis.reportError`: use `vi.stubGlobal`, not `spyOn`.
  * `Vault`'s `delTyping` helper assigns to the world, which a frozen Bank refuses: tests use `vault.delVault()` with the world's dialog.
* **Crossings, for `crossings.md`**:
  * Two crossing `hello`s: the last to answer sets the stage, so an old `hello` refused by a sweep can mark the fresh listing `refused` until the next `hello`.
  * A record changed between `getBank` and the watch's start is not heard until the next fetch (the spec's order).
  * An offline `hello` refuses before `tidy`, so an expired row stays until the next `tidy`; lease age is unchecked at attach, as the progress document records. **This keeps a lease that should drop**, for as long as the page is offline: moving `tidy` first in `#bringUp` would fix it, no machinery, but departs from the spec's order; left for the Coach.
  * A listed live vault whose row is void in `getBank` stays listed until its next fetch.
  * A held lease whose cache row never landed is not found by `tidy`.
* **For the Coach**: the open matters in the PR: `goodbye`'s removal, discards without `hello`, `vacate` erasing all own rows, `BankHelloFirst`'s kind, and whether `tidy` runs first in `hello`.
