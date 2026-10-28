---
"safebyok-graphql": patch
"safebyok-postgres": patch
"safebyok-indexeddb": patch
"safebyok-convex": patch
"safebyok-react": patch
---

`safebyok-graphql`'s `ServedVaultDB` names the `try` forms of the VaultDB verbs the resolvers serve (`tryGetVaultRecords`, `tryGetBox`, ...), as `safebyok`'s rename of the stores' verbs has them; a server handing the resolvers a VaultDB of its own needs nothing but a VaultDB. `safebyok-postgres`'s README route recipe calls the `try` forms. The other packages' tests follow the rename; nothing they ship changes.
