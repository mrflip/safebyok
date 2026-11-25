# Thread 1a: device_db (2026-11-25)

Branch `20261125-device_db`, PR #903, on main (#899 merged); rebased onto 0 `connect` at filing. Proved: `pnpm --filter
safebyok lint` and `typecheck` clean; `tests/storage/memory-device-db.test.ts` 33, `tests/storage/idb-device-db.test.ts`
36, `tests/browser.test.ts` 5; the package's whole suite 2063 in 33 files. `pnpm justify` green after the catch-up onto main, 8315 tests.

* **Built**:
  - `packages/safebyok/src/storage/device-db.ts`: abstract `DeviceDB` with `peekLease(scope)`, `stowLease(row)` and
    `listen(listener)` (answers an unlisten). The base validates each verb's input, decides what is newer, parses what
    it reads, and maps failures: a VaultError passes, anything else is `storage_unavailable` through
    `Throwers.deviceDBFailed` (the thrown thing's name only, G8); a stored row that fails its check is `damaged_lease`
    (`Throwers.damagedLease`). Subclasses fill `doPeekLease`, `doStowLease(row, isReplaced)` (one transaction: read,
    put when `isReplaced(before)`, answer `before`), `doRing(scope)` and `doListen(hear)`. A rung that is not a bank
    scope is dropped.
  - `memory-device-db.ts`: `MemoryDeviceDB`, structuredClone in and out, rings each listener on a microtask;
    `_cheat_rows()` and static `ckeyOf` for tests.
  - `idb-device-db.ts`: `IdbDeviceDB` / `idbDeviceDB({dbName})` over big's `versionedShelfOf` (database
    `safebyok[-<dbName>]:lease-v001-001-001`, store `leases`, key `[userid, banklabel]`), bell
    `safebyok[-<dbName>]:lease` as a BroadcastChannel, a fresh channel per ring so this tab's own listeners hear it too.
    Also `idbDeviceDBOpts`, `LeaseDBVersion`, `leaseDatabasenameOf`, `leaseBellnameOf`, `scopepathOf`.
  - Row shapes in `src/shapes/shapes-stamps.ts` (`LeaseChecks`): `leaseRecord` (stamp + keys), `liveLeaseRow`
    (record + row citations + `am: 'a'` + `ends_at` + `gate_revseq`), `leaseTombstone` (row citations + `am: 'x'`),
    `leaseRow` their union. Row citations: `fmt`, scope, `lifeseq`, `lifepath`, `revseq`, `revtok`, `written_at`. Both
    strict and refined: lifepath is the lifeseq alone (`Phrases.LeaseLifepathOwn`), and parity matches `am`
    (`isParityRight`). `src/shapes/shapes-device-db.ts`: `LeaseListener`, `DeviceDBChecks.listenArgs`.
  - Entries: `safebyok/storage` exports `DeviceDB`, `MemoryDeviceDB`, `LeaseListener`, `DeviceDBChecks` and the
    lease types; `safebyok/browser` exports the new `IdbDeviceDB` and its kin, and its own `browserOpts`, one frozen
    bag per dbName, handing the new deviceDB (big's browserOpts and IdbDeviceDB are no longer re-exported).
  - Tests: `tests/test-helpers/devicedb-battery.ts` (`describeDeviceDBLeaseBattery`, over both stores),
    `tests/test-helpers/devicedb-world.ts` (`liveLeaseRowOf`, `leaseTombstoneOf`, for 1b too).
  - Notes: VOCABULARY (*lease record* amended, **lease row** added, *ring* mentions the deviceDB), a G4 entry in
    `notes/guarantees-drift.md`, a wontfix row for two tabs stowing at once, a `notes/security.md` entry (by a sonnet
    subagent), an empty changeset.
* **Decisions made**:
  - The row has a life and revision of its own (`lifeseq`, `lifepath` equal to it, `revseq`, `revtok`), so
    `BaseThing.cmp` orders it as it orders Things. The revtok lets 1b tell two rows of equal rank apart. No
    `labelpath` or `label`: the lease row is not a Thing in the bank's tree.
  - A tombstone carries only the row citations: no stamp, no `born_at`, no keys, no `ends_at`.
  - A stow over a damaged row writes: otherwise a damaged row would hold its scope forever, and G4's "until a later
    stow over its scope" would be the only way out with no stow able to take it.
  - The database stem is `lease`, not big's `device`: a shelf of the same stem at a newer version would delete big's
    databases, which the demo and e2e still use.
  - No `try` forms and no `isDeviceDB`. A duck guard to an abstract class with protected members is a type lie; 1b
    adds a duck check if the Device needs one.
  - A listener is our own code (1b's World), so it is not wrapped: a throw in it is uncaught, on its own microtask or
    message event, never inside the stow.
* **Deviations**: big's `browserOpts` / `IdbDeviceDB` re-exports in `safebyok/browser` are replaced by the new core's;
  `Device.make` still ignores `deviceDB` (1b). No `forgetLease` (dropped by the handoff: a lock stows a tombstone).
* **Discoveries**:
  - `ends_at` must fall within the epochMillis bounds (1981 to 2255), so the tests use `2e12` for a distinct value.
  - Big's testing entry already exports a `DeviceDBBatteryOpts`; the new battery's is `DeviceDBLeaseBatteryOpts`.
* **For the Coach**: the row's shape (own life and revision, keyless tombstone) and the stow-over-damaged rule are mine;
  see *Open questions* in the PR.
