# Thread 6: device_owner (2026-11-12)

Branch `20261112-device_owner`, PR #661, cut from thread 2's tip 459b81429 (#658, since merged into main). Justify: green, every package, after the rebase onto c23d53f9c (#660) (safebyok 3131, react 262, fastkey 43, graphql 376, e2e 504, demo 97, ...).

`src/` lines against 459b81429: safebyok +583 -452, safebyok-react +121 -134, safebyok-fastkey +1 -1 (doc only).

* **Built**:
  * `packages/safebyok/src/models/device.ts`: the `Device`. `Device.make(opts)` does no I/O. The options and their check (`deviceOpts` in shapes-vaultish, with `gates: ['main']` required and checked as exactly that; nothing reads it yet). The host-function guards, the bad-news and lifecycle calls, the panic, `isEnabled`, `demandEnabled`, `sweep`, `vacate` (forgets leases and the device row), the one open gating (`attachGating`, `detachGating`, `dismissGatingAtDiscard`, moved from the vault listing), and a `DeviceSnapshot` `{user_id, banklabel, stage, err, openGating, bank}`.
  * `device.ensureBank()` / `tryEnsureBank()`: `deviceDB.ensureCachedDevice`, then `demandEnabled`, then `#bank ??= new Bank(this, device_tok, ...)`, then the deriver and strength checker load, then `listing.list()` and `listing.hello()`, as `hello()` did. `device.bank` is null until then and after a sweep or vacate.
  * `models/bank.ts` slimmed: scope, `device`, `device_tok`, the listing, `ensureVault`, `vaultAt`, `lock`, `autolock`, the probe, and its own `BankSnapshot` `{user_id, banklabel, device_tok, vaults}`. `listOwnLeases` lives here.
  * Exports: `Device`, `DeviceOpts`, `DeviceEvent`, `DeviceStage`, `DeviceSnapshot`, `DefaultOnBadNews`, `DefaultOnLifecycle`, `tellBadNewsTo`; `deviceOpts` from `safebyok/storage`. Gone: `Bank.make`, `bank.hello`, `BankOpts`, `BankEvent`, `BankStage`, the `device_tok` option.
  * React: the provider makes a Device in a layout effect, calls `tryEnsureBank`, sweeps at cleanup; when a different user's device is made it vacates the last one (in `onMade`). `useBank()` answers `device.bank`; `useBankSnapshot()` the device snapshot's `.bank`; new `useDevice()` and `useDeviceSnapshot()`. `useDeviceTok` is gone. `CreateVaultButton` is disabled while `useBank()` is null.
  * Tests: `tests/models/device.test.ts` (new), `bank.test.ts` slimmed, the rest migrated. Demo test, fastkey test, READMEs, VOCABULARY (a **device** row), guarantees.md, configuration notes, old_vocabulary rows.
* **Decisions taken**:
  * `ensureBank` on a ready device returns the bank in hand and announces nothing.
  * The Bank has no enabled flag: its calls ask `device.demandEnabled()`.
  * `BankFriend`, `BankAnnounce`, `BankPanic`, `BankAnnouncement` keep their names (they are the bank's friends, handed by the device). `BadNews.bank` and the event's `bank` became `device`.
  * `autolockMinutes` moved to the Device; the Bank keeps `leaseMillis` for `autolock`.
  * React: `useDevice()` added because `useBank()` is now null until the bank is up, so a host could not sign out (vacate) during a refused or slow bring-up. design.md's "a vacate at a sign-out that comes before any bank" asks for it.
  * React: `useDeviceSnapshot()` added because `BankSnapshot` lost `stage`, `err` and `openGating`.
  * React: the last user's vacate moved from a passive effect in `BankProvider` into `onMade`. The device is now made in the child's layout effect in the same commit as the user switch, so the passive effect saw the new device as the last one and never vacated (a subagent's test migration caught it). Removes a `useEffect`.
* **Deviations** (design.md is pseudo code):
  * `device.bank` is null until the whole bring-up (device row, deriver, listing hello) completes, not "while no bank row is in hand": there are no bank rows until thread 8.
  * The Bank keeps a `subscribe`/`getSnapshot` of its own; design.md's Device snapshot carries it as `.bank`.
  * Paints a host sees: a bring-up paints only `ready` (no `made` stage first), and a vacate paints `disabled` once.
  * A refused `ensureCachedDevice` no longer reaches React's error boundary: it refuses `ensureBank`, which `onLifecycle` hears as a refused `helloed` (warn by default), and the device stays `made`. A bad option still throws from `Device.make` to the boundary.
* **Discoveries**:
  * The fake test world's device must share the fake bank's logger: the default handlers log to `event.device.logger`.
  * A listing sweep no longer dismisses the open gating; the device's sweep does.
  * `STYLE.md`'s `#say-what-to-do` example named `bank.hello()`; now `vault.hello()`.
* **Races** (carried over, no new machinery):
  * Two `ensureBank` calls under way share the one bank through `??=`, and each runs the bring-up (list, hello) once more.
  * A sweep or vacate across `ensureCachedDevice` is caught by `demandEnabled` after it, so no bank is made for a swept device.
  * React: a user switch vacates the last device in the new device's layout effect; the old device was already swept by its own cleanup.
* **For the Coach**:
  * Confirm `useDevice()` and `useDeviceSnapshot()` as new public hooks.
  * Confirm the error-boundary change for a refused `ensureCachedDevice`.
