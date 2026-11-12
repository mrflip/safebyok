# Thread 5b: device_shelf (2026-11-12)

Branch `20261112-device_shelf`, PR #675, stacked on #673. Justify: green (core 3403, indexeddb 378, root 287, every package green).

* **Built**:
  * `dbprefixOf(dbName?)` in `packages/safebyok/src/storage/idb-shelf.ts`, exported from `safebyok/storage`: `safebyok`, or `safebyok-<dbName>`. Every database name is `<prefix>:<store>-v<version>`.
  * `VersionedShelfSpec.dbName` is now `dbprefix` (it never was the host's dbName once `safebyok-` came in). `IdbDeviceDB` (leases `device`, device rows `devicerow`), `browserOpts` and `IdbBankDB` (`bank`, and its bellname `<prefix>:bank`) pass `dbName` through with no `'safebyok'` default.
  * The device row gains `package_version` (`shapes-storage.ts`). `DeviceDB.ensureCachedDevice` offers its row with `PackageVersion`; `MemoryDeviceDB` and `IdbDeviceDB`'s `doEnsureCachedDevice` keep a sound stored row's `device_tok` and rewrite its `package_version` to the offered one, in the same atomic step.
  * `PackageVersion` const in `helpers/consts.ts` (not exported from the package root). `scripts/sync-package-version.ts` rewrites it from `packages/safebyok/package.json`; `pnpm release:version` runs it after `changeset version`, so the Version PR carries it. A core test holds the const to package.json, so a miss is red.
* **Decisions taken**:
  * Version comes from a const plus a sync step, not a build-time `define`: the packages resolve each other's `src/` through the `@safebyok/source` condition in their tests, so a `define` would need adding to every package's vitest config, and an unset one is a ReferenceError at runtime.
  * The bellname is `<prefix>:bank`, like the database name without the layout version (the notice shape has no version of its own).
  * `DeviceRowDBVersion` bumped to `002-001-001`: the row gained a field, and under the default `dbName` the new name equals the old one (`safebyok:devicerow-v…`), so only the version tells the old database from the new.
* **Deviations**: none. `IdbVaultDB` and `shelf.ts` pass `dbprefix: dbName`, so the scaffold's names are unchanged.
* **Discoveries**:
  * Item 3, the layout versions: thread 1's reorder (`86a23dd34`) touched the device row and lease keys. The lease database was bumped to `device-v002` after it (`6b50acf4e`); the device row database (`f8d8cba76`) and the bank database (`57c5c5f94`) were created after it, with the new order. So the reorder needs no bump of its own. The `IdbVaultDB` database (`vaults-v001`) was reordered without a bump; it is the scaffold thread 16 deletes, left alone.
  * With the default `dbName`, the device database's name (`safebyok:device-v002-001-001`) is the same as before, and keeps its leases. A host that passed `dbName: 'acme'` moves from `acme:device-…` to `safebyok-acme:device-…`; the old database is left behind unread, as is every other (the Coach: fine before release). The `oldnames` of the lease shelf (`device_db`, `device-v1`) are now under the new prefix.
  * `browserOpts({ dbName: 'safebyok' })` is now a different scope from `browserOpts()` (`safebyok-safebyok:…`); the test that said they were one bag now says they are not.
* **For the Coach**: README of `safebyok-indexeddb` and `notes/guarantees.md` line on the device database name were updated for the names; thread 17 writes the `dbName` README line (one line: `dbName` scopes the database names, `safebyok-<dbName>:…`, or `safebyok:…` if left out).
