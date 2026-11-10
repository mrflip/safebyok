---
"safebyok": minor
---

**`vault.del()` no longer asks for the passphrase**: it deletes the vault through its listing, locked or not, leaving a tombstone in its slot. `vault.delVaultPrompt()` is the call that asks the user, through a `del_vault` gating whose run locks the vault and then calls `vault.del()`; a host that called `vault.del()` to prompt calls `delVaultPrompt()`. **`BoxSnapshot` has `isLocked`**, true while the box's vault is locked: a lock or an unlock gives each listed box a new snapshot and tells its listeners once. `box.subscribe` tells of the box's own changes, a lock among them, and no longer enrols the listener on the vault as well. **Stored format:** unchanged.
