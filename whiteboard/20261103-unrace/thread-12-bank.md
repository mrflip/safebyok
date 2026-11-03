# Thread 12: bank (2026-11-03)

Branch `20261103-bank`, PR #460, stacked on #459. Justify: green; safebyok 4755 passed, 37 skipped, `bank.test.ts` 40.

* **Built**: `models/bank.ts` to the spec's Bank and Public tables.
  * `hello` / `tryHello`: `try` { loads the deriver and checker, `listing.fetchBank()` (new in `vault-listing.ts`: `getBank` lists every vault and tombstone, a damaged row is `damaged_record` bad news naming its vaultlabel) } `finally` { `tidy` }, then `#cacheDeviceRecord` (first `device_id` wins; `rewrote` is bad news), `listing.hello()`, `listing.demandEnabled()`.
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
  * `bank.vacate` goes per vault, not `listing.vacate`, since that disables the listing and the next `hello` lists on this one. It leaves the watch on, and declines the open gating itself, a birth's too.
  * `bank.vacate` sets `#lastHello` to null: `stage` is `made`, and `ensureVault` and `vaultOf` refuse `BankHelloFirst` until the next `hello`, for a plain vacate and for `identity_revoked` alike. Set aside: the spec's "the bank unchanged, ready", under which `ensureVault` took the emptied slot as free and asked a new passphrase for a vault that exists. The spec's line is corrected at thread 14.
  * `tidy` in `hello`, per the Coach (2026-11-03: "I agree it should run once it has ground truth, but not if it is awkward to give that priority"). It needs nothing `getBank` brings: what to erase comes from the deviceDB's scan and the bank's autolock alone, and the listing only routes the erase (a listed vault of that life locks, else `deviceDB.tryVacate`), the row going either way. A plain `try` / `finally` around the loads and `fetchBank` is not awkward, so `tidy` runs after `getBank` has answered or refused, a refused plugin load included. Set aside: `tidy` first, the reviewer's move (no ground truth), and last, the spec's order (past two more awaits, for nothing). `tidy` never throws, so it cannot mask `hello`'s refusal: a test row refuses both.
  * `tidy` per the Coach's ruling: `leasesProvedBefore` keeps its all-banks scan, `bank.tidy` filters to its own applabel and user_id. A listed vault of that life locks (which erases or panics); else `tryVacate`, refused going to `#panic`.
  * Spec's `#keepDeviceRecord` is `#cacheDeviceRecord`: say cached.
* **Deviations**:
  * Preconditions says every bank call needs ready; `tidy`, `lock`, `vacate`, `sweep` do not. They never throw, and each only makes the device safer, so a refusal would serve nobody. See For the Coach.
  * **A lease that should drop:** `bank.vacate` also erases every own row (`FarFuture` scan), beyond the spec's "each listed vault". An `identity_revoked` on a fresh page has nothing listed, and would leave cached leases behind. No machinery.
  * Spec's end-of-method checks not written: a later thread's, per the handoff.
  * `hello`'s order: `tidy` comes before the device record and the watch, not last as in the spec. Thread 14 can take this with the vacate line.
* **Discoveries**:
  * `DS.cutoff` is `epochMillis`, bounded by `FarPast` and `FarFuture`: `Math.max(0, …)` or `MAX_SAFE_INTEGER` fails as silent bad news. `autolockMinutes: Infinity` gives `FarPast`, tested.
  * `hydrate` and `listing.fetch` both `ensureTimelyWorld`: harmless under the Bank, whose `ensureTimely` is a no-op, but a box under a vault with `maxMillis` 0 could fetch the vault twice. Left.
  * Node has no `globalThis.reportError`: use `vi.stubGlobal`, not `spyOn`.
  * `Vault`'s `delTyping` helper assigns to the world, which a frozen Bank refuses: tests use `vault.delVault()` with the world's dialog.
* **Crossings, for `crossings.md`**:
  * Two crossing `hello`s: the last to answer sets the stage, so an old `hello` refused by a sweep can mark the fresh listing `refused` until the next `hello`.
  * A record changed between `getBank` and the watch's start is not heard until the next fetch (the spec's order).
  * Fixed: an offline `hello` no longer refuses before `tidy`.
  * A `getBank` or plugin load that never answers holds `tidy` back, with no timeout, per CLAUDE.md. **Keeps a lease that should drop** until it answers or a host's own `tidy`.
  * A page's held lease outlives its row when another page's `tidy` erases that row: `tidy` finds leases by their rows, so the vault stays unlocked past autolock until something locks it. **Keeps a lease that should drop.**
  * A birth past the enter key finishes and caches its lease after `bank.vacate`, as a gating mid-attempt settles on that attempt's answer. **Keeps a lease that should drop.**
  * A `hello` crossing `bank.vacate` lands `ready`, on the listing the vacate emptied or on what it lists after.
  * The watch stays on past `bank.vacate`, so a notice can list a vault in the snapshot of a bank not ready, until the next `hello`.
  * A listed live vault whose row is void in `getBank` stays listed until its next fetch.
  * A held lease whose cache row never landed is not found by `tidy`.
* **For the Coach**: the open matters in the PR: `goodbye`'s removal, discards without `hello`, `vacate` erasing all own rows, and `BankHelloFirst`'s kind. The review's minor list is recorded in its comment on the PR, and was not acted on.
