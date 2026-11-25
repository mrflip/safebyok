---
"safebyok-postgres": patch
---

`PostgresVaultDB`'s watch no longer drops a notice, a fetched Thing or a failure that lands after its stop function has run: one in flight at the stop may still reach the watch's handlers (notes/wontfix.md). Two notices' fetches that fail together in a way a retry would not mend now each tell `onBadNews`, where before only the first did.
