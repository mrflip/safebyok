---
"safebyok-big": minor
"safebyok-react": minor
"safebyok-convex": minor
"safebyok-indexeddb": minor
"safebyok-postgres": minor
"safebyok-graphql": minor
---

The public surface changed: `vault.tryDelDamagedBox`, `isDamagedBoxAt` and `isDamagedVaultAt` are gone. A row that fails its checks now stays until the host clears it with its store's own tools: a damaged box row stays listed in `damaged_rows` and refuses `damaged_row`, and a damaged vault row stops `delVault`.
