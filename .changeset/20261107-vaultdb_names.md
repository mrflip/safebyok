---
"safebyok-big": minor
---

safebyok/storage renames the base class a storage adapter extends from VaultDB to AdapterVaultDB, and its options VaultDBOpts and vaultDBOpts to AdapterVaultDBOpts and adapterVaultDBOpts. The interface a bank takes, VaultDBVerbs, is now VaultDB, from safebyok and safebyok/storage alike; no alias keeps the old names. A new brand, IsAdapterVaultDB, is answered by an AdapterVaultDB and its subclasses alone, and safebyok/storage exports it with its guard isAdapterVaultDB, beside IsVaultDB and its guard isVaultDB, now exported too.
