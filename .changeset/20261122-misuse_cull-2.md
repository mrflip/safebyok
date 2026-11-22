---
"safebyok-postgres": patch
---

`PostgresVaultDB.tryListThings`, refused because the parent is void or gone, carries the `read_tc` of the read that found the parent so, as a good listing does. A listing refused for any other reason still has none.
