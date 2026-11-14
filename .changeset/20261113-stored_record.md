---
"safebyok-big": minor
"safebyok-indexeddb": minor
"safebyok-postgres": minor
"safebyok-convex": minor
"safebyok-graphql": minor
---

**A bankDB's answer to a write carries the stored record**: the row the datastore reports writing, rather than the record the caller sent. Memory answers its copy, IndexedDB the object read back in the same transaction, Postgres the row each write statement returns, Convex the document read back after it is written, and GraphQL passes its server's answer through. **A subclass of `AdapterBankDB` must do the same**: the classifier now returns the rows fetched under every act, so each write step answers the rows its datastore reports storing, checked by `writtenBankOf`, `writtenGateOf`, `writtenVaultOf` or `writtenBoxOf` (`safebyok/storage`). Where the stored record disagrees with the record sent in scope, revision or life, the delivery refuses `storage_issue`, as before. **The Postgres bank functions changed**: rerun `BankFunctionsSql` (`safebyok-postgres`). **The Convex component's write mutations answer `written`** (the rows read back after the write, or null where nothing was written), and `buildBank` answers the new `bankBuilt` shape: redeploy the component. **`safebyok/testing`** gains `storedOtherwiseOf` and `StoredOtherwiseSuffix`, and the bankDB battery an optional `_cheat_storeOtherwise` hook, which registers its cases of a datastore that stores other than the record sent. Stored format: unchanged.
