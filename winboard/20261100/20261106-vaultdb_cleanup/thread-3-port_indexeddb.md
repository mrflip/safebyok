# Thread 3: port_indexeddb (2026-11-06)

Branch `20261106-port_indexeddb`, PR #560, stacked on #558. Justify: green (root 311; safebyok
2268; safebyok-indexeddb 106 passed, 2 skipped; safebyok-idb-old 167/11 skipped; every other
package as on #558; lint 0 errors; size ok, idbVaultDB 1.89 kB of 2.9 kB).

* **Built**:
  * `packages/safebyok-idb-old` (commit 64ffb8f6c): the old adapter, `git mv`ed whole, private,
    on safebyok-old. The demo imports `idbVaultDB` and `inspectIdbVaultDB` from it. No changeset
    (private).
  * `packages/safebyok-indexeddb`, written fresh on `VaultDB` from `safebyok/storage`: `IdbVaultDB`,
    the factory `idbVaultDB(opts)`, `IdbVaultDBOpts` (`dbName`, plus the VaultDB's `maxRecordBytes`).
    `src/shelf.ts` holds the store layout (array scopepaths, key ranges), `inOneStep` (one
    transaction, aborted if the work throws, awaited to commit) and `troubleOf` (IndexedDB's
    errors into refusals). `src/idb-vault-db.ts` is the ten `do*` methods, each one transaction,
    deciding with the core's predicates as `memory-vault-db.ts` does. Watch is a BroadcastChannel
    named for the database, rung only after a commit.
  * Core (`api:` commit): `storageFull(cause)` thrower and its phrase (a `vault_full` for a write
    storage had no room for), and `Checker`, `Checkers`, `objCheck` exported from
    `safebyok/storage`.
  * Tests: the battery (`makeTwin` and `_cheat_failNextCall` given), plus options, separate
    databases, user ids sharing a prefix, a twin's write heard, and the triage table
    (QuotaExceeded, InvalidState, Security, other; commit-time abort; no IndexedDB).
  * Tooling back on the new package: changeset `fixed` group, size line (`ignore` now
    `safebyok`, budget 2.9 kB by the rule), root `size` script builds `safebyok` too.
  * Fresh README, written as the key-value adapter template PROCESS.md says it is.
* **Decisions taken**:
  * Database `<dbName>:vaults`, store `rows`, keys `['vault', applabel, user_id, vaultlabel]` and
    `['box', applabel, user_id, vaultlabel, vault_tok, boxlabel]`. A new name, since idb-keyval
    never upgrades a database it finds (the old one is `<dbName>:vault_db`, store `records`).
    Boxes filed under their life make `doListBoxes` one range and `doDelVault` one range.
  * `isPutAllowed` is a local copy of memory's three-line predicate rather than a core export,
    to keep the core diff small beside threads 4 and 6 (open matter).
  * A put inside the transaction is not awaited request by request: a failure surfaces at
    commit, as the transaction's `abort` with its error, and `inOneStep` throws that.
  * Quota → `vault_full` through the new `storageFull`; the old `storage_blocked` kind is gone from
    the core. Closed database, aborted transaction, withheld storage, no IndexedDB → each
    `storage_unavailable` with its own sentence.
  * No inspector, no logger option, no box cap (`makeCappedVaultDB` not given, 2 battery cases
    skip). The demo keeps the old inspector through safebyok-idb-old.
* **Approaches set aside**: `committed.catch(() => undefined)` to swallow a dangling rejection
  (lint's `prefer-await`, and murkier): `abortOf` resolves to the abort error or null instead.
  A counter for test database names (lint's top-level assignment): `crypto.randomUUID()`.
* **Deviations**: `notes/guarantees.md` and STYLE.md each named safebyok-indexeddb in a sentence my
  move made false; one word each changed (`safebyok-idb-old`; dropped the `idbOpts` example).
* **Discoveries**:
  * idb-keyval 6.3 forgets a rejected open (`dbp = undefined`), so a failed open is retried on
    the next call; not cached, as I first feared.
  * `pnpm size:budget` shows most other budgets sit below what the rule would now set; I set only idbVaultDB's.
  * `git stash` in a worktree uses the shared stash stack: do not.
* **For the Coach**: whether dropping the inspector is right (the demo still has the old one);
  whether `isPutAllowed` should become a core export once threads 4 and 6 land.
