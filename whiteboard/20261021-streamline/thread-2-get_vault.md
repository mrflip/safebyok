# Thread 2: get_vault (2026-10-22)

Branch `20261022-get_vault`, PR pending, stacked on #243. Justify: core green (2769 passed, 37
skipped); adapters in progress.

* **Built**:
  * `VaultProps` is now a union (`packages/safebyok/src/types.ts`): `GatedVaultProps`
    (`gate_epoch` >= 1, a passphrase, a passkey or null) or `GatelessVaultProps` (`gate_epoch` 0,
    `passphrase: null`, `passkey: null`). A record at a gated epoch with no passphrase is neither,
    so the door still refuses it. `isGated` tells them apart. Format stays `safebyok-vault-v6`;
    its schema snapshot is rewritten in place.
  * `VaultDB.getVault(scope)` and `VaultDB.ensureVault(scope, draft)` (`src/vault-db.ts`) resolve
    a `ListedVault`, `{ vaultProps, boxes }`, from the adapter's new hooks `doGetVault` and
    `doEnsureVault`, each answering a `StoredVault` from one atomic step. `ensureVault` takes a
    gateless draft only, naming `scope` (`bad_record` otherwise).
  * `getVaultRecords` / `ensureVaultRecords`: the same read with the boxes as `listBoxRecords`
    hands them on, for a server to serve a browser's VaultDB (GraphQL, the Postgres route recipe).
  * `putVaultProps`' `stale_write` carries `meta.vault_props_stored` (the winner, checked as a
    read checks it, or null); adapters throw `Refusals.staleVaultProps(standing)`, key-value ones
    via `Expectations.vaultPropsRefusalOf`. A `false` from `doPutVaultProps` is `corrupt_record`.
  * `VaultPropsExpectation.gate_epoch` admits 0, so the first gate is `putVaultProps` at epoch 1
    expecting 0 (tested in the conformance suite, with its race `rivalFirstGates`).
  * VAULTDB.md line 2.4 (*A vault is read in one step, its props and listing together*), 3.1 and
    3.2 extended; conformance races `rivalEnsures`, `readBesideRemake`, `rivalFirstGates`.
* **Decisions taken**:
  * Meta field named `vault_props_stored`, not `props_stored`: the cast word is "vault props",
    as `box_stored` is "box".
  * `ensureVault` refuses a gated draft: a vault is ensured gateless, its gate made by unlock.
  * `Refusals.staleWrite('vaultProps')` is gone (`StaleWriteVals` is `['del']`): every vault props
    stale write now carries what stands.
  * The vault (`vault.ts`) still calls the old verbs. Until thread 4 it reads gateless props as
    no vault yet (`absent`), and a first unlock over gateless props made elsewhere refuses
    `created_elsewhere` ("has not set its passphrase yet"), writing nothing.
* **Deviations**:
  * Postgres reads and ensures in one statement, not one transaction: the adapter's driver seam
    is one statement at a time (`PostgresClient.query`), and one statement is one snapshot.
  * IndexedDB holds every row in one object store, so "one transaction over both stores" is one
    transaction over its one store.
* **For the Coach**: see the PR's *Open questions*.
