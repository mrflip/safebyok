---
"safebyok-big": patch
---

The options of a box's or vault's get and put name the age of the parent row `maxParentMillis`, not `maxWorldMillis`.

`listing.isListed(thing)` is now `listing.isKept(thing)`: it is true of a deleted instance kept at its scope, which is not in the listing's list.

A prompt (`unlock`, `ensureUnlocked`, the gate's prompts) fetches the gate again only when the copy in hand is over an hour old, not over two seconds.
