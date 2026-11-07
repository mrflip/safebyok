# Thread 2: idb_devicedb (2026-11-07)

Branch `20261107-idb_devicedb`, PR #569, stacked on #568 (thread 3, `20261107-storage_door`), which stacks on #567.
Justify green: core 2,344, indexeddb 107 (2 skipped), postgres 123, convex 227, fastkey 49, graphql 210, e2e 200;
size: idbDeviceDB (core) 7.43 kB of 11, idbVaultDB 1.42 kB of 2.5 (was 2.9).
The plan's thread 2 gloss (`devicedb_idb-plan.md`, about lines 116-160) and the coordinator's two later directives are the authority.

* **Built**:
  * **`IdbDeviceDB` / `idbDeviceDB(opts)`**, `packages/safebyok/src/storage/idb-device-db.ts`, exported from
    `safebyok/browser` with `IdbDeviceDBOpts { dbName? }` (default `'safebyok'`, checked by `objCheck`, `bad_option`). Extends
    `DeviceDB`, writing `doStow`, `doPeek`, `doForget`, `doListLeases`, each one `inOneStep` transaction on an idb-keyval
    store `${dbName}:device-v1` / `leases`, keyed `[applabel, user_id, vaultlabel]`. `doForget` reads and deletes in one
    readwrite transaction. `lease_key` is put as the CryptoKey (structured clone), never bytes.
  * **The wipe**: `deviceShelfOf` wraps the idb-keyval `UseStore`; its first call fires `indexedDB.deleteDatabase` on
    `${dbName}:device_db` and every `${dbName}:device-v<N>` below `DeviceDBVersion`, unread and unawaited, then runs
    the transaction. Errors there (no IndexedDB) reach `troubleOf` through `inOneStep`.
  * **The transaction in the core**: `packages/safebyok/src/storage/idb-transaction.ts` holds `inOneStep` and `rowAt`
    (exported from `safebyok/storage`, section *IndexedDB*), with the private `workOrAbandon`, `abortOf`, `abandon`,
    `troubleOf`. safebyok-indexeddb's `shelf.ts` keeps only its scopepaths, ranges, `shelfOf`, `filedIn`; `idb-vault-db.ts`
    and its test call `DB.inOneStep` / `DB.rowAt`.
  * **`DeviceDB.listRawLeases()` / `tryListRawLeases()`**, `device-db-new.ts`: every row `doListLeases` answers that is a
    plain bag (`isPlainBag` from shapes-core), unchecked, damaged rows included. `listLeases` does not go through it.
  * **Tests**: `tests/storage/idb-device-db.test.ts` runs the battery over fake-indexeddb, plus options, dbName separation,
    the versioned name, the no-IndexedDB refusal, and three wipe cases (deletes the old two; answers while an old database
    is held open, which stays; leaves another dbName's and `:vaults` alone). The battery gains a `listRawLeases()` block
    (a planted damaged row shows there and not in `listLeases`) and `tryListRawLeases` in its storage-fails case.
  * **Ride-alongs**: Lease's verbs are `cache`, `tryCache`, `cacheAsCacheCan`; the friend's is `tryCacheLease`; the deviceDB
    keeps `stow`/`peek`/`forget`/`listLeases`. Slop doc blocks stripped to one line (DeviceDB verbs, Lease caching, the
    MemoryDeviceDB class). Two wontfix entries (damaged lease row, with the Coach's quote and the tabs sentence; a tab
    holding an old device database). The salt check (below). `notes/guarantees.md`'s IndexedDB bullet, leaseKey chain and
    G4 name `lease.cache` and `IdbDeviceDB`. READMEs: the core's host example imports `idbDeviceDB`; its *Not done yet*
    says `safebyok/browser` exports the derivers and the device store; the indexeddb README points triage at `inOneStep`.
  * Changeset `.changeset/20261107-idb_devicedb.md` (minor, safebyok and safebyok-indexeddb). The size-limit line
    `idbDeviceDB (core)`; the old design's `idbDeviceDB` line is left as it is.

* **Decisions taken**:
  * **Known names, not `indexedDB.databases()`**, for the wipe: the versions below the current one are finite and known,
    and `databases()` is missing in older Firefox. A deleteDatabase of a name that does not exist is harmless.
  * **Unawaited deletes**: a blocked delete (a stale tab) must never hold up the store; the wontfix row covers it.
  * **The trouble phrases stay worded for "the vault"** (`NoBrowserStore` and the rest): they read acceptably for the
    lease row too, and thread 3 kept their texts fixed for regex-matching tests. Open matter below.
  * **`rowAt` moved with `inOneStep`**: the device store needs it and it is one line on a store; `filedIn` stays in the adapter.
  * **Salt**: `MinSaltBytes = 16` in `consts.ts`; `salt_b64` is `^[A-Za-z0-9_-]{22,43}$` built from Min/MaxSaltBytes, no
    decode; `keyDeriverShape` asks `salt_bytes` 16 to 32; `Phrases.passphraseSaltShape(min, max)`. Test salts went from
    `'c2FsdA'` (4 bytes) to a 16-byte one.
  * **Thread 3's changeset edited**: its salt sentence (`.changeset/20261107-storage_door.md`) now says 16 to 32 bytes /
    22 to 43 characters, so one release's CHANGELOG does not say two things. Declared here and in the PR.
  * **`failNextCall` opens the database first**: fake-indexeddb runs the upgrade transaction through
    `IDBDatabase.prototype.transaction`, so a one-shot mock would fail the open instead of the call.
  * **Old databases planted closed** in the wipe test: idb-keyval keeps its connection open for the page's life, which
    blocks a delete exactly as a stale tab does; that case is its own test.

* **Deviations**: none from the plan. `notes/security.md` gained an entry, through a sonnet subagent.

* **Discoveries**:
  * The old design's `.size-limit.json` entries all measure under budget but `pnpm size:budget` says "raise" for them;
    not this thread's to move.
  * `packages/safebyok/README.md` *Not done yet* was already stale about the derivers.

* **For the Coach** (open matters):
  * **Argon2id spec minimum**: `MinArgon2SaltBytes` in `src/deriver/` stays 8 (fastkey's reference vectors use 8), so
    `argon2idDeriver({ salt_bytes: 8 })` makes a deriver the Bank refuses. Recommend raising it to 16 and letting the
    vector tests build their spec past the check.
  * **Trouble phrases** say "the vault"; recommend leaving them until a host shows the device store's refusal.
  * **`${dbName}:vaults`** (safebyok-indexeddb) carries no version in its name; recommend the same `-v1` scheme there in its own thread.
  * **The core now depends on idb-keyval** (as the old core did); the front door does not import it.
