---
"safebyok": minor
---

A listing's `lock()` is now `align()`, and returns nothing: it aligns each listed thing, and a listing that no longer answers (its bank ended, or its vault moved to another life) ends its watch. `BankListing.delBank()` is gone: the bank listing's `del(ante)` deletes the bank, as a vault listing's deletes a vault. A disabled device's bank, and the vaults and boxes under it, now refuse with the message of an instance let go rather than the device's own; both refusals are of kind `disabled`, so a host that checks the kind sees no change. The new `Alignable` type names what a bank, vault, gate or box aligns below it.
