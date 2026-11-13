---
"safebyok": minor
---

`bank.del(scope)` deletes an unlocked bank, its gate, vaults and boxes, as `bank.listing.del` does, with no passphrase prompt; it no longer refuses `bad_option`. `bank.delPrompt()` is still the way to delete a bank the user must confirm. `gate.del()` still refuses `bad_option`, now from the gate listing, since no bankDB verb deletes a gate alone; on a locked bank it refuses as any del does, asking for the bank unlocked.
