# Thread 15: the deviceDB's bank row (2026-11-07)

Branch `20261107-device_bank`, PR [#586](https://github.com/mrflip/safebyok/pull/586), cut from `origin/main` at c3a38219e. Justify: green (safebyok 2468 tests,
every package green, size budgets met).

* **Built**:
  * `SX.bankRow` / `BankRow` (`shapes/shapes-storage.ts`, *The deviceDB*): `{ applabel, user_id, device_id }`, strict,
    `objCheck` refusing `bad_record`; exported from `safebyok/storage` beside `leaseRow`.
  * `DeviceDB` *Bank verbs* (`storage/device-db-new.ts`): `ensureBank(scope)` / `tryEnsureBank` -- parses the scope with
    `CX.bankScope` (`bad_scope`, extras stripped), mints `device_id` with `randomId()` (`crypto.randomUUID`), hands the
    made row to `doEnsureBank`, and parses what the store answers with `SX.bankRow`; `listRawBanks()` /
    `tryListRawBanks` -- every bank row as a bag, unchecked, for thread 8's inspector. Refusals by `refusalOf`
    (`storeFailed`), as the lease verbs. Two new abstract hooks: `doEnsureBank(made)`, `doListBanks()`.
  * `MemoryDeviceDB`: `#bankrows` Map, `_cheat_bankRows()`.
  * `IdbDeviceDB`: `#bankShelf`, a versioned shelf over the database `${dbName}:bank-v001-001-001`, store `bank`, keyed
    `[applabel, user_id]`; `doEnsureBank` is one readwrite transaction: `rowAt`, then `put(made)` unless a row passing
    `SX.bankRow` stands. `BankDBVersion` in `helpers/consts.ts`. The lease shelf is `#leaseShelf` now.
  * Battery (`tests/test-helpers/device-db-battery.ts`): `DeviceDBRowCheats` gains `plantBankRow`, `bankRowsOf`;
    cases for `ensureBank` (fresh UUID, same row again, scopes apart, two calls at once answer one row, a vault scope
    stripped, copy handed back, apart from leases, damaged row made afresh, bad scope refused, try form) and
    `listRawBanks`; the storage-fails case covers both new verbs. `device-db-new.test.ts` covers a throwing store and a
    store answering a row that fails its check (`bad_record`).
  * VOCABULARY: *deviceId*, *device record, bank row*, *deviceDB* say what is kept now. `notes/security.md`: the
    sonnet subagent amended the 2026-10-16 `device_id` entry (header's rule: amend in place).
  * Changeset `.changeset/20261107-device_bank.md`, minor (new abstract hooks break a host's DeviceDB subclass).

* **Decisions taken**:
  * A damaged bank row is replaced in the same step, never refused: a deviceDB is a cache, there is no delete verb for
    bank rows, and refusing would leave `BankProvider` stuck forever. The device then goes by a new `device_id`, which
    only changes what later wayins carry. The store holds the check (as `doForget` does for leases) so the replacement
    is atomic with the read.
  * The base mints the UUID; stores only store, so every store's `device_id` is `crypto.randomUUID`.
  * `put`, not `add`, in IndexedDB, so the damaged-row replacement shares the path.
  * `listRawBanks` added (natural beside `listRawLeases`); no `delRawBank` (not asked; a damaged row heals itself).
  * `BankRow` exported from `safebyok/storage` only, as `LeaseRow` is.

* **Deviations**:
  * **A database of its own, not a second object store in the device database.** The gloss said a new object store,
    bumping `device-v001-001-001`. But `versionedShelfOf` (`idb-shelf.ts`) is built on idb-keyval's `createStore`,
    one object store per database; two stores in one database means hand-rolling the IndexedDB open and its
    `upgradeneeded` (CLAUDE.md: hand-rolling needs a Coach's yes) or a new dependency (`idb`). A second versioned shelf,
    `${dbName}:bank-v001-001-001`, uses the machinery as it stands, and no device forgets its remembered unlocks. Set
    aside also: bank rows in the `leases` store under 2-part keys (the store's name would lie, and `getAll` would need
    key ranges to keep leases apart). If the Coach wants one database, the rework is a two-store open in `idb-shelf.ts`
    plus `DeviceDBVersion` to `001-002-000`; the DeviceDB API and thread 16 are unaffected.

* **Discoveries**:
  * The IndexedDB `failNextCall` hook must open both databases first, or the bank database's upgrade transaction is
    the one that fails.
  * `notes/gallant.md` `#ask-the-host` (line ~711) says "the deviceDB serves leases alone": that clause is stale now,
    though its point (`Bank` mints nothing, `device_id` a required `Bank.make` option) stands. Left whole (gallant is the
    Coach's, for reviewers).

* **For the Coach**: the database deviation above; the gallant clause. One new `eslint-disable-line unicorn/prefer-private-class-fields` on `MemoryDeviceDB._cheat_bankRows`, as on `_cheat_leaseRows`.

* **For thread 16**: `const { device_id } = await deviceDB.ensureBank({ applabel, user_id })`, then `Bank.make({ ...,
  device_id })`. It refuses `bad_scope` for a bad scope, `storage_unavailable` for a failing store.
