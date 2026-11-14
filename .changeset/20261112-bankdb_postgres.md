---
"safebyok-postgres": minor
"safebyok-big": minor
---

**safebyok-postgres stores a bankDB: `PostgresBankDB`, over four tables (`safebyok_banks`, `safebyok_gates`, `safebyok_vaults`, `safebyok_boxes`) and the functions that write them, shipped as `bank-tables.sql` and `bank-functions.sql` (`BankTablesSql`, `BankFunctionsSql`).** Each gate, vault and box row has a foreign key to its bank row; `delBank` deletes everything under the bank in the function that stores its tombstone, and its notice is the tombstone's alone. Listen on `bankChannelOf(user_id)`. **Stored format:** new tables; a host runs the two new files, and nothing in the vaultDB's tables is read by `PostgresBankDB`. A host moving over drops the vaultDB's tables and functions first (the removal of the vaultDB says how), and its rows are gone. `safebyok/testing` exports the bankDB battery's scopes, records and asks as `BW`.
