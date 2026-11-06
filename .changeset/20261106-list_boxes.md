---
"safebyok": minor
---

**The vaultDB lists a vault's boxes with `listBoxes`, and `getVault` answers the vault row alone.** None of this is exported yet: it is the base class a storage adapter will extend. `listBoxes({ applabel, user_id, vaultlabel, vault_tok })` (and `tryListBoxes`) answers `{ boxes, damaged_records }` with the vault row as `world`, refusing `vault_mismatch` under a `vault_tok` the vault no longer has, as the box verbs do; `getVault` answers the row, with no boxes beside it; `getBank` is renamed `listVaults`. An adapter renames `doGetBank` to `doListVaults`, narrows `doGetVault(scope)` to the vault row, and adds `doListBoxes(query)`, answering `{ vault, boxes }` read in one atomic step. **What a host sees:** a `vault_mismatch` refusal carries the stored row as `meta.dbhas` and `null` as `meta.world`; `vault.hello()` lists its boxes in one call, and refreshing a vault no longer reads every box. **Stored format:** unchanged.
