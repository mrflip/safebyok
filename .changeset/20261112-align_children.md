---
"safebyok": minor
---

A listing's `lock()` is now `align()`, and returns nothing: it aligns each listed thing, and a listing that no longer answers (its bank ended, or its vault moved to another life) ends its watch. `BankListing.delBank()` is gone: the bank listing's `del(ante)` deletes the bank, as a vault listing's deletes a vault. A disabled device's bank, and the vaults and boxes under it, now refuse with the message of an instance let go rather than the device's own; both refusals are of kind `disabled`, so a host that checks the kind sees no change. The new `Alignable` type names what a bank, vault, gate or box aligns below it.

The lock, call by call. `bank.ensureVault()` no longer needs the bank unlocked: creating a vault seals nothing, so a locked bank will do. `box.put()` (and `putExposed`, `vault.putBox`) and the `del()` of a vault or box now unlock a locked bank first, asking the user if no lease is cached, where they refused `bank_locked` before; a user who dismisses the prompt gets `dismissed`. A listing's own `put` and `del` ask nothing about the lock, and sealing a whisper still refuses `bank_locked`. Vaults, boxes and gates gain `ensureUnlocked()`, which unlocks their bank only if it is locked. `bank.del()` and a gate's `del()` refuse `bad_option` at once: a bank is deleted through `bank.delPrompt()`, its gate with it.
