# Thread 5: bankdb_idb (2026-11-12)

Branch `20261112-bankdb_idb`, PR #TBD, stacked on [#666](https://github.com/mrflip/safebyok/pull/666) (thread 4b). Justify: green.

* **Built**: `IdbBankDB` and `idbBankDB()` in `packages/safebyok-indexeddb/src/idb-bank-db.ts`, its shelf and scopepaths in
  `bank-shelf.ts`, tests in `tests/idb-bank-db.test.ts`. Both src files and the test began as verbatim copies of
  `idb-vault-db.ts`, `shelf.ts` and `idb-vault-db.test.ts` (commit 105fbac7a), so `git diff 105fbac7a` shows the edit.
  The 13 `do*` calls mirror `MemoryBankDB`, each one IndexedDB transaction (fetch, classify, store).
  It passes `describeBankDBBattery` with `makeTwin`, `makeCappedBankDB` and `_cheat_failNextCall` (no `makeBankDBFor`: no
  identity; no `_cheat_adapterOf`). A changeset (safebyok-indexeddb minor) and a README paragraph.
* **Scopepaths**: `['bank',u,b]`, `['gate',u,b,gatelabel]`, `['vault',u,b,vaultlabel]`,
  `['box',u,b,vaultlabel,bank_tok,vault_tok,boxlabel]`. Both toks are in the box key, so a box row of another pair of lives is
  at another key and an `ifAbsent` put cannot overwrite it. `delBank` deletes the gate, vault and box ranges of the bank;
  `delVault` deletes the box range of that life. A cascade rings no notice.
* **Database name**: `safebyok-<dbName>:bank-v001-001-001` (the shelf's `dbName` is `safebyok-${dbName}`, stem `bank`, no
  `oldnames`). `BankDBVersion` is a constant in `bank-shelf.ts`, not the core's `consts.ts`, to keep the core untouched.
* **Decisions taken**: `isLifeOver` (a vault row missing, a tombstone or of another life; false for a row that fails its
  checks) is copied from `memory-bank-db.ts`; it is private there. `doTidyGone` copies memory's too: it sweeps vault rows of
  an ended bank life, then box rows whose life is over. A notice's `parent` is `stored.parent`.
* **Deviations**: one core test-helper line: `packages/safebyok/tests/test-helpers.ts` now exports
  `BankDBWorld` (`export * as`, the bankdb-world records and asks), because a package's tests reach helpers only through
  `safebyok/testing` and its names collide with storage-world's. `IdbVaultDB` and `shelf.ts` untouched (thread 16).
* **Discoveries**: the default `dbName` `'safebyok'` gives the database `safebyok-safebyok:bank-...`, as the Coach's
  `safebyok-<dbName>` pattern says; see For the Coach. The `vault_full` refusal is still the kind for a full box cap.
* **For the Coach**: (1) the doubled `safebyok-safebyok` of the default; recommend leaving it, or defaulting `dbName` to
  something else when thread 5b settles the device database's prefix. (2) Export `isLifeOver` from the core's `BX` so both
  adapters share it? Recommend yes in a later thread (it is five lines).
