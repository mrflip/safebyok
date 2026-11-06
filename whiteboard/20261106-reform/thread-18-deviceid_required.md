# Thread 18: device_id required, no device record (2026-11-06)

Branch `20261106-deviceid_required`, PR #TBD, stacked on #527. Justify: green (safebyok 1848 tests,
61 files; every package green).

* **Built**: `device_id` is a required field of `bankOpts` (`shapes/shapes-vaultish.ts`), still the
  `label` rule #527 gave it; `Bank.make` mints none (`randomId` import gone). `Bank.device_id` is a
  plain `readonly` prop set from the option, where it was a private field behind a getter that
  `hello` reassigned. `Bank.#cacheDeviceRecord` and its call from `#bringUp` are gone. The device
  record is gone: `DeviceDB.cacheDeviceRecord`, `tryCacheDeviceRecord`, `doCacheDeviceRecord`,
  `DeviceCached`, the `deviceRecord` checker and `DeviceRecord` type (`shapes/shapes-storage.ts`),
  `MemoryDeviceDB`'s `#devicerows` and `_cheat_deviceRows` (and its `eslint-disable-line`), the
  `deviceRecordRewritten` thrower and `DeviceRecordRewritten` phrase. The DeviceDB keeps leases only.
  Tests: the device-record describe in `device-db-new.test.ts`, the "adopts the first device_id"
  bank test (now "keeps the device_id it was handed", two banks on one device each keep their own),
  the "mints a device_id" test (now refuses 'bad_option' with none), and the sweep-crosses-the-cache
  test in `bank-ending.test.ts` (nothing to cross any more). `bank-world.ts` gives `device_one`, and
  `bankOnAnotherDevice` `device_two`. Changeset `minor`.
* **Decisions taken**: `device_id` became a public readonly prop rather than keep `#device_id` and a
  getter: nothing reassigns it now, so the getter was machinery left over; the props sit in the
  constructor's destructure in one line, as thread 7 wants. `vault-world.ts` needed no change: on this
  branch it holds lease rows only.
* **Deviations**: also removed `Phrases.DeviceScopepathShape` (a device record's scopepath, used only
  by `phrases.test.ts`), dead with the record. No README or CUSTOMIZATION change: neither shows
  `device_id` for the core's `Bank.make` (the README's `Bank.make` is the old core's).
* **Discoveries**: `notes/guarantees.md`, on main and on #528's branch alike, names no device record
  (no G4 device-store sentence, no *Bytes* bullet about it), so this thread has **no guarantees.md
  hunk** for the restack. #527's changeset still says the core mints a `d`+hex id; this thread's
  changeset supersedes it in the same release. `NOTYET.md`'s *What we record now* (device_id random,
  minted per vault per device) describes the old core; left alone.
* **Hunks that meet #511** (`20261105-refusal_followups`): `refusals/throwers.ts` (my removal of
  `deviceRecordRewritten` sits on #511's `@@ -51` context line), `helpers/phrases.ts` (my removal of
  `DeviceRecordRewritten` is the context above #511's `@@ -453`), `tests/test-helpers/bank-world.ts`
  (`baseOpts`, the line under #511's `requestCleartext` change), `shapes/shapes-vaultish.ts`
  (`bankOpts`: my `device_id` line, #511's `refusalKind` → `refusalkind` a dozen lines down, likely
  clean), `tests/models/bank.test.ts` and `bank-ending.test.ts` (different hunks, likely clean). Each
  resolves by taking both sides.
* **For the Coach**: the deviceId row's privacy line. With the host choosing `device_id`, "never drawn
  from anything about the device" is now advice to the host, not a promise of ours. The row below
  keeps it as advice; say if it should go.

## VOCABULARY rows for #518

Per the orchestrator, carried after the restack onto `20261106-vocab_sweep` (not committed there by
this thread). Against #518's current text:

| **deviceId**             | The host's id for this device in a bank's scope (`device_id`), a label, which `Bank.make` requires. safebyok mints none and keeps no record of it. Each wayin carries the deviceId of the device that built it, visible in storage. A random id the host keeps per device is best: one drawn from anything about the device would link what the vault does not. The `device_id` and `user_id` are provided in the options. If those contain sensitive data please hash them first: `user_id: await sha256Hex(email)`. | installation id (scoped) |

| **device record**               | None is kept. The deviceDB holds leases only, and a bank's deviceId is the `device_id` the host hands `Bank.make`. A store's device-record rows from before are no longer read. |

Also on #518, the **deviceDB** row: drop "and device record" and the sentence "The device record goes
through `cacheDeviceRecord`."
