# Thread 5: idb_versions (2026-11-07)

Branch `20261107-idb_versions`, PR to be filed "Stacked on #569" (thread 2's `20261107-idb_devicedb`). Justify green: core 2,359 tests, indexeddb 110, fastkey 47, postgres 123, convex 227, graphql 210, e2e 200; sizes in budget.

* **Built**
  * `packages/safebyok/src/helpers/consts.ts`: `DeviceDBVersion` and `VaultsDBVersion` (both `'001-001-001'`), and `Patterns.b64url`.
  * `packages/safebyok/src/storage/idb-shelf.ts`: `versionedShelfOf({ dbName, dbstem, version, storename, oldnames })`, the one wipe
    mechanism, lifted out of thread 2's `deviceShelfOf`. The device store and `safebyok-indexeddb`'s `shelfOf` both call it, so
    the device database is `${dbName}:device-v001-001-001` and the vault database `${dbName}:vaults-v001-001-001`.
    Exported from `safebyok/storage` with `VaultsDBVersion`.
  * Wipe: on the shelf's first transaction, never awaited, it lists `indexedDB.databases()` and deletes every one of `dbName` that is
    in `oldnames` (`device_db`; `vaults`), or begins `${dbName}:<stem>-v` and either does not end in a three-part version
    (`device-v1`, `device-v0`) or sorts below the current one (zero-padding makes string order version order). A newer version's
    database is left alone, as an updated tab may hold it. Tests over fake-indexeddb, in `idb-device-db.test.ts` and
    `idb-vault-db.test.ts`: old names deleted, newer/other-dbName/other-store left, database named by its version.
  * `deriver/shapes.ts`: the spec floor `MinArgon2SaltBytes` (8) is gone; `salt_bytes` is `gte(MinSaltBytes)` (16), so
    fastkey, which parses with the core's `parseKeyDeriverSpec`, refuses the same specs.
  * `salt_b64` is `str.min(22).max(43).regex(Patterns.b64url)`, each check saying the old `passphraseSaltShape` sentence;
    `b64CharsOf` and `SaltB64Pattern` are removed (nothing else used them). Tests for 21/22/43/44 characters, `+`, `=` and empty.
  * TODO.md (Soonish): the demo must not run the old and new device store under one `dbName`.
  * Changeset `.changeset/20261107-idb_versions.md` (minor: safebyok, safebyok-indexeddb, safebyok-fastkey).
  * Stale names fixed: the indexeddb README (`<dbName>:vaults-v001-001-001`) and the device database's name in `notes/guarantees.md` (a name only, no clause added).
* **Decisions taken**
  * `Patterns` did not exist in the core (only `LabelPattern` and `UserIdPattern`, flat, in `shapes/primitives.ts`); I made `Patterns` a frozen object in `helpers/consts.ts` with `b64url` alone. The other two stay where they are.
  * `MinArgon2SaltBytes` lived in the core's `deriver/shapes.ts`, not fastkey; it was removed in favour of `MinSaltBytes`.
  * The wipe swallows a failure to list databases (no `indexedDB`, or one with no `databases()`), with a comment: it is hygiene, and the next page load tries again. The alternative, awaiting it, would fail the vault's first call over a leftover.
  * The vault wipe leaves the device store, and the device wipe the vault store, by name (`device_db`, `vaults` are each owned by one stem).
* **Deviations**
  * The Argon2id reference vector (8-byte salt "somesalt") cannot go through either deriver now. Rather than build a spec past the check, fastkey's test asks hash-wasm directly with the vector's parameters, and a new test in the core's `tests/browser.test.ts` asks noble directly, so neither implementation's half of the vector is dropped. What is lost: the vector no longer exercises the derivers' option mapping; `SameBytesCases` (deriver against deriver at 16 and 32 bytes) still does. fastkey's "Argon2id's shortest salt" case is dropped (it is now the default's 16).
* **Discoveries**
  * The demo's `safebyok_demo:device_db` is the old core's live database; the new device store would wipe it (the TODO row).
  * `indexedDB.databases()` is the only way to find "any older version" now that versions are strings; fake-indexeddb supports it, as do the evergreen browsers.
* **For the Coach**
  * Two open rows stay open, untouched: a G4 clause in `notes/guarantees.md`, and one IndexedDB shelf per `dbName`.
