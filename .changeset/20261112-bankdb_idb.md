---
"safebyok-indexeddb": minor
---

**New: `IdbBankDB`** (and `idbBankDB()`), a bankDB in this browser's IndexedDB, beside `IdbVaultDB`: it keeps a bank's bank, gate, vault and box rows in one database named `safebyok-<dbName>:bank-v<version>`, so every database this library writes starts `safebyok-`. It opens a database of its own and reads nothing `IdbVaultDB` wrote.
