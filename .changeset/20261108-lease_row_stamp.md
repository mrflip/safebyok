---
"safebyok-big": minor
---

A lease row cached on this device under another vault's stamp is still forgotten, and `onBadNews` now also hears it as `damaged_lease`, where it passed unremarked. A row of an earlier gate of this vault is forgotten silently, as before.

`onLifecycle`'s `lease_unerased` event says `where: 'undeleted'` in place of `where: 'outdated'`, for a row `Lease.buildFromCache` could not erase.
