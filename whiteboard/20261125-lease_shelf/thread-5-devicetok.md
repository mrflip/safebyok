# Thread 5: devicetok (2026-11-25)

Branch `20261125-devicetok`, PR #910, stacked on #909. Proved: safebyok 2170 tests, safebyok-react-lean 339,
safebyok-big 2951, dojo 111, each typechecked and linted; `pnpm justify` after the catch-up (see the PR's **Tests:**).

* **Built**:
  * `DeviceDB.ensureDevicetok()` (`packages/safebyok/src/storage/device-db.ts`): this device's devicetok, one for every
    bank and tab given the database. It answers the one stored, or stores and answers a fresh `Crypto.randomId()` where
    none is or the one stored fails `BankishChecks.devicetok`, in one step (`doStowDevicetok(made, isReplaced)`, shaped
    as `doStowLease`). A subclass's throw refuses `storage_unavailable` (`refusalOf`). Memory keeps it in a field
    (`#devicetok`, cheat `_cheat_plantDevicetok`); IndexedDB files it in the lease store under the string key
    `DevicetokCkey = 'devicetok'`, which never meets a lease's array scopepath. `isDeviceDB` asks for the verb too.
  * `Device.ensureDevicetok()` (`models/device.ts`): the host's `devicetok` option (new on `DeviceOpts`, checked as a
    UUID), else `deviceDB.ensureDevicetok()`. Where the deviceDB refuses, it tells `onBadNews` and answers a fresh token
    for that call alone, as `World.#stowLease` does with a refused lease stow: the wayin is still built.
  * Read at each wayin build, nowhere else: `PassphraseProving.buildNovel` and `PasskeyProving.buildNovel` await
    `device.ensureDevicetok()` and hand it to `mintPassphraseHeader` / `mintPasskeyHeader`. `ProvingDevice` is big's
    `GX.provingDevice` without `device_tok`, with `ensureDevicetok: fn()`.
  * Rename `device_tok` → `devicetok`, `DeviceTok` → `Devicetok` throughout safebyok, safebyok-react-lean and their
    tests; the wayin header and so the ctx bytes (`ctx-bytes.test.ts`) included. safebyok-idb-lean and
    safebyok-postgres had no `device_tok`.
  * safebyok-big gains `CX.devicetok` and `Phrases.DevicetokShape` beside `device_tok` (the orchestrator's call; a new
    checker, which CLAUDE.md allows). Nothing on big changed otherwise.
  * Tests: a `describeDeviceDBDevicetokBattery` beside the lease battery (`tests/test-helpers/devicedb-battery.ts`), run
    for memory and IndexedDB; `device.ensureDevicetok()` cases in `device.test.ts`; `ensureDevicetok`'s refusal in
    `memory-device-db.test.ts`.
* **Decisions made**:
  * **Read lazily, at each wayin build**, not at sign-in: no state on the device beyond the host's option, nothing on
    sign-in's path (which restores roots synchronously), and a gate verb is rare enough to pay a local read. A birth
    with a passkey reads twice; both answers are the same.
  * **A damaged devicetok stored is replaced**, not refused: nothing else reads it, and big did the same with its row.
  * **The device drops it from `toJSON`, its spread, and the bank's getter** (`bank.device_tok` is gone): it is async now.
  * **Filed per device, as briefed**, not per bank scope. See *For the Coach*.
* **Deviations**:
  * **The dojo demo is on the new core** (`safebyok` and `safebyok-idb-lean`), though the brief named `demos/*` as on
    big: its three `Device.make` calls drop `device_tok`, and its fixture is written again (`pnpm --filter
    safebyok-demo-dojo fixture`). safebyok-demo-react, still on big, is untouched.
  * `NOTYET.md`'s device lock-out item now says `devicetok`, one per device database.
* **Discoveries**:
  * `device_tok` was bound into the wayin ctx (`wayinCtxOf` binds the whole header through `cipherCtx`); the Coach ruled
    the rename may change the bytes. Recorded in `notes/guarantees-drift.md` and `notes/security.md` (an amendment line
    on the 2026-11-14 lean_gate entry, which already covers the header's binding).
  * The checker was big's `CX.device_tok`; big now has `CX.devicetok` beside it.
  * The react-lean provider's "Cheat (react_life): a fresh device_tok for each device" is gone.
* **For the Coach**:
  * **One devicetok per device, or per bank scope?** As briefed it is one per device database, so two users' banks built
    in one browser record the same devicetok, which a storage reader could link. Big's `device_tok` was one per bank
    scope, and `NOTYET.md` recorded that as the design ("a random `device_tok` per bank per device"). Recommend per bank
    scope: `ensureDevicetok(scope)` filed under `[userid, banklabel, 'devicetok']`, the same size of change.
  * **The devicetok lives in the lease database** (`safebyok:lease-v…`, store `leases`). Recommend leaving it there
    until the database is renamed for everything it keeps.
