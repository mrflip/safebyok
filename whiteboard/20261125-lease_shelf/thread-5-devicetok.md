# Thread 5: devicetok (2026-11-25)

Branch `20261125-devicetok`, PR #910, stacked on #909. Proved: safebyok 2177 tests, safebyok-react-lean 339,
safebyok-big 2951, dojo 111, each typechecked and linted; `pnpm justify` after the catch-up (see the PR's **Tests:**).

* **Built**:
  * `DeviceDB.ensureDevicetok(scope)` (`packages/safebyok/src/storage/device-db.ts`): the devicetok of the bank at
    `scope` (a `BankScope`, checked by `StampChecks.bankScope`), one per bank scope, the same for every tab given the
    database. It answers the one stored, or stores and answers a fresh `Crypto.randomId()` where none is or the one
    stored fails `BankishChecks.devicetok`, in one step (`doStowDevicetok(scope, made, isReplaced)`, shaped as
    `doStowLease`). A subclass's throw refuses `storage_unavailable` (`refusalOf`). Memory keeps a map by
    `MemoryDeviceDB.devicetokCkeyOf(scope)` (cheat `_cheat_devicetoks()`, the map itself, as `_cheat_leases` is); IndexedDB files it in the
    lease store at `devicetokScopepathOf(scope)` = `[userid, banklabel, 'devicetok']` (type `DevicetokScopepath`,
    exported beside `LeaseScopepath`). That never meets a lease's scopepath `[userid, banklabel, labelpath]`, since a
    lease's labelpath always matches `lease/<label>` (`LeaseLabelpathPattern`). `isDeviceDB` asks for the verb too.
  * `Device.ensureDevicetok(scope)` (`models/device.ts`): the host's `devicetok` option (new on `DeviceOpts`, checked as a
    UUID), else `deviceDB.ensureDevicetok(scope)`, for the bank at the `scope` it is handed (signed in or not). Where the
    deviceDB refuses, it tells `onBadNews` and answers a fresh token for that call alone, as `World.#stowLease` does with a refused lease stow: the wayin is still built.
  * Read at each wayin build, nowhere else: `PassphraseProving.buildNovel` and `PasskeyProving.buildNovel` await
    `device.ensureDevicetok(bankStamp)` (the bank scope the proving already holds, as `judgeStrength` is handed one) and
    hand it to `mintPassphraseHeader` / `mintPasskeyHeader`. `ProvingDevice` is big's `GX.provingDevice` without
    `device_tok`, with `ensureDevicetok: fn(scope)`.
  * Rename `device_tok` → `devicetok`, `DeviceTok` → `Devicetok` throughout safebyok, safebyok-react-lean and their
    tests; the wayin header and so the ctx bytes (`ctx-bytes.test.ts`) included. safebyok-idb-lean and
    safebyok-postgres had no `device_tok`.
  * safebyok-big gains `CX.devicetok` and `Phrases.DevicetokShape` beside `device_tok` (the orchestrator's call; a new
    checker, which CLAUDE.md allows). Nothing on big changed otherwise.
  * Tests: a `describeDeviceDBDevicetokBattery` beside the lease battery (`tests/test-helpers/devicedb-battery.ts`), run
    for memory and IndexedDB; `device.ensureDevicetok(scope)` cases in `device.test.ts`; a `proving.test.ts` case that both `buildNovel`s hand the device the bank stamp; `ensureDevicetok`'s refusal in
    `memory-device-db.test.ts`.
* **Decisions made**:
  * **Read lazily, at each wayin build**, not at sign-in: no state on the device beyond the host's option, nothing on
    sign-in's path (which restores roots synchronously), and a gate verb is rare enough to pay a local read. A birth
    with a passkey reads twice; both answers are the same.
  * **A damaged devicetok stored is replaced**, not refused: nothing else reads it, and big did the same with its row.
  * **The device drops it from `toJSON`, its spread, and the bank's getter** (`bank.device_tok` is gone): it is async now.
  * **The proving hands the device the bank's scope** (rework, the orchestrator's YOLO call on the review): first,
    `Device.ensureDevicetok()` took none and read `this.scope`, so a proving (handed `bankStamp`) depended on the
    device's sign-in state, and refused `absent_vault` before signin. Reversed: the scope is an argument, nothing reads
    the device's scope, the refusal is gone, and the host's `devicetok` still wins.
  * **One per bank scope** (rework, the orchestrator's YOLO call on my open matter): first built one per device
    database, as briefed, which let a storage reader link two users' banks in one browser by their shared devicetok.
    Big's `device_tok` was per bank scope, and NOTYET.md recorded that as the design. Set aside: a scope-free
    `ensureDevicetok()` on the device that falls back to a database-wide token before signin (it would bring the
    linkable token back by a side path).
* **Deviations**:
  * **The dojo demo is on the new core** (`safebyok` and `safebyok-idb-lean`), though the brief named `demos/*` as on
    big: its three `Device.make` calls drop `device_tok`, and its fixture is written again (`pnpm --filter
    safebyok-demo-dojo fixture`). safebyok-demo-react, still on big, is untouched.
  * `NOTYET.md`'s device lock-out item now says `devicetok`, one per bank per device.
* **Discoveries**:
  * `device_tok` was bound into the wayin ctx (`wayinCtxOf` binds the whole header through `cipherCtx`); the Coach ruled
    the rename may change the bytes. Recorded in `notes/guarantees-drift.md` and `notes/security.md` (an amendment line
    on the 2026-11-14 lean_gate entry, which already covers the header's binding).
  * The checker was big's `CX.device_tok`; big now has `CX.devicetok` beside it.
  * The react-lean provider's "Cheat (react_life): a fresh device_tok for each device" is gone.
* **For the Coach**:
  * **The devicetok lives in the lease database** (`safebyok:lease-v…`, store `leases`, now at
    `[userid, banklabel, 'devicetok']`). Recommend leaving it there until the database is renamed for everything it keeps.
