---
"safebyok": patch
---

The warning a retirement gives when it removed another revision than the one it showed now says when the lockbox the vault showed was a damaged one. Both `Vault.retireBox()` and the retirement a `storeBox()` makes first over a damaged lockbox naming no revision log through the host's logger with `damaged: true` in the story beside `call`, and `retireBox()`'s message says the lockbox shown was damaged, so a host can tell a lost write over a damaged record from one over a sound one. Neither names a revision, a boxlabel or a secret. A retirement over a sound lockbox warns as before, with no `damaged` field. Nothing stored changes.
