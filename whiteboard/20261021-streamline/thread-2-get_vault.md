# Thread 2: get_vault (2026-10-22)

Branch `20261022-get_vault`, PR [#244](https://github.com/mrflip/safebyok/pull/244), stacked on
#243. Justify: green (root 265; core 2769, 37 skipped; convex 311; postgres 297; graphql 300; indexeddb 156; react 287; fastkey 49; demo 214; e2e 100, 109 skipped); size budgets moved: `idbVaultDB` 2.5 to 2.7 kB, `reactEverything` 9.1 to 9 kB. Live-service suites (`SAFEBYOK_PG_URL`, a Convex deployment) skip
here; CI's live Postgres job runs them.

* **Built**:
  * `VaultProps` is a union (`packages/safebyok/src/types.ts`): `GatedVaultProps` (`gate_epoch`
    >= 1, a passphrase, a passkey or null) or `GatelessVaultProps` (`gate_epoch` 0, `passphrase`
    and `passkey` null). Gated epoch with no passphrase is neither: the door still refuses it.
    `isGated` tells them apart. Format stays `safebyok-vault-v6`; its schema snapshot is rewritten.
  * `VaultDB.getVault(scope)` / `ensureVault(scope, draft)` resolve `ListedVault`
    (`{ vaultProps, boxes }`) from new abstract hooks `doGetVault` / `doEnsureVault`, each a
    `StoredVault` from one atomic step. `ensureVault` takes a gateless draft naming `scope` only.
  * `getVaultRecords` / `ensureVaultRecords`: the same read, boxes as `listBoxRecords` hands them
    on, so a server (GraphQL resolvers, the Postgres route recipe, the demo's outage adapter)
    serves a browser's VaultDB one request per vault read.
  * `putVaultProps`' `stale_write` carries `meta.vault_props_stored` (winner, checked as a read,
    or null; damaged standing props refuse as a read would). Adapters throw
    `Refusals.staleVaultProps(standing)`, key-value ones through `Expectations.vaultPropsRefusalOf`.
    A `false` from `doPutVaultProps` is `corrupt_record`.
  * `VaultPropsExpectation.gate_epoch` admits 0: the first gate is `putVaultProps` at 1 expecting 0.
  * Adapters: local (one sync step), IndexedDB (one transaction over its one store), Postgres (one
    statement each: `GetVaultSql`, `EnsureVaultSql`, and `PutVaultPropsSql` reading the row
    `FOR UPDATE` so a miss names the winner; `passphrase` column now nullable), Convex
    (`getVault` query, `ensureVault` mutation, `PutVaultPropsAnswer`), GraphQL
    (`safebyokGetVault`, `safebyokEnsureVault`, `SafebyokVault`, nullable `passphrase`).
  * VAULTDB.md line 2.4 (*A vault is read in one step, its props and listing together*), 3.1 and
    3.2 extended; conformance checks `readBesideRemake` (2.4), `rivalEnsures` (3.1),
    `rivalFirstGates` (3.2), the loser of `rivalVaultPropsUpdates` naming the winner; the
    unguarded test adapter gains `readsApart`, which the battery now catches.
* **Decisions taken**:
  * Meta named `vault_props_stored`, not `props_stored`: the cast word is "vault props", as
    `box_stored` is "box".
  * `ensureVault` refuses a gated draft (`bad_record`): a vault is ensured gateless, its gate made
    by unlock. Its `scope` argument is redundant with the draft's; a mismatch is `bad_record`.
  * `Refusals.staleWrite('vaultProps')` is gone (`StaleWriteVals` is `['del']`).
  * Convex's stored validator is one object with a nullable passphrase, not a union of two: the
    core tells the shapes apart. Its `ensureVault` argument is the strict gateless validator.
  * The vault strips `vault_props_stored` from the stale write it rethrows from `putWayin` /
    `delWayin`: its own refusal carries no stored vault props record, as `notes/security.md`'s
    a_sec2 entry asks of the vault's surface. The VaultDB layer carries the whole record, as
    `box_stored` does.
  * The vault still calls the old verbs. Until thread 4 it reads gateless props as no vault
    (`absent`), and a first unlock over gateless props made elsewhere refuses
    `created_elsewhere` ("has not set its passphrase yet"), writing nothing. Unreachable in-tree:
    nothing writes gateless props until thread 4 calls `ensureVault`.
* **Deviations**:
  * Postgres reads and ensures in one statement, not one transaction: its driver seam is one
    statement at a time, and one statement is one snapshot.
  * IndexedDB holds every row in one object store, so "one transaction over both stores" is one
    transaction over its one store.
* **Discoveries**:
  * Postgres's `ensureVault` over props another device created after the statement's snapshot
    began returns those props (by `ON CONFLICT`, as they stand) with the listing as of the
    snapshot, filtered to their `vault_tok`: the listing may lag, never names another vault.
    Flagged, not solved; written into VAULTDB.md 2.4 and `notes/security.md`.
  * Existing Postgres tables keep `passphrase NOT NULL` (`VaultTablesSql` never alters a table):
    the changeset tells hosts to `ALTER ... DROP NOT NULL`. Until they do, `ensureVault` fails.
  * The device mark's `seen.gate_epoch` is still positive-only: a novel vault (epoch 0) cannot be
    marked. Thread 4/5's concern (thread 5 removes the mark).
* **For threads 3-4**: `hello` reads `getVault`; birth calls `ensureVault(scope, draft)`; the
  gate's first write is `putVaultProps(gated, { vault_tok, gate_epoch: 0 })`, and its loser's
  `err.meta.vault_props_stored` is the winner to commit. Expected to go once unused:
  `ensureVaultProps` (thread 4), then `getVaultProps`, `listBoxes`, `listBoxRecords` and their
  hooks across every adapter (with `delDamagedVault` reading `doGetVault`); the interim
  `gatelessElsewhereError` and the gateless-as-absent read in `vault.ts` (thread 4).
* **Contract lines this makes untrue** (for thread 10): `RefusalMeta.vault_props_stored` (now a
  `putVaultProps` stale write's winner, not a relock's); the `VaultDB` interface (no `getVault`,
  `ensureVault`, records verbs; `ensureVaultProps(scope, props)` signature); its
  `ensureVaultProps` line; `vault_mismatch`'s `vault_props_stored` (never carried); `stale_write`'s
  row (winner is `box_stored` or `vault_props_stored`).
* **For the Coach**: see the PR's *Open questions*.
