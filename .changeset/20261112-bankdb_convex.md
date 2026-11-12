---
"safebyok-convex": minor
"safebyok": minor
---

**safebyok-convex stores a bankDB: `ConvexBankDB`, served by `SafebyokBankComponent` from a module of the host's own (`convex/safebyokBank.ts`, reached as `api.safebyokBank`), over five new tables in the component (`safebyok_banks`, `safebyok_gates`, `safebyok_bank_vaults`, `safebyok_bank_boxes`, `safebyok_bank_tallies`).** Each write is one mutation that runs the core's checker and classifier, gate verbs' policy included, and answers with the rows it fetched, which the client classifies to the same outcome. `delBank` stores its tombstone, then deletes the rows under the bank while half a Convex transaction's limits last; what it leaves is unreachable, and `tidyGone` deletes it, on the same budget per call, so a host calls `tidyGone` now and then. A watch hears a `delBank` as the tombstone alone. **Stored format:** new tables beside the vaultDB's, which `ConvexBankDB` never reads; `ConvexVaultDB`, `SafebyokComponent` and their tables are as before. `safebyok/testing` exports the bankDB battery's scopes, records and asks as `BW`.
