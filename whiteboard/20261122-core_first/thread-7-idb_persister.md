# Thread 7: idb_persister (2026-11-22)

Branch `20261122-idb_persister`, PR opened as a draft, stacked on #848. Proved: `pnpm --filter safebyok-idb-lean` lint, typecheck and test (121 passing); `pnpm justify` at ready.

* **Built**
  * `packages/safebyok-idb-lean/src/idb-persister.ts`: `IdbPersister`, a TanStack `Persister`. Options `recordlabel` (required: the record's key), `dbName`, `throttleMs` (default 1000), `onBadNews`. The snapshot is stored as an object by structured clone, one record per persister.
  * `src/persist-shelf.ts`: its database `safebyok[-<dbName>]:persist-v001-001-001`, object store `clients`, beside the vaultDB's database and separate from it.
  * Removed `IdbMinderBridge`, its tests, its test world (`minder-world.ts`), `phrases.ts` (only the bridge used it) and the README section. Exports now `IdbVaultDB`, `IdbPersister`.
  * Tests (`tests/idb-persister.test.ts`): options, round trip, key isolation, throttle (leading write, then the newest), `removeClient` cancelling a held write, `onBadNews`, and a restore into a fresh `Device` through the plug.
* **Decisions made**
  * Throttle by `es-toolkit`'s `throttle` (already a dependency, leading and trailing edges). TanStack's own throttle sits inside `@tanstack/query-async-storage-persister`, which takes string serialization and would cost a package for a stringify we avoid.
  * `persistClient` is fire and forget: a failed write goes to `onBadNews` as a storage refusal. `restoreClient` and `removeClient` reject with IndexedDB's own error, which the device already reports.
  * Option named `recordlabel`: lint refuses `key` as a name.
  * A separate database over a second store in the vaultDB's: `versionedShelfOf` wipes older databases by stem and the vaultDB's version would then bind the persisters'.
* **Deviations**
  * `IdbVaultDB.overwriteThing` stays (with its tests). It was the bridge's alone; the brief names only the bridge, its tests and its README section. Retire it in a later thread if wanted. README keeps its entry, without the bridge sentence.
* **Discoveries**
  * A throttled trailing write is lost if the page closes first (README says so).
