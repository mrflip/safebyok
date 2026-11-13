---
"safebyok": patch
---

The options of a box's or vault's get and put name the age of the parent row `maxParentMillis`, not `maxWorldMillis`.

`listing.isListed(thing)` is now `listing.isKept(thing)`: it is true of a deleted instance kept at its scope, which is not in the listing's list.
