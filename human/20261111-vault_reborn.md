# 2026-11-11: vault_mismatch is vault_reborn, and a seq goes on across a rebirth

PR for the thread `20261111-vault_reborn`. Two commits: the notes, then the rename.

- **The rename.** The refusal kind `vault_mismatch` is `vault_reborn`, with its thrower (`vaultReborn`) and sentence. It stays a condition.
- **One use is a different thing.** `delOfOtherLife` in `VaultListing.tryDel` ("a delete named a different life of the vault than the life in its slot") refuses before anything is sent. It read `vault_mismatch` and now reads `vault_reborn`. If it should be its own kind, or `stale_write`, say so.
- **The work that follows a `vault_reborn` is not done by the models yet.** The vaultDB puts the other life's row in `dbhas` with no world, and the box listing drops it. The Vault object is replaced only when the vault listing next hears of its own row. The receive contract's W2 ("a live row under another `vault_tok`, newer") is what does the work at once, and it is not wired.
- **The notes.** The answer contract says a seq goes on across a rebirth, by the Coach's ruling, and carries the Coach's hand edits that take "gate" out of the vault checks.
