# Thread 5: idb_versions (2026-11-07)

Branch `20261107-idb_versions`, PR #570, stacked on #569 (thread 2's `20261107-idb_devicedb`). Justify green: core 2,385 tests, indexeddb 110, fastkey 48, postgres 123, convex 227, graphql 210, e2e 200; sizes in budget.

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
* **Rework (the Coach's rulings of 2026-11-07)**, one commit each, in this order
  * Salt that will not decode: `PassphraseProving.buildStored` decodes the stored `salt_b64` through `saltBytesOf` (`models/proving.ts`),
    which refuses `bad_record` (`undecodedSalt`, `Phrases.UndecodedSalt`, no salt text) where `fromB64OrNull` answers null; tests for 25 and 41
    characters and a 22-character salt with stray padding bits, in `tests/models/proving.test.ts`. The record check is unchanged (the Coach: the prover does the later check).
  * `DeviceDB.delRawLease(scope)` and `tryDelRawLease` (vault scope checked at entry), through the new hook `doDelRawLease`, in the memory and IDB stores
    (one transaction); battery cases (a planted damaged row listed, then gone; a no-op where nothing stands; a bad scope); G4 in `notes/guarantees.md`
    names the exception and `notes/wontfix.md` names `delRawLease` as the host's way out.
  * `versionedShelfOf` keeps one shelf per database name in a module Map, so the wipe and the connection happen once per page per database (the first
    spec to ask fixes the `oldnames`); it checks its spec on entry (`objCheck`, `bad_option`: non-empty names, `version` three zero-padded parts);
    `tests/storage/idb-shelf.test.ts`; a `//` comment says a later version format takes a new stem, as unreadable names are deleted.
  * `Patterns` moved to `shapes/primitives.ts` as `{ b64url, label, user_id }`; `LabelPattern` and `UserIdPattern` are gone (neither was exported from an entry point); VOCABULARY.md names follow.
  * A saved Argon2id value: `efb4ef4c...4301b` for 'correct horse battery staple' and `saltOf(16)` at the supplied spec's cost, taken from hash-wasm called
    directly (noble agrees), checked through the core's `argon2idWebV1Deriver` (`tests/browser.test.ts`) and fastkey's `argon2idWasmWebV1Deriver`.
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
  * The two rows that stayed open (a G4 clause, one shelf per `dbName`) are done, as are the four others ruled on 2026-11-07 (see Rework).
