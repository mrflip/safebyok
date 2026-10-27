# Thread 3: device_db_class (2026-10-27)

Branch `20261027-device_db_class`, PR #TBD, cut from `origin/main` (802c91f9). Justify: running.

`fixup-preplan.md` item 4, whole: DeviceDB becomes an abstract base class, as VaultDB is.

* **Built**:
  - `src/device-db.ts`: `abstract class DeviceDB`. Its seven public verbs make each Outcome
    (through a module-private `deviceOutcomeOf` and the same `deviceTrouble` messages), file each
    row under its Scopepath (`bad_scope` before the store hears of it), parse every lease and device
    record read back, and call the store's `do*` hook before any `await` (constraint 1). Eight
    hooks: `doGetLease`, `doPutLease`, `doDelLease`, `doGetDeviceRecord`,
    `doRaiseDeviceRecord(deviceScopepath, raisedFrom)` (the base owns `raisedDeviceRecord` and hands
    the store an updater: constraint 3), `doDelDeviceRecord`, `doDelAll`, and
    `doDelUnreadable(scopepath, isReadable)`, the conditional discard for both kinds of record
    (constraint 2). `memoryDeviceDB` is `new MemoryDeviceDB()`, one Map, each hook one sync step.
  - `src/idb.ts`: `class IdbDeviceDB extends DeviceDB`; its change bell and stray sweep stay in its
    own hooks; `discardedIfUnreadable` became `doDelUnreadable`, now used for device records too.
  - `deviceTroubleAsConditions`, `guarded` gone; `bank.ts`, `vault.ts`, `del-damaged-vault.ts` call
    `parts.deviceDB` directly. `parseDeviceDB` checks `instanceof DeviceDB` plus the shape.
  - Tests: `describeDeviceDB` gains the device-record race (fails on main's idb store, checked), the
    lease race (from idb.test.ts, now for both stores) and a discard test. `device-db.test.ts` tests
    the base class through a scripted subclass (hook order, scopepaths, discard, updater, throws).
    `TH.spyOnDeviceHook(deviceDB, verb)` (in `safebyok/testing`) replaces every spy that made a
    public verb reject, which a DeviceDB can no longer do.
  - README *Your own storage adapter*: a subclass example over an app's own IndexedDB (`idb`).
  - Changeset `minor`; notes/security.md through a `sonnet` subagent.

* **Decisions taken**:
  - **Hooks take scopepaths, not scopes** (VaultDB's take scopes). Every device store is a
    key-value shelf; the base files rows so no store builds a scopepath, and one `doDelUnreadable`
    serves both kinds of record.
  - **`deviceOutcomeOf` leaves the exports and stays module-private**; **`raisedDeviceRecord`
    leaves the exports too** (the base owns the rule; still exported from device-db.ts for its tests).
  - **`doRaiseDeviceRecord` resolves nothing**: the base resolves what `raisedFrom` last returned,
    as idb's raise did.
  - **No new input checks**: `putLease` and `raiseDeviceRecord` still store what they are handed,
    as before; the conformance tests plant unreadable rows through them.
  - The base class is not frozen (VaultDB's subclasses are not; tests spy on instances).

* **Deviations**:
  - **`isOutcomeShaped` stays.** On this branch `adapterAnswer` (vault-db.ts) still calls it; thread
    1 removes that call. Whichever of threads 1 and 3 lands second, or the restack, deletes it and
    its test in outcome.test.ts.
  - `del-damaged-vault.test.ts`'s flaky store became a hook spy rather than a subclass;
    `safebyok-react/tests/bank-provider/world.tsx` had no object-literal store (types only).

* **Discoveries**:
  - **A host's own DeviceDB that handed back unchecked rows** used to reach the vault's
    `Lease.make` check, which warned "lease could not be read ... left where it lies" and left the
    row. The base now discards such a row silently, as memoryDeviceDB and idbDeviceDB always did;
    the warning remains for a lease that reads but names another scope. Fifteen vault tests were
    rewritten to say so (vault-lease *SpoiledWayins* split into discarded and foreign rows).
  - The machine is slow: a full `eslint src tests` exceeded 5 minutes; lint files one by one.

* **For the Coach**: see the PR's *Open questions*.
