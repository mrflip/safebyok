# Thread 4: device_db (2026-11-03)

Branch `20261103-device_db`, PR #452, off main. Justify: green; 26 tests in `tests/storage/device-db-new.test.ts`.

* **Built**, in `packages/safebyok/src/storage/`, beside thread 2's vaultDB (not in this base; same layering):
  * `device-db-new.ts`: abstract `DeviceDB`. Lease verbs `cache(row)`, `peek(asked)`, `vacate(asked)`, `leasesProvedBefore(cutoff)`; device record verb `cacheDeviceRecord(record)`; a `try*` of each answering an Outcome. Generic calls: `doCache`, `doPeek`, `doVacate`, `doLeasesProvedBefore`, `doCacheDeviceRecord`.
  * `memory-device-db.ts`: `MemoryDeviceDB`, generic calls only, rows cloned in and out; `_cheat_leaseRows()` and `_cheat_deviceRows()` for tests.
  * `device-db-shapes.ts` (`DS`): checkers `leaseQuery` (scope + `vault_tok`, 'bad_scope'), `leaseRow` (scope, `vault_tok`, `proved_at`, loose), `leaseSparse`, `deviceRecord` (`applabel`, `user_id`, `device_id`, strict), `cutoff` ('bad_option').
  * `device-db-refusals.ts`: `storeFailed`, `storage_unavailable` naming the verb and the thrown `name` only.
* **Decisions taken**:
  * Lease verbs are the bare `cache`, `peek`, `vacate`, as the specs write them (`deviceDB.vacate`); the record's is `cacheDeviceRecord`. Thread 7 binds `peekLease`, `tryCacheLease`, `tryUncacheLease` to these.
  * One lease row per vault scope. `peek` answers a row only under the asked `vault_tok`; another life's row, or one failing its check, is null. `vacate` erases only a row under the asked `vault_tok`, so an old life's vacate spares the new life's lease. A damaged lease row is not vacated (it is overwritten by the next `cache`).
  * `leasesProvedBefore(cutoff)` spans every bank on the device (`proved_at` strictly under the cutoff, oldest first) and answers sparse rows (scope, `vault_tok`, `proved_at`): the `lease_key` handle never leaves through it.
  * `cacheDeviceRecord` answers `{ act, record }`: `born` (none), `held` (a good record stood; the first `device_id` is the bank's), `rewrote` (a damaged one written over: the bank's bad news). The bank scope is the key; the record carries no vaultlabel and no epoch (the old `highest_vault_epoch` is not in the slim models).
  * The first-wins decision is made inside the store's step: `doCacheDeviceRecord(record, isHeld)` stores unless `isHeld` accepts the stored row, and answers the row it found.
  * Order: each verb runs its `do*` before its first `await`, and the memory store works synchronously; tests pin cache/vacate and peek/vacate called without awaiting.
  * No new refusal kinds: `bad_scope`, `bad_record`, `bad_option`, `storage_unavailable` exist on main. Thread 2's `damaged_record` / `invalid_input` / `storage_error` are not in this base, so nothing here depends on them.
* **Deviations**: none from the handoff. The old `src/device-db.ts` is untouched; names do not collide (`DeviceDB` here is in `storage/device-db-new`).
* **Discoveries**: `structuredClone` of a non-extractable `CryptoKey` works in Node, so the memory store clones lease rows as an IndexedDB one would. `query` is a banned binding name (lint), so the verbs take `asked`.
* **For the Coach**: no suppressions but two `eslint-disable-line unicorn/prefer-private-class-fields` on the `_cheat_*` methods, as thread 2 has. When both threads are in, `device-db-shapes.ts` and `vault-db-shapes.ts` could share a scope checker; not worth doing now.
