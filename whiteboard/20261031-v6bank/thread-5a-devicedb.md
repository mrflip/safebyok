# Thread 5a: devicedb (2026-11-01)

Branch `20261101-devicedb`, PR [#437](https://github.com/mrflip/safebyok/pull/437), stacked on [#434](https://github.com/mrflip/safebyok/pull/434) (`20261101-bank_eviction`).
Justify: green. safebyok 4938 passed / 37 skipped; root 290; react 326; demo 230/17;
indexeddb 167/11; postgres 322/15; fastkey 49; convex 375/9; graphql 345/15; e2e 107/116.

* **Built**
  * **The rename** (commit 239a7f56). `incrementDeviceRecord` and its family become
    `advanceDeviceRecord`, `tryAdvanceDeviceRecord` and `doAdvanceDeviceRecord`, on the old
    surface. Prose that said "raised" now says "advanced", VOCABULARY.md included, and so does
    the local `advance` in vault-hello.test. The changeset names the moved exports.
  * **`src/devicedb/devicedb.ts`**: the models' `DeviceDB`, copied from `src/device-db.ts` and
    slimmed.
    * Its verbs, each with a try pair: `getLease`, `putLease`, `delLease`, `getDeviceRecord`,
      `advanceDeviceRecord`, `findCachedVaults`, `putCachedVault`, `vaultCache(scope)` (the
      listing's `Cache`), `clearCachedVault` and `delAll`.
    * Its pure helpers: `deviceRecordOf`, `advancedDeviceRecord` and `highestGateEpochOf`.
    * Its seven generic key-value hooks: `doGet`, `doPut`, `doUpdate`, `doDel`, `doFind`,
      `doDelDamaged` and `doDelAll`.
    * When a store throws something that is not a VaultError, it becomes `storage_blocked` or
      `storage_unavailable`. Only the thrown error's name is kept, with no cause (G8). Its
      sentences are in phrases.ts (`DeviceStoreFailed`) and its factories in refusal-funcs.ts.
  * **`src/devicedb/memory.ts`** (`memoryDeviceDB`) and **`src/devicedb/idb.ts`**
    (`idbDeviceDB`). The idb adapter uses its own database, `<dbName>:devicedb`, store `rows`,
    through idb-keyval. It has no ChangeBell, no inspector and no stray sweep. Neither adapter is
    exported.
  * **The device record**, in models-shapes.ts's new `[The device's forms]`. It is format 8001:
    `{ fmt, applabel, user_id, device_id, highest_gate_epochs: [{ vaultlabel, gate_epoch }] }`,
    strict and frozen, with each vault at most once. It lives at `bank^<applabel>^<user_id>`.
    The section also adds `vaultCacheable`, a filing check of a cached copy.
  * **`Scopepath.withinBankScopepathPrefix(scope)`**, which gives `vault^acme^u1^`.
  * **The Bank.** `hello` advances the device record before warming the listing, and takes the
    stored `device_id`: `#deviceId` plus a `device_id` getter, and the snapshot is remade when the
    id changes. `clearCachedVault(bag)` and `tryClearCachedVault` close the vault, then have the
    deviceDB erase its lease and cached copy. `bankDeviceDB` gains `advanceDeviceRecord` and
    `clearCachedVault`.
  * **Tests**:
    * `tests/devicedb/devicedb.test.ts`: the base class over an open Map double, plus memory
      conformance;
    * `tests/devicedb/idb.test.ts`: the same conformance over fake-indexeddb, a structured-clone
      leaseKey that still unwraps, and blocked stores;
    * `tests/test-helpers/models-device-db.ts`: the shared conformance suite, `modelsLeaseOf` and
      `cacheableOf`;
    * `tests/models/bank-devicedb.test.ts`;
    * the scopepath prefix test.
    * `bank-world.ts` now gives its fake deviceDB a real `memoryDeviceDB` for device records
      (`devices`), and spies for `advanceDeviceRecord` and `clearCachedVault`.

* **Decisions taken**
  * **Copy, not move.** The old `DeviceDB` stays for the old surface until the models reach
    parity, as the handoff directed.
  * **Who judges what.**
    * `getLease` returns the row as stored (`unknown`). The lease judges it (`Lease.get` warns
      and leaves it), so the DeviceDB never deletes a lease row.
    * `findCachedVaults` drops only misfiled rows: a row whose own scope is not the scopepath it
      lies under, or that is no copy at all. It drops them with `doDelDamaged`, which re-checks
      inside the transaction. The listing judges the rest at its hello (`buildableRecord`).
    * The DeviceDB judges the device record itself. A damaged one reads as none, and the next
      advance overwrites it.
  * **The device record is keyed by bank scope**, and epochs are an array, not a record-keyed
    object: the validator rule forbids record-keyed objects.
  * **`clearCachedVault` keeps the device record**, so the rollback guard outlives the copy.
  * **Advance:** the stored sound `device_id` wins, and each vault keeps the max epoch. Over a
    damaged row, the record is stored as it came.
  * **The bank adopts the stored `device_id` at hello.** Before hello, `bank.device_id` is the
    option's, or a fresh one.

* **Deviations**
  * **Generic hooks, not per-kind ones.** The plan's per-kind hooks (`doPutLease` and so on) are
    replaced by seven generic key-value hooks. That gives fewer hooks for an adapter to write,
    and all the judging sits in the base class. Set aside: per-kind hooks mirroring the old
    class, which would have meant three times the adapter code with no gain in safety.
  * **`doDelUnparsed` becomes `doDelDamaged`** in the new DeviceDB only, as directed.
  * **One new export: `Scopepath.withinBankScopepathPrefix`.** The handoff said `src/index.ts`
    changes only by the rename, but `Scopepath` is exported as a namespace, so a new maker in it
    is exported too. Set aside: hand-joining the prefix in devicedb.ts, which would spread
    knowledge of the delimiter outside scopepath.ts. The change is additive, and the changeset
    says so.

* **Discoveries**
  * `modelsRefusalKindVals` (thread 3c's) is not on this base. When the stack is rebuilt, it must
    gain `storage_blocked` and `storage_unavailable`, which the new DeviceDB throws.
  * The raw-transaction `doDelDamaged` in idb.ts resolves when its get succeeds, not when the
    transaction commits. The old `src/idb.ts` does the same.
  * Left for thread 5b, untouched: the `leaseDBFriend()` plumbing, `Lease.get`,
    `takeUpCachedLease`, and the birth-lease G4 fix.

* **For the Coach**
  * **Epoch keyed by vaultlabel.** It is kept across a vault's lives, so a vault deleted and
    remade under the same label starts below the epoch seen and would be refused. Threads 7b/8
    must clear the entry at deletion, or key it by `vault_tok`.
  * **`gate_epoch` or `revision_seq`?** A rollback within one gate epoch goes uncaught by a
    gate_epoch guard. Thread 7 should confirm which counter it wants.
  * **Silent drops.** Misfiled copies and damaged device records are dropped without a word: the
    DeviceDB has no logger.
  * **A provisional `device_id`.** A wayin minted before hello carries the option's `device_id`,
    which hello may then replace.
  * **A copy saved back.** A storable that settles after `clearCachedVault` may save its copy
    back into the cache.
