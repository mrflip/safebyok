---
"safebyok": minor
---

A VaultDB verb now refuses a record that only its names spoil as `bad_record`, as it refuses any record a vault would not build: vault props whose applabel, user_id or vaultlabel is below the name floor, a lockbox whose boxlabel is, or a store handed no lockbox at all, all `bad_label` before. A name handed to a verb on its own or in a scope is still `bad_label`, and so is a name the floor admits but longer than the storage holds, wherever it is. A host that branched on `bad_label` from `fetchOrCreateVaultProps`, `updateVaultProps` or `updateBox` for such a record branches on `bad_record` now; a vault's own calls never build one. The `bad_record` message now leads with what was spared: "Nothing was written", or for a refused retire expectation, "Nothing was removed".
