---
"safebyok-convex": patch
"safebyok-graphql": patch
"safebyok-indexeddb": patch
"safebyok-postgres": patch
"safebyok-react": patch
---

Exported signatures name safebyok-big's aliases (UserID, Banklabel, Vaultlabel, Boxlabel, BankTok, VaultTok, EpochMillis) where they typed a bare string or number. The types are the same to the compiler, and nothing changes at runtime.
