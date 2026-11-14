---
"safebyok-big": minor
"safebyok-indexeddb": minor
"safebyok-postgres": minor
"safebyok-convex": minor
"safebyok-react": minor
---

The VaultDB is gone; the BankDB, which replaced it, is the one storage contract. Removed from `safebyok`: the `VaultDB` and `AdapterVaultDB` types, `MemoryVaultDB` (in `safebyok/storage`), `VaultsDBVersion`, the vault-world asks and rows (`VaultRow`, `vaultRow`, `boxRow`, `Gate` and the like), the wire checks `crossedErr` and `CrossedErr`, `BankBadAct` (its acts are now part of `BadAct`), and `world` as a field of an answer or of a refusal's rows: the BankDB's answers carry `parent`. Removed from the adapters: `IdbVaultDB` and `idbVaultDB` (`safebyok-indexeddb`), `PostgresVaultDB` and its SQL files (`safebyok-postgres`), `ConvexVaultDB` and `SafebyokComponent` and the `SafebyokApi` type (`safebyok-convex`), and `DevVaultDBInspector` (`safebyok-react/devmode`). Build on `IdbBankDB`, `PostgresBankDB`, `ConvexBankDB` and `SafebyokBankComponent`. A host that implements `VaultDB` implements `BankDB` instead.

What a host does about stored rows. IndexedDB: the databases named `<dbName>:vaults-v...` are no longer read or swept, and a host deletes them if it wants them gone. Postgres: the vault tables and functions are no longer read, and the bank tables use the names `safebyok_vaults` and `safebyok_boxes` with other columns, so `CREATE TABLE IF NOT EXISTS` leaves an old table as it was: drop `safebyok_boxes`, `safebyok_vaults` and every `safebyok_` function first, then let the package create its own. Convex: the component's tables lose the `bank_` in their names (`safebyok_bank_vaults`, `safebyok_bank_boxes` and `safebyok_bank_tallies` are `safebyok_vaults`, `safebyok_boxes` and `safebyok_tallies`), and the vault tables that held those names are gone. Convex refuses to deploy a schema that does not match the stored rows, or that drops a table with rows in it, so empty every table of the `safebyok` component on the dashboard before deploying this release, the bank and gate tables too. Until 1.0 nothing migrates: what those tables held is lost, so export what you need first.
