---
---

Empty: the new `safebyok` is private and the giver is not yet exported. What a caller of `ThingMinder` will see: `queryKey(scoped)` is now `['safebyok', userid, banklabel, ...labels, '!']`, the labels separated by `'/'` segments and the key ending `'!'` where it ended `'.'`; `listingQueryKey(scoped)` and `subtreeQueryKey(scoped)` are new, the second a key prefix that every key under a Thing starts with and neither of the Thing's own does. `BoxLabelpath` is exported from `safebyok` (and `safebyok/core`, `safebyok/storage`) beside `Labelpath`, whose companion gains its guard `Labelpath.isBox`, and `ThingAt` reads the same type; the giver drops its own.
