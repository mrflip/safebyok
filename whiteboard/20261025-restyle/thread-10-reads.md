# Thread 10: reads (2026-10-26)

Branch `20261026-reads`, PR (opening), stacked on [#280](https://github.com/mrflip/safebyok/pull/280). Justify: green at the
rename milestone (core 3238 passed / 37 skipped, convex 350, graphql 339, postgres 322, react 308,
indexeddb 165, fastkey 49, demo 227, e2e 107, root 265).

* **Built** (so far):
  * **The "props" names are gone** (thread 8's list): `putVaultProps` → `putVaultRecord`,
    `doPutVaultProps` → `doPutVaultRecord`, `meta.vault_props_stored` → `meta.vault_stored`,
    `Refusals.staleVaultProps` → `staleVaultRecord`, `Expectations.vaultPropsPutOf` /
    `vaultPropsRefusalOf` → `vaultRecordPutOf` / `vaultRecordRefusalOf`; Convex's component and
    host `putVaultProps` → `putVaultRecord` (`PutVaultRecordAnswer`), GraphQL's
    `safebyokPutVaultProps` → `safebyokPutVaultRecord`; test helpers likewise; "vault props" prose
    swept from VAULTDB.md (two numbered titles moved: 2.4 "its record and listing together", 3.1 "A
    vault record is created once"), the READMEs and test titles. CHANGELOGs and `notes/` untouched.
* **Decisions taken**:
  * **`putVaultRecord`, not `putVault`**: it replaces the vault record alone, as `putBox` replaces
    one box record; `getVault` and `ensureVault` read and make the whole vault, boxes and all, so
    `putVault` would promise the boxes too.
